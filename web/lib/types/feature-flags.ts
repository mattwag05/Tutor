// Mirror of FeatureFlags in deeptutor/api/routers/settings.py.
// Pure type module — safe to import from both server-only and client code.
export interface FeatureFlags {
  course_illustrations: boolean;
  // services_video_enabled defaults false — neither OpenRouter nor Ollama
  // offers video generation, and Matt has no other video-provider account
  // wired up. Flip to true (or hand-edit interface.json) when restoring a
  // video provider from archived_catalog.json.
  services_video_enabled: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  course_illustrations: false,
  services_video_enabled: false,
};
