/**
 * Seedream (ByteDance / Doubao / Ark) Image Generation Adapter
 *
 * Uses OpenAI-compatible synchronous API format.
 * Endpoint: https://ark.cn-beijing.volces.com/api/v3/images/generations
 *
 * Supported models:
 * - doubao-seedream-5-0-260128  (latest / Lite, text2img + img2img + multi-ref + group)
 * - doubao-seedream-4-5-251128
 * - doubao-seedream-4-0-250828
 * - doubao-seedream-3-0-t2i-250415
 *
 * Refactored to use shared openai-compatible base.
 *
 * API docs: https://www.volcengine.com/docs/6791/1399028
 */

import { createOpenAICompatibleAdapter } from './openai-compatible-base';
import type { ImageGenerationOptions } from '../types';

/**
 * Map our aspect ratio + size to Seedream size format "WxH".
 * Seedream requires minimum 3,686,400 pixels total.
 * Common sizes: 2048x2048 (2K), 2560x1440 (16:9), 1920x1920.
 */
function resolveSeedreamSize(options: ImageGenerationOptions): string {
  if (options.width && options.height) {
    // Ensure minimum pixel count (3,686,400)
    const pixels = options.width * options.height;
    if (pixels < 3_686_400) {
      // Scale up proportionally
      const scale = Math.ceil(Math.sqrt(3_686_400 / pixels));
      return `${options.width * scale}x${options.height * scale}`;
    }
    return `${options.width}x${options.height}`;
  }
  // Default to 2K for quality
  return '2K';
}

const adapter = createOpenAICompatibleAdapter({
  name: 'Seedream',
  defaultModel: 'doubao-seedream-5-0-260128',
  defaultBaseUrl: 'https://ark.cn-beijing.volces.com',
  endpoint: '/api/v3/images/generations',
  extraBodyParams: (options) => ({
    size: resolveSeedreamSize(options),
    watermark: false,
  }),
});

export const testSeedreamConnectivity = adapter.testConnectivity;
export const generateWithSeedream = adapter.generate;