/**
 * OpenAI Image Generation Adapter
 *
 * Uses the OpenAI Images API.
 * Endpoint: https://api.openai.com/v1/images/generations
 *
 * Refactored to use shared openai-compatible base.
 */

import { createOpenAICompatibleAdapter } from './openai-compatible-base';
import type { ImageGenerationConfig } from '../types';

const adapter = createOpenAICompatibleAdapter({
  name: 'OpenAI Image',
  defaultModel: 'gpt-image-2',
  defaultBaseUrl: 'https://api.openai.com/v1',
  endpoint: '/images/generations',
  extraBodyParams: (options) => ({
    size: `${options.width || 1024}x${options.height || 1024}`,
  }),
  // OpenAI uses a GET /models/{model} endpoint for connectivity
  // (not the standard POST with empty prompt)
  testConnectivity: async (
    cfg: ImageGenerationConfig,
  ): Promise<{ success: boolean; message: string }> => {
    const baseUrl = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = cfg.model || 'gpt-image-2';
    try {
      const response = await fetch(
        `${baseUrl}/models/${encodeURIComponent(model)}`,
        {
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
          },
        },
      );
      if (response.ok) {
        return { success: true, message: 'Connected to OpenAI Image' };
      }
      const text = await response.text().catch(() => response.statusText);
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          message: `OpenAI Image auth failed (${response.status}): ${text}`,
        };
      }
      if (response.status === 404) {
        return {
          success: false,
          message: `OpenAI Image model not found: ${model}`,
        };
      }
      return {
        success: false,
        message: `OpenAI Image API error (${response.status}): ${text}`,
      };
    } catch (err) {
      return {
        success: false,
        message: `OpenAI Image connectivity error: ${err}`,
      };
    }
  },
});

export const testOpenAIImageConnectivity = adapter.testConnectivity;
export const generateWithOpenAIImage = adapter.generate;
