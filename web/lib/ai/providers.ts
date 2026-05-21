/**
 * Unified AI Provider Configuration
 *
 * Supports multiple AI providers through Vercel AI SDK:
 * - OpenAI (native)
 * - Anthropic Claude (native)
 * - Google Gemini (native)
 * - MiniMax (Anthropic-compatible, recommended by official)
 * - OpenAI-compatible providers (DeepSeek, Qwen, Kimi, GLM, SiliconFlow, Doubao, Tencent, Xiaomi, etc.)
 *
 * Sources:
 * - https://platform.openai.com/docs/models
 * - https://platform.claude.com/docs/en/about-claude/models/overview
 * - https://ai.google.dev/gemini-api/docs/models
 * - https://api-docs.deepseek.com/quick_start/pricing
 * - https://platform.moonshot.cn/docs/pricing/chat
 * - https://platform.minimaxi.com/docs/guides/text-generation
 * - https://platform.minimaxi.com/docs/api-reference/text-anthropic-api
 * - https://docs.bigmodel.cn/cn/guide/start/model-overview
 * - https://help.aliyun.com/zh/model-studio/models (Qwen/DashScope)
 * - https://siliconflow.cn/models
 * - https://siliconflow.cn/pricing
 * - https://www.volcengine.com/docs/82379/1330310
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type {
  ProviderId,
  ProviderConfig,
  ModelInfo,
  ModelConfig,
  ThinkingConfig,
} from '@/lib/types/provider';
import { applyModelMetadata, getCatalogThinkingCapability } from './model-metadata';
import { getThinkingMode, pickThinkingBudget } from './thinking-config';
import { createLogger } from '@/lib/logger';
// NOTE: Do NOT import thinking-context.ts here — it uses node:async_hooks
// which is server-only, and this file is also used on the client via
// settings.ts. The thinking context is read from globalThis instead
// (set by thinking-context.ts at module load time on the server).

const log = createLogger('AIProviders');

// Re-export types for backward compatibility
export type { ProviderId, ProviderConfig, ModelInfo, ModelConfig };

/** Provider IDs whose logos are monochrome-dark and need `dark:invert` in dark mode */

import providerData from './providers.json';

export const MONO_LOGO_PROVIDERS: ReadonlySet<string> = new Set(
  (providerData as unknown as { monoLogoProviders: string[] }).monoLogoProviders,
);

export const PROVIDERS: Record<ProviderId, ProviderConfig> = (
  providerData as unknown as { providers: Record<ProviderId, ProviderConfig> }
).providers;
;

applyModelMetadata(PROVIDERS);

/**
 * Get provider config (from built-in or unified config in localStorage)
 */
function getProviderConfig(providerId: ProviderId): ProviderConfig | null {
  // Check built-in providers first
  if (PROVIDERS[providerId]) {
    return PROVIDERS[providerId];
  }

  // Check unified providersConfig in localStorage (browser only)
  if (typeof window !== 'undefined') {
    try {
      const storedConfig = localStorage.getItem('providersConfig');
      if (storedConfig) {
        const config = JSON.parse(storedConfig);
        const providerSettings = config[providerId];
        if (providerSettings) {
          return {
            id: providerId,
            name: providerSettings.name,
            type: providerSettings.type,
            defaultBaseUrl: providerSettings.defaultBaseUrl,
            icon: providerSettings.icon,
            requiresApiKey: providerSettings.requiresApiKey,
            models: providerSettings.models,
          };
        }
      }
    } catch (e) {
      log.error('Failed to load provider config:', e);
    }
  }

  return null;
}

/**
 * Model instance with its configuration info
 */
export interface ModelWithInfo {
  model: LanguageModel;
  modelInfo: ModelInfo | null;
}

function getCompatThinkingBodyParams(
  providerId: ProviderId,
  modelId: string,
  config: ThinkingConfig,
): Record<string, unknown> | undefined {
  const capability = getCatalogThinkingCapability(providerId, modelId);
  if (!capability || capability.control === 'none') return undefined;

  const mode = getThinkingMode(config);
  const budget = pickThinkingBudget(capability, config);

  switch (capability.requestAdapter) {
    case 'kimi':
    case 'glm':
    case 'xiaomi':
      if (mode === 'disabled') return { thinking: { type: 'disabled' } };
      if (mode === 'enabled') return { thinking: { type: 'enabled' } };
      return undefined;

    case 'deepseek': {
      if (mode === 'disabled' || config.effort === 'none') {
        return { thinking: { type: 'disabled' } };
      }

      const effort = config.effort === 'max' || config.effort === 'xhigh' ? 'max' : 'high';
      return {
        thinking: { type: 'enabled' },
        reasoning_effort: effort,
      };
    }

    case 'qwen': {
      if (mode === 'disabled') return { enable_thinking: false };
      const body: Record<string, unknown> = {};
      if (mode === 'enabled') body.enable_thinking = true;
      if (budget !== undefined) body.thinking_budget = budget;
      return Object.keys(body).length > 0 ? body : undefined;
    }

    case 'siliconflow': {
      const body: Record<string, unknown> = {};
      if (capability.control === 'toggle-budget') {
        if (mode === 'disabled') body.enable_thinking = false;
        if (mode === 'enabled') body.enable_thinking = true;
      }
      if (budget !== undefined) body.thinking_budget = budget;
      return Object.keys(body).length > 0 ? body : undefined;
    }

    case 'doubao': {
      if (capability.control === 'effort') {
        const effort =
          mode === 'disabled'
            ? 'minimal'
            : config.effort && capability.effortValues?.includes(config.effort)
              ? config.effort
              : mode === 'enabled'
                ? capability.defaultEffort
                : undefined;
        return effort ? { reasoning_effort: effort } : undefined;
      }
      if (mode === 'auto') return { thinking: { type: 'auto' } };
      if (mode === 'disabled') return { thinking: { type: 'disabled' } };
      if (mode === 'enabled') return { thinking: { type: 'enabled' } };
      return undefined;
    }

    case 'openrouter': {
      const reasoning: Record<string, unknown> = {};
      if (mode === 'disabled') reasoning.enabled = false;
      if (mode === 'enabled') reasoning.enabled = true;
      if (config.effort) reasoning.effort = config.effort;
      if (budget !== undefined) reasoning.max_tokens = budget;
      if (typeof config.excludeReasoningOutput === 'boolean') {
        reasoning.exclude = config.excludeReasoningOutput;
      }
      return Object.keys(reasoning).length > 0 ? { reasoning } : undefined;
    }

    case 'hunyuan': {
      let reasoningEffort: 'no_think' | 'low' | 'high' | undefined;
      if (mode === 'disabled' || config.effort === 'none') {
        reasoningEffort = 'no_think';
      } else if (config.effort === 'high' || config.effort === 'max' || config.effort === 'xhigh') {
        reasoningEffort = 'high';
      } else if (
        config.effort === 'low' ||
        config.effort === 'medium' ||
        config.effort === 'minimal'
      ) {
        reasoningEffort = 'low';
      } else if (mode === 'enabled') {
        reasoningEffort = capability.defaultEffort === 'high' ? 'high' : 'low';
      }
      return reasoningEffort
        ? { chat_template_kwargs: { reasoning_effort: reasoningEffort } }
        : undefined;
    }

    default:
      return undefined;
  }
}

function normalizeMiniMaxAnthropicBaseUrl(
  providerId: ProviderId,
  baseUrl?: string,
): string | undefined {
  if (providerId !== 'minimax' || !baseUrl) {
    return baseUrl;
  }

  const trimmed = baseUrl.replace(/\/$/, '');
  if (trimmed.endsWith('/anthropic/v1')) {
    return trimmed;
  }
  if (trimmed.endsWith('/anthropic')) {
    return `${trimmed}/v1`;
  }
  return `${trimmed}/anthropic/v1`;
}

function shouldUseOpenAIResponsesApi(providerId: ProviderId, modelId: string): boolean {
  if (providerId !== 'openai') return false;

  return (
    /^gpt-5\.\d+-pro(?:-|$)/.test(modelId) ||
    /^gpt-5\.5(?:-|$)/.test(modelId) ||
    /^gpt-5\.[3-9]-codex(?:-|$)/.test(modelId)
  );
}

/** Returns true if the provider requires an API key (defaults to true for unknown providers). */
export function isProviderKeyRequired(providerId: string): boolean {
  return getProviderConfig(providerId as ProviderId)?.requiresApiKey ?? true;
}

/**
 * Get a configured language model instance with its info
 * Accepts individual parameters for flexibility and security
 */
export function getModel(config: ModelConfig): ModelWithInfo {
  // providerType can come from client for custom providers; fall back to registry.
  let providerType = config.providerType;
  const provider = getProviderConfig(config.providerId);
  const requiresApiKey = provider?.requiresApiKey ?? true;

  if (!providerType) {
    if (provider) {
      providerType = provider.type;
    } else {
      throw new Error(`Unknown provider: ${config.providerId}. Please provide providerType.`);
    }
  }

  // Validate API key if required
  if (requiresApiKey && !config.apiKey) {
    throw new Error(`API key required for provider: ${config.providerId}`);
  }

  // Use provided API key, or empty string for providers that don't require one
  const effectiveApiKey = config.apiKey || '';

  // Resolve base URL: explicit > provider default > SDK default
  const effectiveBaseUrl = normalizeMiniMaxAnthropicBaseUrl(
    config.providerId,
    config.baseUrl || provider?.defaultBaseUrl || undefined,
  );

  let model: LanguageModel;

  switch (providerType) {
    case 'openai': {
      const openaiOptions: Parameters<typeof createOpenAI>[0] = {
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseUrl,
      };

      // For OpenAI-compatible providers (not native OpenAI), add a fetch
      // wrapper that injects vendor-specific thinking params into the HTTP
      // body. The thinking config is read from AsyncLocalStorage, set by
      // callLLM / streamLLM at call time.
      if (config.providerId !== 'openai') {
        const providerId = config.providerId;
        openaiOptions.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
          // Read thinking config from globalThis (set by thinking-context.ts)
          const thinkingCtx = (globalThis as Record<string, unknown>).__thinkingContext as
            | { getStore?: () => unknown }
            | undefined;
          const thinking = thinkingCtx?.getStore?.() as ThinkingConfig | undefined;
          if (thinking && init?.body && typeof init.body === 'string') {
            const extra = getCompatThinkingBodyParams(providerId, config.modelId, thinking);
            if (extra) {
              try {
                const body = JSON.parse(init.body);
                Object.assign(body, extra);
                init = { ...init, body: JSON.stringify(body) };
              } catch {
                /* leave body as-is */
              }
            }
          }
          return globalThis.fetch(url, init);
        };
      }

      const openai = createOpenAI(openaiOptions);
      model = shouldUseOpenAIResponsesApi(config.providerId, config.modelId)
        ? openai.responses(config.modelId)
        : openai.chat(config.modelId);
      break;
    }

    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseUrl,
      });
      model = anthropic.chat(config.modelId);
      break;
    }

    case 'google': {
      const googleOptions: Parameters<typeof createGoogleGenerativeAI>[0] = {
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseUrl,
      };
      if (config.proxy) {
        const proxy = config.proxy;
        let agent: unknown;
        googleOptions.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const { ProxyAgent, fetch: undiciFetch } = (await import(
            /* webpackIgnore: true */ 'undici'
          )) as {
            ProxyAgent: new (proxyUrl: string) => unknown;
            fetch: (
              input: string | URL | Request,
              init?: Record<string, unknown>,
            ) => Promise<unknown>;
          };
          agent ??= new ProxyAgent(proxy);
          const response = await undiciFetch(input, {
            ...(init as Record<string, unknown>),
            dispatcher: agent,
          });
          return response as Response;
        }) as typeof fetch;
      }
      const google = createGoogleGenerativeAI(googleOptions);
      model = google.chat(config.modelId);
      break;
    }

    default:
      throw new Error(`Unsupported provider type: ${providerType}`);
  }

  // Look up model info from the provider registry
  const modelInfo = provider?.models.find((m) => m.id === config.modelId) || null;

  return { model, modelInfo };
}

/**
 * Parse model string in format "providerId:modelId" or just "modelId" (defaults to OpenAI)
 */
export function parseModelString(modelString: string): {
  providerId: ProviderId;
  modelId: string;
} {
  // Split only on the first colon to handle model IDs that contain colons
  const colonIndex = modelString.indexOf(':');

  if (colonIndex > 0) {
    return {
      providerId: modelString.slice(0, colonIndex) as ProviderId,
      modelId: modelString.slice(colonIndex + 1),
    };
  }

  // Default to OpenAI for backward compatibility
  return {
    providerId: 'openai',
    modelId: modelString,
  };
}

/**
 * Get all available models grouped by provider
 */
export function getAllModels(): {
  provider: ProviderConfig;
  models: ModelInfo[];
}[] {
  return Object.values(PROVIDERS).map((provider) => ({
    provider,
    models: provider.models,
  }));
}

/**
 * Get provider by ID
 */
export function getProvider(providerId: ProviderId): ProviderConfig | undefined {
  return PROVIDERS[providerId];
}

/**
 * Get model info
 */
export function getModelInfo(providerId: ProviderId, modelId: string): ModelInfo | undefined {
  const provider = PROVIDERS[providerId];
  return provider?.models.find((m) => m.id === modelId);
}
