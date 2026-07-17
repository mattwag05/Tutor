/**
 * Server-side Provider Configuration
 *
 * Loads provider configs from YAML (primary) + environment variables (fallback).
 * Keys never leave the server — only provider IDs and metadata are exposed via API.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { createLogger } from '@/lib/logger';
import {
  readCatalogSync,
  getActiveProfile,
  profileBinding,
  type ProfiledService,
} from '@/lib/server/catalog-read';
import type { ImageProviderId } from '@/lib/media/types';
import type { TTSProviderId } from '@/lib/audio/types';
import { TTS_PROVIDERS } from '@/lib/audio/constants';

const log = createLogger('ServerProviderConfig');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServerProviderEntry {
  apiKey: string;
  baseUrl?: string;
  models?: string[];
  proxy?: string;
}

interface ServerConfig {
  providers: Record<string, ServerProviderEntry>;
  tts: Record<string, ServerProviderEntry>;
  asr: Record<string, ServerProviderEntry>;
  pdf: Record<string, ServerProviderEntry>;
  image: Record<string, ServerProviderEntry>;
  video: Record<string, ServerProviderEntry>;
  webSearch: Record<string, ServerProviderEntry>;
}

// ---------------------------------------------------------------------------
// Env-var prefix mappings
// ---------------------------------------------------------------------------

const LLM_ENV_MAP: Record<string, string> = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GOOGLE: 'google',
  DEEPSEEK: 'deepseek',
  QWEN: 'qwen',
  KIMI: 'kimi',
  MINIMAX: 'minimax',
  GLM: 'glm',
  SILICONFLOW: 'siliconflow',
  DOUBAO: 'doubao',
  OPENROUTER: 'openrouter',
  GROK: 'grok',
  TENCENT: 'tencent-hunyuan',
  TENCENT_HUNYUAN: 'tencent-hunyuan',
  XIAOMI: 'xiaomi',
  MIMO: 'xiaomi',
  OLLAMA: 'ollama',
};

const TTS_ENV_MAP: Record<string, string> = {
  TTS_OPENAI: 'openai-tts',
  TTS_AZURE: 'azure-tts',
  TTS_GLM: 'glm-tts',
  TTS_QWEN: 'qwen-tts',
  TTS_VOXCPM: 'voxcpm-tts',
  TTS_DOUBAO: 'doubao-tts',
  TTS_ELEVENLABS: 'elevenlabs-tts',
  TTS_MINIMAX: 'minimax-tts',
  TTS_OPENROUTER: 'openrouter-tts',
};

const ASR_ENV_MAP: Record<string, string> = {
  ASR_OPENAI: 'openai-whisper',
  ASR_QWEN: 'qwen-asr',
  ASR_OPENROUTER: 'openrouter-asr',
};

const PDF_ENV_MAP: Record<string, string> = {
  PDF_UNPDF: 'unpdf',
  PDF_MINERU: 'mineru',
  PDF_MINERU_CLOUD: 'mineru-cloud',
};

const IMAGE_ENV_MAP: Record<string, string> = {
  IMAGE_OPENAI: 'openai-image',
  IMAGE_SEEDREAM: 'seedream',
  IMAGE_QWEN_IMAGE: 'qwen-image',
  IMAGE_NANO_BANANA: 'nano-banana',
  IMAGE_MINIMAX: 'minimax-image',
  IMAGE_GROK: 'grok-image',
  IMAGE_OPENROUTER: 'openrouter-image',
};

const VIDEO_ENV_MAP: Record<string, string> = {
  VIDEO_SEEDANCE: 'seedance',
  VIDEO_KLING: 'kling',
  VIDEO_VEO: 'veo',
  VIDEO_SORA: 'sora',
  VIDEO_MINIMAX: 'minimax-video',
  VIDEO_GROK: 'grok-video',
};

const WEB_SEARCH_ENV_MAP: Record<string, string> = {
  TAVILY: 'tavily',
  BOCHA: 'bocha',
};

// ---------------------------------------------------------------------------
// YAML loading
// ---------------------------------------------------------------------------

type YamlData = Partial<{
  providers: Record<string, Partial<ServerProviderEntry>>;
  tts: Record<string, Partial<ServerProviderEntry>>;
  asr: Record<string, Partial<ServerProviderEntry>>;
  pdf: Record<string, Partial<ServerProviderEntry>>;
  image: Record<string, Partial<ServerProviderEntry>>;
  video: Record<string, Partial<ServerProviderEntry>>;
  'web-search': Record<string, Partial<ServerProviderEntry>>;
}>;

const DEFAULT_FILENAME = 'server-providers.yml';
const SERVER_PROVIDER_YAML_PATH = path.join(process.cwd(), DEFAULT_FILENAME);

function loadYamlFile(filename: string): YamlData {
  if (filename !== DEFAULT_FILENAME) {
    log.warn(`[ServerProviderConfig] Ignoring unsupported config file: ${filename}`);
    return {};
  }

  try {
    if (!fs.existsSync(SERVER_PROVIDER_YAML_PATH)) return {};
    const raw = fs.readFileSync(SERVER_PROVIDER_YAML_PATH, 'utf-8');
    const parsed = yaml.load(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as YamlData;
  } catch (e) {
    log.warn(`[ServerProviderConfig] Failed to load ${filename}:`, e);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Env-var helpers
// ---------------------------------------------------------------------------

function loadEnvSection(
  envMap: Record<string, string>,
  yamlSection: Record<string, Partial<ServerProviderEntry>> | undefined,
  {
    requiresBaseUrl = false,
    keylessProviders = new Set<string>(),
  }: { requiresBaseUrl?: boolean; keylessProviders?: Set<string> } = {},
): Record<string, ServerProviderEntry> {
  const result: Record<string, ServerProviderEntry> = {};

  // First, add everything from YAML as defaults
  if (yamlSection) {
    for (const [id, entry] of Object.entries(yamlSection)) {
      if (
        requiresBaseUrl
          ? !!entry?.baseUrl
          : entry?.apiKey || (entry?.baseUrl && keylessProviders.has(id))
      ) {
        result[id] = {
          apiKey: entry.apiKey || '',
          baseUrl: entry.baseUrl,
          models: entry.models,
          proxy: entry.proxy,
        };
      }
    }
  }

  // Then, apply env vars (env takes priority over YAML)
  for (const [prefix, providerId] of Object.entries(envMap)) {
    const envApiKey = process.env[`${prefix}_API_KEY`] || undefined;
    const envBaseUrl = process.env[`${prefix}_BASE_URL`] || undefined;
    const envModelsStr = process.env[`${prefix}_MODELS`];
    const envModels = envModelsStr
      ? envModelsStr
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean)
      : undefined;

    if (result[providerId]) {
      // YAML entry exists — env vars override individual fields
      if (envApiKey) result[providerId].apiKey = envApiKey;
      if (envBaseUrl) result[providerId].baseUrl = envBaseUrl;
      if (envModels) result[providerId].models = envModels;
      continue;
    }

    // Activate on API key, or base URL alone for keyless providers (e.g. Ollama)
    if (
      requiresBaseUrl
        ? !envBaseUrl
        : !(envApiKey || (envBaseUrl && keylessProviders.has(providerId)))
    )
      continue;
    result[providerId] = {
      apiKey: envApiKey || '',
      baseUrl: envBaseUrl,
      models: envModels,
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Module-level cache (process singleton)
// ---------------------------------------------------------------------------

const OPENAI_IMAGE_PROVIDER_ID = 'openai-image';

/** Cache keyed by YAML filename (empty string = default file). */
const _configs: Map<string, ServerConfig> = new Map();

function applyOpenAIImageFallback(
  imageConfig: Record<string, ServerProviderEntry>,
  yamlImageSection: Record<string, Partial<ServerProviderEntry>> | undefined,
): Record<string, ServerProviderEntry> {
  if (imageConfig[OPENAI_IMAGE_PROVIDER_ID]) return imageConfig;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return imageConfig;

  const yamlOpenAIImage = yamlImageSection?.[OPENAI_IMAGE_PROVIDER_ID];
  imageConfig[OPENAI_IMAGE_PROVIDER_ID] = {
    apiKey,
    baseUrl:
      yamlOpenAIImage?.baseUrl || process.env.IMAGE_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
    models: yamlOpenAIImage?.models,
    proxy: yamlOpenAIImage?.proxy,
  };
  return imageConfig;
}

function buildConfig(yamlData: YamlData): ServerConfig {
  const image = applyOpenAIImageFallback(
    loadEnvSection(IMAGE_ENV_MAP, yamlData.image),
    yamlData.image,
  );

  return {
    providers: loadEnvSection(LLM_ENV_MAP, yamlData.providers, {
      keylessProviders: new Set(['ollama']),
    }),
    tts: loadEnvSection(TTS_ENV_MAP, yamlData.tts, {
      keylessProviders: new Set(['voxcpm-tts']),
    }),
    asr: loadEnvSection(ASR_ENV_MAP, yamlData.asr),
    pdf: loadEnvSection(PDF_ENV_MAP, yamlData.pdf, { requiresBaseUrl: true }),
    image,
    video: loadEnvSection(VIDEO_ENV_MAP, yamlData.video),
    webSearch: loadEnvSection(WEB_SEARCH_ENV_MAP, yamlData['web-search']),
  };
}

function logConfig(config: ServerConfig, label: string): void {
  const counts = [
    Object.keys(config.providers).length,
    Object.keys(config.tts).length,
    Object.keys(config.asr).length,
    Object.keys(config.pdf).length,
    Object.keys(config.image).length,
    Object.keys(config.video).length,
    Object.keys(config.webSearch).length,
  ];
  if (counts.some((c) => c > 0)) {
    log.info(
      `[ServerProviderConfig] Loaded (${label}): ${counts[0]} LLM, ${counts[1]} TTS, ${counts[2]} ASR, ${counts[3]} PDF, ${counts[4]} Image, ${counts[5]} Video, ${counts[6]} WebSearch providers`,
    );
  }
}

function getConfig(): ServerConfig {
  const cached = _configs.get('');
  if (cached) return cached;

  const yamlData = loadYamlFile(DEFAULT_FILENAME);
  const config = buildConfig(yamlData);
  logConfig(config, DEFAULT_FILENAME);
  _configs.set('', config);
  return config;
}

// ---------------------------------------------------------------------------
// Catalog override layer (UI-edited credentials in model_catalog.json)
// ---------------------------------------------------------------------------

// Returns the active catalog profile only when its binding matches providerId.
// Routes that ask for a non-active provider fall through to YAML/env, matching
// the LLM behavior in resolve-profile.ts (single source of truth = active profile).
function activeProfileFor(service: ProfiledService, providerId: string) {
  const profile = getActiveProfile(readCatalogSync(), service);
  if (!profile || profileBinding(profile) !== providerId) return null;
  return profile;
}

function resolveCatalogFirstApiKey(
  service: ProfiledService,
  providerId: string,
  yamlEnvSection: Record<string, ServerProviderEntry>,
  clientKey?: string,
): string {
  if (clientKey) return clientKey;
  const fromCatalog = activeProfileFor(service, providerId)?.api_key;
  if (fromCatalog) return fromCatalog;
  return yamlEnvSection[providerId]?.apiKey || '';
}

function resolveCatalogFirstBaseUrl(
  service: ProfiledService,
  providerId: string,
  yamlEnvSection: Record<string, ServerProviderEntry>,
  clientBaseUrl?: string,
): string | undefined {
  if (clientBaseUrl) return clientBaseUrl;
  return activeProfileFor(service, providerId)?.base_url || yamlEnvSection[providerId]?.baseUrl;
}

// ---------------------------------------------------------------------------
// Factory helpers — collapses repetitive getServer* / resolve* / resolve*BaseUrl patterns
// ---------------------------------------------------------------------------

type ProviderRow = { models?: string[]; baseUrl?: string };
type ProviderRowSimple = { baseUrl?: string };

type GetSectionFn<R> = (config: ServerConfig) => Record<string, R>;

function createGetProviders<R extends ProviderRow | ProviderRowSimple>(
  sectionKey: keyof ServerConfig,
  includeModels: boolean,
): GetSectionFn<R> {
  return (cfg: ServerConfig) => {
    const section = cfg[sectionKey] as Record<string, ServerProviderEntry>;
    const result: Record<string, R> = {};
    for (const [id, entry] of Object.entries(section)) {
      const row = {} as R;
      if (includeModels && entry.models?.length) (row as ProviderRow).models = entry.models;
      if (entry.baseUrl) (row as ProviderRow).baseUrl = entry.baseUrl;
      result[id] = row;
    }
    return result;
  };
}

function createResolveApiKey(
  sectionKey: keyof ServerConfig,
  useCatalog: boolean,
  service?: ProfiledService,
): (providerId: string, clientKey?: string) => string {
  return (providerId: string, clientKey?: string) => {
    if (clientKey) return clientKey;
    if (useCatalog && service) {
      return resolveCatalogFirstApiKey(service, providerId, getConfig()[sectionKey] as Record<string, ServerProviderEntry>, clientKey);
    }
    return (getConfig()[sectionKey] as Record<string, ServerProviderEntry>)[providerId]?.apiKey || '';
  };
}

function createResolveBaseUrl(
  sectionKey: keyof ServerConfig,
  useCatalog: boolean,
  service?: ProfiledService,
): (providerId: string, clientBaseUrl?: string) => string | undefined {
  return (providerId: string, clientBaseUrl?: string) => {
    if (clientBaseUrl) return clientBaseUrl;
    if (useCatalog && service) {
      return resolveCatalogFirstBaseUrl(service, providerId, getConfig()[sectionKey] as Record<string, ServerProviderEntry>, clientBaseUrl);
    }
    return (getConfig()[sectionKey] as Record<string, ServerProviderEntry>)[providerId]?.baseUrl;
  };
}

// ---------------------------------------------------------------------------
// Public API — LLM
// ---------------------------------------------------------------------------

const _llmProviders = createGetProviders<ProviderRow>('providers', true);
const _llmResolveApiKey = createResolveApiKey('providers', false);
const _llmResolveBaseUrl = createResolveBaseUrl('providers', false);

/** Returns server-configured LLM providers (no apiKeys) */
export function getServerProviders(): Record<string, { models?: string[]; baseUrl?: string }> {
  return _llmProviders(getConfig());
}

/** Resolve API key: client key > server key > empty string */
export function resolveApiKey(providerId: string, clientKey?: string): string {
  return _llmResolveApiKey(providerId, clientKey);
}

/** Resolve base URL: client > server > undefined */
export function resolveBaseUrl(providerId: string, clientBaseUrl?: string): string | undefined {
  return _llmResolveBaseUrl(providerId, clientBaseUrl);
}

/** Resolve proxy URL for a provider (server config only) */
export function resolveProxy(providerId: string): string | undefined {
  return getConfig().providers[providerId]?.proxy;
}

// ---------------------------------------------------------------------------
// Public API — TTS
// ---------------------------------------------------------------------------

const _ttsProviders = createGetProviders<ProviderRowSimple>('tts', false);
const _ttsResolveApiKey = createResolveApiKey('tts', true, 'tts');
const _ttsResolveBaseUrl = createResolveBaseUrl('tts', true, 'tts');

export function getServerTTSProviders(): Record<string, { baseUrl?: string }> {
  return _ttsProviders(getConfig());
}

export function resolveTTSApiKey(providerId: string, clientKey?: string): string {
  return _ttsResolveApiKey(providerId, clientKey);
}

export function resolveTTSBaseUrl(providerId: string, clientBaseUrl?: string): string | undefined {
  return _ttsResolveBaseUrl(providerId, clientBaseUrl);
}

export interface ActiveTTSConfig {
  providerId: TTSProviderId;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  voice?: string;
}

function asTTSProviderId(value: string | undefined): TTSProviderId | null {
  if (!value) return null;
  if (value in TTS_PROVIDERS) return value as TTSProviderId;
  if (value.startsWith('custom-tts-')) return value as TTSProviderId;
  return null;
}

// Resolve the active TTS profile (catalog first, then env/YAML).
// Mirrors getActiveImageConfig — necessary because `synthesize.ts` and
// classroom TTS both default to OpenAI's model+voice when not given one,
// which Kokoro and other OpenAI-compatible local servers reject (HTTP 400
// "Unsupported model: gpt-4o-mini-tts").
export function getActiveTTSConfig(): ActiveTTSConfig | null {
  const cfg = getConfig();
  const profile = getActiveProfile(readCatalogSync(), 'tts');
  const catalogProviderId = asTTSProviderId(profile ? profileBinding(profile) : undefined);
  if (profile && catalogProviderId) {
    const entry = cfg.tts[catalogProviderId];
    const firstModel = profile.models?.[0] as
      | { model?: string; id?: string; voice?: string }
      | undefined;
    return {
      providerId: catalogProviderId,
      apiKey: profile.api_key || entry?.apiKey || '',
      baseUrl: profile.base_url || entry?.baseUrl,
      model: firstModel?.model || firstModel?.id,
      voice: firstModel?.voice,
    };
  }
  for (const id of Object.keys(cfg.tts)) {
    const providerId = asTTSProviderId(id);
    if (!providerId) continue;
    const entry = cfg.tts[providerId];
    return {
      providerId,
      apiKey: entry?.apiKey || '',
      baseUrl: entry?.baseUrl,
      model: entry?.models?.[0],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API — ASR
// ---------------------------------------------------------------------------

const _asrProviders = createGetProviders<ProviderRowSimple>('asr', false);
const _asrResolveApiKey = createResolveApiKey('asr', true, 'asr');
const _asrResolveBaseUrl = createResolveBaseUrl('asr', true, 'asr');

export function getServerASRProviders(): Record<string, { baseUrl?: string }> {
  return _asrProviders(getConfig());
}

export function resolveASRApiKey(providerId: string, clientKey?: string): string {
  return _asrResolveApiKey(providerId, clientKey);
}

export function resolveASRBaseUrl(providerId: string, clientBaseUrl?: string): string | undefined {
  return _asrResolveBaseUrl(providerId, clientBaseUrl);
}

// ---------------------------------------------------------------------------
// Public API — PDF
// ---------------------------------------------------------------------------

const _pdfProviders = createGetProviders<ProviderRowSimple>('pdf', false);
const _pdfResolveApiKey = createResolveApiKey('pdf', false);
const _pdfResolveBaseUrl = createResolveBaseUrl('pdf', false);

export function getServerPDFProviders(): Record<string, { baseUrl?: string }> {
  return _pdfProviders(getConfig());
}

export function resolvePDFApiKey(providerId: string, clientKey?: string): string {
  return _pdfResolveApiKey(providerId, clientKey);
}

export function resolvePDFBaseUrl(providerId: string, clientBaseUrl?: string): string | undefined {
  return _pdfResolveBaseUrl(providerId, clientBaseUrl);
}

// ---------------------------------------------------------------------------
// Public API — Image Generation
// ---------------------------------------------------------------------------

const _imageProviders = createGetProviders<ProviderRow>('image', true);
const _imageResolveApiKey = createResolveApiKey('image', true, 'image');
const _imageResolveBaseUrl = createResolveBaseUrl('image', true, 'image');

export function getServerImageProviders(): Record<string, { models?: string[]; baseUrl?: string }> {
  return _imageProviders(getConfig());
}

export function resolveImageApiKey(providerId: string, clientKey?: string): string {
  return _imageResolveApiKey(providerId, clientKey);
}

export function resolveImageBaseUrl(
  providerId: string,
  clientBaseUrl?: string,
): string | undefined {
  return _imageResolveBaseUrl(providerId, clientBaseUrl);
}

export interface ActiveImageConfig {
  providerId: ImageProviderId;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

const KNOWN_IMAGE_PROVIDER_IDS: ReadonlySet<string> = new Set(Object.values(IMAGE_ENV_MAP));

function asImageProviderId(value: string | undefined): ImageProviderId | null {
  return value && KNOWN_IMAGE_PROVIDER_IDS.has(value) ? (value as ImageProviderId) : null;
}

// Resolve the active image profile (catalog first, then env/YAML).
export function getActiveImageConfig(): ActiveImageConfig | null {
  const cfg = getConfig();
  const profile = getActiveProfile(readCatalogSync(), 'image');
  const catalogProviderId = asImageProviderId(profile ? profileBinding(profile) : undefined);
  if (profile && catalogProviderId) {
    const entry = cfg.image[catalogProviderId];
    const firstModel = profile.models?.[0] as { model?: string; id?: string } | undefined;
    return {
      providerId: catalogProviderId,
      apiKey: profile.api_key || entry?.apiKey || '',
      baseUrl: profile.base_url || entry?.baseUrl,
      model: firstModel?.model || firstModel?.id,
    };
  }
  for (const id of Object.keys(cfg.image)) {
    const providerId = asImageProviderId(id);
    if (!providerId) continue;
    const entry = cfg.image[providerId];
    return {
      providerId,
      apiKey: entry?.apiKey || '',
      baseUrl: entry?.baseUrl,
      model: entry?.models?.[0],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API — Video Generation
// ---------------------------------------------------------------------------

const _videoProviders = createGetProviders<ProviderRowSimple>('video', false);
const _videoResolveApiKey = createResolveApiKey('video', true, 'video');
const _videoResolveBaseUrl = createResolveBaseUrl('video', true, 'video');

export function getServerVideoProviders(): Record<string, { baseUrl?: string }> {
  return _videoProviders(getConfig());
}

export function resolveVideoApiKey(providerId: string, clientKey?: string): string {
  return _videoResolveApiKey(providerId, clientKey);
}

export function resolveVideoBaseUrl(
  providerId: string,
  clientBaseUrl?: string,
): string | undefined {
  return _videoResolveBaseUrl(providerId, clientBaseUrl);
}

// ---------------------------------------------------------------------------
// Public API — Web Search
// ---------------------------------------------------------------------------

const _webSearchProviders = createGetProviders<ProviderRowSimple>('webSearch', false);
const _webSearchResolveBaseUrl = createResolveBaseUrl('webSearch', false);

export function getServerWebSearchProviders(): Record<string, { baseUrl?: string }> {
  return _webSearchProviders(getConfig());
}

/**
 * Resolve web search API key.
 *
 * Backward-compatible call shapes:
 * - resolveWebSearchApiKey(clientKey) -> Tavily key resolution
 * - resolveWebSearchApiKey(providerId, clientKey) -> provider-specific resolution
 */
export function resolveWebSearchApiKey(clientKey?: string): string;
export function resolveWebSearchApiKey(providerId: string, clientKey?: string): string;
export function resolveWebSearchApiKey(providerIdOrClientKey?: string, clientKey?: string): string {
  const hasProviderId = arguments.length >= 2;
  const providerId = hasProviderId ? providerIdOrClientKey || 'tavily' : 'tavily';
  const effectiveClientKey = hasProviderId ? clientKey : providerIdOrClientKey;

  if (effectiveClientKey) return effectiveClientKey;
  const serverKey = getConfig().webSearch[providerId]?.apiKey;
  if (serverKey) return serverKey;
  return '';
}

export function resolveWebSearchBaseUrl(
  providerId: string,
  clientBaseUrl?: string,
): string | undefined {
  return _webSearchResolveBaseUrl(providerId, clientBaseUrl);
}

export function resolveServerWebSearchProviderId(preferredProviderId?: string): string | undefined {
  const webSearch = getConfig().webSearch;
  if (preferredProviderId && webSearch[preferredProviderId]?.apiKey) {
    return preferredProviderId;
  }
  if (webSearch.tavily?.apiKey) return 'tavily';
  return Object.keys(webSearch)[0];
}
