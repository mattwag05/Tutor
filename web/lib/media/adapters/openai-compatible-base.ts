/**
 * Shared OpenAI-Compatible Adapter Base
 *
 * Many image generation providers follow the OpenAI API pattern:
 *   POST {baseUrl}/{endpoint}  with Bearer token auth
 *   Body: { model, prompt, n: 1, ...extraParams }
 *   Response: { data: [{ url?, b64_json? }] }
 *
 * This base handles the common pattern and let each adapter configure
 * model, endpoint, extra body params, and optional overrides.
 */

import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';

export interface OpenAICompatibleAdapterConfig {
  /** Human-readable provider name (used in connectivity test messages) */
  name: string;
  /** Default model ID */
  defaultModel: string;
  /** Default base URL (no trailing slash) */
  defaultBaseUrl: string;
  /** API endpoint path (e.g. '/images/generations') */
  endpoint: string;
  /**
   * Extra body parameters to merge into the request body.
   * Can be a static object or a function that receives generation options.
   */
  extraBodyParams?:
    | Record<string, unknown>
    | ((options: ImageGenerationOptions) => Record<string, unknown>);
  /**
   * Optional custom response parser.
   * Default: extracts url/b64_json from response.data[0].
   */
  parseResponse?(
    data: unknown,
    options: ImageGenerationOptions,
  ): {
    url?: string;
    base64?: string;
    width: number;
    height: number;
  } | null;
  /**
   * Optional custom connectivity test.
   * Default: POST to endpoint with empty prompt, checks 401/403.
   */
  testConnectivity?(
    config: ImageGenerationConfig,
  ): Promise<{ success: boolean; message: string }>;
}

function normalize(baseUrl?: string, defaultBaseUrl?: string): string {
  return (baseUrl || defaultBaseUrl || '').replace(/\/$/, '');
}

function resolveExtraParams(
  extra:
    | Record<string, unknown>
    | ((options: ImageGenerationOptions) => Record<string, unknown>)
    | undefined,
  options: ImageGenerationOptions,
): Record<string, unknown> {
  if (typeof extra === 'function') return extra(options);
  return { ...extra };
}

const defaultParseResponse = (
  data: unknown,
  options: ImageGenerationOptions,
): {
  url?: string;
  base64?: string;
  width: number;
  height: number;
} | null => {
  const body = data as { data?: Array<{ url?: string; b64_json?: string }> };
  const imageData = body?.data?.[0];
  if (!imageData?.url && !imageData?.b64_json) return null;
  return {
    url: imageData.url,
    base64: imageData.b64_json,
    width: options.width || 1024,
    height: options.height || 1024,
  };
};

export function createOpenAICompatibleAdapter(
  config: OpenAICompatibleAdapterConfig,
) {
  const { name, defaultModel, defaultBaseUrl, endpoint } = config;
  const extraBodyParams = config.extraBodyParams;
  const parseResponse = config.parseResponse || defaultParseResponse;
  const testConnectivityOverride = config.testConnectivity;

  async function defaultTestConnectivity(
    cfg: ImageGenerationConfig,
  ): Promise<{ success: boolean; message: string }> {
    const baseUrl = normalize(cfg.baseUrl, defaultBaseUrl);
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model || defaultModel,
          prompt: '',
          n: 1,
        }),
      });
      if (response.status === 401 || response.status === 403) {
        const text = await response.text().catch(() => response.statusText);
        return {
          success: false,
          message: `${name} auth failed (${response.status}): ${text}`,
        };
      }
      return { success: true, message: `Connected to ${name}` };
    } catch (err) {
      return {
        success: false,
        message: `${name} connectivity error: ${err}`,
      };
    }
  }

  const testConnectivity = testConnectivityOverride || defaultTestConnectivity;

  return {
    testConnectivity,

    generate: async (
      cfg: ImageGenerationConfig,
      options: ImageGenerationOptions,
    ): Promise<ImageGenerationResult> => {
      const baseUrl = normalize(cfg.baseUrl, defaultBaseUrl);
      const params = resolveExtraParams(extraBodyParams, options);

      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model || defaultModel,
          prompt: options.prompt,
          n: 1,
          ...params,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`${name} generation failed (${response.status}): ${text}`);
      }

      const data = await response.json();
      const result = parseResponse(data, options);
      if (!result) {
        throw new Error(`${name} returned empty image response`);
      }
      return result;
    },
  };
}
