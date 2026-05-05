import { describe, it, expect } from 'vitest';
import { DEFAULT_MANIFEST_PROFILES } from '@/lib/ai/manifest/profiles';
import type { ManifestTier, ManifestProfileConfig } from '@/lib/ai/manifest/profiles';

const TIERS: ManifestTier[] = ['tutor-cheap', 'tutor-balanced', 'tutor-premium'];

describe('Manifest profiles', () => {
  it('defines all three tiers', () => {
    for (const tier of TIERS) {
      expect(DEFAULT_MANIFEST_PROFILES[tier]).toBeDefined();
    }
  });

  it('each tier has a non-empty model string', () => {
    for (const tier of TIERS) {
      const { model } = DEFAULT_MANIFEST_PROFILES[tier];
      expect(typeof model).toBe('string');
      expect(model.length).toBeGreaterThan(0);
    }
  });

  it('model strings do not contain a provider prefix (OpenRouter model IDs only)', () => {
    // Model IDs in profiles are bare OpenRouter IDs like "anthropic/claude-sonnet-4".
    // They must NOT start with "openrouter/" because resolve-profile.ts prefixes the binding.
    for (const tier of TIERS) {
      const { model } = DEFAULT_MANIFEST_PROFILES[tier];
      expect(model.startsWith('openrouter/')).toBe(false);
    }
  });

  it('tiers form a cost/capability gradient', () => {
    // cheap and premium must differ
    expect(DEFAULT_MANIFEST_PROFILES['tutor-cheap'].model).not.toBe(
      DEFAULT_MANIFEST_PROFILES['tutor-premium'].model,
    );
  });
});

describe('ManifestProfileConfig optional credential fields', () => {
  it('accepts binding, apiKey, baseUrl without type errors', () => {
    const cfg: ManifestProfileConfig = {
      model: 'anthropic/claude-sonnet-4',
      binding: 'anthropic',
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com/v1',
      description: 'custom',
    };
    expect(cfg.binding).toBe('anthropic');
    expect(cfg.apiKey).toBe('sk-test');
    expect(cfg.baseUrl).toBe('https://api.anthropic.com/v1');
  });

  it('all optional credential fields default to undefined on default profiles', () => {
    for (const tier of ['tutor-cheap', 'tutor-balanced', 'tutor-premium'] as ManifestTier[]) {
      expect(DEFAULT_MANIFEST_PROFILES[tier].binding).toBeUndefined();
      expect(DEFAULT_MANIFEST_PROFILES[tier].apiKey).toBeUndefined();
      expect(DEFAULT_MANIFEST_PROFILES[tier].baseUrl).toBeUndefined();
    }
  });
});
