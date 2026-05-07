// Mirror of FeatureFlags in deeptutor/api/routers/settings.py.
// Pure type module — safe to import from both server-only and client code.
export interface FeatureFlags {
  course_illustrations: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  course_illustrations: false,
};
