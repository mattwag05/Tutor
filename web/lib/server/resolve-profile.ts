/**
 * Manifest profile resolver for server-side generation routes.
 *
 * Generation routes (course-*, scene-*, etc.) don't receive a client-supplied
 * model — they pick a tier (tutor-cheap / tutor-balanced / tutor-premium).
 * This module maps the tier to a concrete model + credentials drawn from the
 * user's active LLM profile in model_catalog.json.
 */

import fs from 'fs/promises';
import path from 'path';
import {
  DEFAULT_MANIFEST_PROFILES,
  type ManifestTier,
  type ManifestProfileConfig,
} from '@/lib/ai/manifest/profiles';
import { resolveModel, type ResolvedModel } from '@/lib/server/resolve-model';
import { createLogger } from '@/lib/logger';

const log = createLogger('ManifestProfile');

const PROFILES_PATH = path.join(process.cwd(), 'data/user/settings/manifest_profiles.json');
const CATALOG_PATH = path.join(process.cwd(), 'data/user/settings/model_catalog.json');

interface ProfilesFile {
  profiles: Partial<Record<ManifestTier, ManifestProfileConfig>>;
}

export interface LLMCredentials {
  apiKey: string;
  baseUrl?: string;
  binding: string;
}

async function loadProfileOverrides(): Promise<Partial<Record<ManifestTier, ManifestProfileConfig>>> {
  try {
    const raw = await fs.readFile(PROFILES_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as ProfilesFile;
    return parsed.profiles ?? {};
  } catch {
    return {};
  }
}

async function loadLLMCredentials(): Promise<LLMCredentials> {
  const defaults: LLMCredentials = {
    apiKey: process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY ?? '',
    baseUrl: process.env.LLM_HOST ?? 'https://openrouter.ai/api/v1',
    binding: process.env.LLM_BINDING ?? 'openrouter',
  };

  try {
    const raw = await fs.readFile(CATALOG_PATH, 'utf-8');
    const catalog = JSON.parse(raw) as Record<string, unknown>;
    const llm = (catalog.services as Record<string, unknown>)?.llm as
      | Record<string, unknown>
      | undefined;
    if (!llm) return defaults;

    const activeProfileId = llm.active_profile_id as string | undefined;
    const profiles = (llm.profiles as Record<string, unknown>[] | undefined) ?? [];
    const active = profiles.find(
      (p) => (p as Record<string, unknown>).id === activeProfileId,
    ) as Record<string, unknown> | undefined;

    if (!active) return defaults;

    return {
      apiKey: (active.api_key as string | undefined) || defaults.apiKey,
      baseUrl: (active.base_url as string | undefined) || defaults.baseUrl,
      binding: (active.binding as string | undefined) || defaults.binding,
    };
  } catch {
    return defaults;
  }
}

/** Pure credential-selection logic — exported for unit testing. */
export function selectCredentials(
  profileConfig: ManifestProfileConfig,
  catalogCreds: LLMCredentials,
): { binding: string; apiKey: string; baseUrl: string | undefined } {
  const tierHasOwnCreds = !!(profileConfig.binding && profileConfig.apiKey);
  return {
    binding: tierHasOwnCreds ? profileConfig.binding! : catalogCreds.binding,
    apiKey: tierHasOwnCreds ? profileConfig.apiKey! : catalogCreds.apiKey,
    baseUrl: profileConfig.baseUrl ?? (tierHasOwnCreds ? undefined : catalogCreds.baseUrl),
  };
}

/**
 * Resolve a language model from a Manifest tier name.
 *
 * Credential precedence (highest to lowest):
 *  1. Per-tier binding+apiKey in manifest_profiles.json (when both are set)
 *  2. Active LLM profile in model_catalog.json
 *  3. LLM_API_KEY / OPENROUTER_API_KEY env vars
 */
export async function resolveModelFromProfile(tier: ManifestTier): Promise<ResolvedModel> {
  const [overrides, catalogCreds] = await Promise.all([
    loadProfileOverrides(),
    loadLLMCredentials(),
  ]);
  const profileConfig = overrides[tier] ?? DEFAULT_MANIFEST_PROFILES[tier];
  const { binding, apiKey, baseUrl } = selectCredentials(profileConfig, catalogCreds);

  const modelString = `${binding}/${profileConfig.model}`;
  log.info(`[${tier}] → ${modelString}`);

  return resolveModel({
    modelString,
    apiKey: apiKey || undefined,
    baseUrl: baseUrl || undefined,
  });
}
