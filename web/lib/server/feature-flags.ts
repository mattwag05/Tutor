import { readSettingsFileSync } from './catalog-read';
import {
  DEFAULT_FEATURE_FLAGS,
  type FeatureFlags,
} from '@/lib/types/feature-flags';

export type { FeatureFlags } from '@/lib/types/feature-flags';

interface RawUiSettings {
  features?: Partial<FeatureFlags>;
}

// Read interface.json and merge with defaults. Each flag falls back to its
// legacy ENABLE_* env var when undefined in the file, then to the canonical
// default. PUT /api/v1/settings/ui writes the file, so toggles take effect on
// the next request without a server restart.
export function getFeatureFlags(): FeatureFlags {
  const saved = readSettingsFileSync<RawUiSettings>('interface.json')?.features ?? {};

  const envCourseIllustrations =
    process.env.ENABLE_COURSE_ILLUSTRATIONS === undefined
      ? undefined
      : process.env.ENABLE_COURSE_ILLUSTRATIONS === 'true';

  return {
    course_illustrations:
      saved.course_illustrations ??
      envCourseIllustrations ??
      DEFAULT_FEATURE_FLAGS.course_illustrations,
    services_video_enabled:
      saved.services_video_enabled ?? DEFAULT_FEATURE_FLAGS.services_video_enabled,
  };
}
