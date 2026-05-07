/**
 * OpenRouter Image Generation Adapter
 *
 * OpenRouter does not expose `/v1/images/generations` — image-output models
 * are driven via `POST /v1/chat/completions` with a normal user message. The
 * assistant message returns base64 data URLs in `choices[0].message.images[]`.
 *
 * Verified models (catalog filter: output_modalities=image, 2026-05-07):
 *   google/gemini-2.5-flash-image
 *   google/gemini-3.1-flash-image-preview
 *   google/gemini-3-pro-image-preview
 *   openai/gpt-5-image
 *   openai/gpt-5-image-mini
 *   openai/gpt-5.4-image-2
 */

import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';
import {
  OPENROUTER_DEFAULT_BASE_URL,
  getOpenRouterRankingHeaders,
  normalizeBaseUrl,
} from '@/lib/ai/openrouter';

const DEFAULT_MODEL = 'google/gemini-2.5-flash-image';

function buildPrompt(options: ImageGenerationOptions): string {
  const parts = [options.prompt];
  if (options.negativePrompt) {
    parts.push(`Avoid: ${options.negativePrompt}`);
  }
  if (options.aspectRatio) {
    parts.push(`Use a ${options.aspectRatio} aspect ratio.`);
  }
  if (options.style) {
    parts.push(`Style: ${options.style}.`);
  }
  return parts.join(' ');
}

interface OpenRouterImageMessage {
  role?: string;
  content?: string;
  images?: Array<
    | string
    | {
        type?: string;
        image_url?: { url?: string } | string;
      }
  >;
}

function extractImagePayload(
  message: OpenRouterImageMessage | undefined,
): { url?: string; base64?: string } | null {
  const images = message?.images || [];
  for (const item of images) {
    let urlField: string | undefined;
    if (typeof item === 'string') {
      urlField = item;
    } else if (typeof item.image_url === 'string') {
      urlField = item.image_url;
    } else if (item.image_url && typeof item.image_url === 'object') {
      urlField = item.image_url.url;
    }
    if (!urlField) continue;
    if (urlField.startsWith('data:')) {
      const commaIdx = urlField.indexOf(',');
      if (commaIdx > 0) {
        return { base64: urlField.slice(commaIdx + 1) };
      }
    }
    return { url: urlField };
  }
  return null;
}

export async function testOpenRouterImageConnectivity(
  config: ImageGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const baseUrl = normalizeBaseUrl(config.baseUrl, OPENROUTER_DEFAULT_BASE_URL);
  try {
    // /key returns ~200 bytes of auth + rate-limit info; cheaper than fetching the model list
    // just to validate credentials.
    const response = await fetch(`${baseUrl}/key`, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...getOpenRouterRankingHeaders(),
      },
    });
    if (response.ok) {
      return { success: true, message: 'Connected to OpenRouter Image' };
    }
    const text = await response.text().catch(() => response.statusText);
    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        message: `OpenRouter Image auth failed (${response.status}): ${text}`,
      };
    }
    return {
      success: false,
      message: `OpenRouter Image API error (${response.status}): ${text}`,
    };
  } catch (err) {
    return { success: false, message: `OpenRouter Image connectivity error: ${err}` };
  }
}

export async function generateWithOpenRouterImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const baseUrl = normalizeBaseUrl(config.baseUrl, OPENROUTER_DEFAULT_BASE_URL);
  const width = options.width || 1024;
  const height = options.height || 1024;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...getOpenRouterRankingHeaders(),
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODEL,
      modalities: ['image', 'text'],
      messages: [
        {
          role: 'user',
          content: buildPrompt(options),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`OpenRouter image generation failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: OpenRouterImageMessage }>;
  };
  const message = data.choices?.[0]?.message;
  const payload = extractImagePayload(message);
  if (!payload) {
    throw new Error(
      'OpenRouter Image returned no image — confirm the model id supports image output',
    );
  }

  return {
    url: payload.url,
    base64: payload.base64,
    width,
    height,
  };
}
