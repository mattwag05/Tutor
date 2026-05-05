/**
 * Manifest Profile Definitions
 *
 * Three tiers map symbolic names to concrete models. All generation routes
 * pick a tier rather than a specific model — users change models by editing
 * profile config, not by touching code.
 *
 * Tiers per PRD §11 #5:
 *   tutor-cheap    — fast/cheap: intent classification, grading, summarization
 *   tutor-balanced — general: chat, section bodies, slide text, podcast
 *   tutor-premium  — capable: quiz authoring, outline generation, roundtable
 */

export type ManifestTier = 'tutor-cheap' | 'tutor-balanced' | 'tutor-premium';

export interface ManifestProfileConfig {
  /** OpenRouter model ID (without provider prefix, e.g. "anthropic/claude-sonnet-4"). */
  model: string;
  /** Provider binding, e.g. "openrouter" | "anthropic" | "openai". When set together with apiKey, overrides the catalog credentials. */
  binding?: string;
  /** API key for this tier. When set with binding, takes precedence over catalog/env credentials. */
  apiKey?: string;
  /** Custom base URL for this tier's provider. */
  baseUrl?: string;
  description?: string;
}

/** Defaults shipped with the application. Overridden by manifest_profiles.json. */
export const DEFAULT_MANIFEST_PROFILES: Record<ManifestTier, ManifestProfileConfig> = {
  'tutor-cheap': {
    model: 'anthropic/claude-haiku-4-5-20251001',
    description: 'Fast and cheap — intent classification, quiz grading, summarization',
  },
  'tutor-balanced': {
    model: 'anthropic/claude-sonnet-4',
    description: 'General — chat, section bodies, slide text, podcast narration',
  },
  'tutor-premium': {
    model: 'anthropic/claude-sonnet-4-5-20251001',
    description: 'Capable — quiz authoring, course outline, roundtable director',
  },
};

export const MANIFEST_TIERS = Object.keys(DEFAULT_MANIFEST_PROFILES) as ManifestTier[];
