/**
 * Tests for the Manifest profile resolver credential-selection logic.
 *
 * selectCredentials is a pure function — no mocking needed.
 */
import { describe, it, expect } from 'vitest';
import {
  buildModelString,
  selectCredentials,
  type LLMCredentials,
} from '@/lib/server/resolve-profile';
import { DEFAULT_MANIFEST_PROFILES, MANIFEST_TIERS } from '@/lib/ai/manifest/profiles';
import type { ManifestProfileConfig } from '@/lib/ai/manifest/profiles';
import { parseModelString } from '@/lib/ai/providers';

const CATALOG: LLMCredentials = {
  binding: 'openrouter',
  apiKey: 'catalog-key',
  baseUrl: 'https://openrouter.ai/api/v1',
};

describe('selectCredentials — credential precedence', () => {
  it('uses catalog credentials when profile has no per-tier overrides', () => {
    const cfg = DEFAULT_MANIFEST_PROFILES['tutor-balanced'];
    const result = selectCredentials(cfg, CATALOG);
    expect(result.binding).toBe('openrouter');
    expect(result.apiKey).toBe('catalog-key');
    expect(result.baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('uses per-tier binding+apiKey when both are set', () => {
    const cfg: ManifestProfileConfig = {
      model: 'anthropic/claude-opus-4-7',
      binding: 'anthropic',
      apiKey: 'tier-key',
      baseUrl: 'https://api.anthropic.com/v1',
    };
    const result = selectCredentials(cfg, CATALOG);
    expect(result.binding).toBe('anthropic');
    expect(result.apiKey).toBe('tier-key');
    expect(result.baseUrl).toBe('https://api.anthropic.com/v1');
  });

  it('falls back to catalog when tier override has model but not both binding+apiKey', () => {
    const cfg: ManifestProfileConfig = { model: 'custom/my-model' };
    const result = selectCredentials(cfg, CATALOG);
    expect(result.binding).toBe('openrouter');
    expect(result.apiKey).toBe('catalog-key');
  });

  it('falls back to catalog when tier has apiKey but no binding', () => {
    const cfg: ManifestProfileConfig = { model: 'some/model', apiKey: 'partial-key' };
    const result = selectCredentials(cfg, CATALOG);
    expect(result.binding).toBe('openrouter'); // catalog binding, not tier
    expect(result.apiKey).toBe('catalog-key'); // catalog apiKey since binding missing
  });

  it('falls back to catalog when tier has binding but no apiKey', () => {
    const cfg: ManifestProfileConfig = { model: 'some/model', binding: 'openai' };
    const result = selectCredentials(cfg, CATALOG);
    expect(result.binding).toBe('openrouter');
    expect(result.apiKey).toBe('catalog-key');
  });

  it('per-tier baseUrl overrides catalog even when binding+apiKey are catalog-derived', () => {
    const cfg: ManifestProfileConfig = {
      model: 'custom/endpoint-model',
      baseUrl: 'https://custom.proxy/v1',
    };
    const result = selectCredentials(cfg, CATALOG);
    expect(result.baseUrl).toBe('https://custom.proxy/v1');
    expect(result.apiKey).toBe('catalog-key'); // catalog key still used
  });

  it('all three default tiers work with catalog creds', () => {
    for (const tier of ['tutor-cheap', 'tutor-balanced', 'tutor-premium'] as const) {
      const result = selectCredentials(DEFAULT_MANIFEST_PROFILES[tier], CATALOG);
      expect(result.apiKey).toBe('catalog-key');
      expect(result.binding).toBe('openrouter');
    }
  });
});

describe('buildModelString — parseModelString round-trip', () => {
  it('produces a string parseModelString routes to the binding (not OpenAI default)', () => {
    for (const tier of MANIFEST_TIERS) {
      const { model } = DEFAULT_MANIFEST_PROFILES[tier];
      const built = buildModelString('openrouter', model);
      const parsed = parseModelString(built);
      expect(parsed.providerId).toBe('openrouter');
      expect(parsed.modelId).toBe(model);
    }
  });
});
