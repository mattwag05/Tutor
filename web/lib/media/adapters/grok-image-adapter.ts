/**
 * Grok (xAI) Image Generation Adapter
 *
 * Uses OpenAI-compatible synchronous API format.
 * Endpoint: https://api.x.ai/v1/images/generations
 *
 * Supported models:
 * - grok-imagine-image      (standard, $0.02/image)
 * - grok-imagine-image-pro  (pro quality, $0.07/image)
 *
 * Refactored to use shared openai-compatible base.
 *
 * API docs: https://docs.x.ai/developers/rest-api-reference/inference/images
 */

import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const adapter = createOpenAICompatibleAdapter({
  name: 'Grok Image',
  defaultModel: 'grok-imagine-image',
  defaultBaseUrl: 'https://api.x.ai/v1',
  endpoint: '/images/generations',
  extraBodyParams: { response_format: 'url' },
});

export const testGrokImageConnectivity = adapter.testConnectivity;
export const generateWithGrokImage = adapter.generate;