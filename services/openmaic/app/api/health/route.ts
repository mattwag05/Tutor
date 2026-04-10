import { apiSuccess } from '@/lib/server/api-response';
import { isDeepTutorEnabled, checkHealth as checkDeepTutorHealth } from '@/lib/integrations';
import {
  getServerWebSearchProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
} from '@/lib/server/provider-config';

const version = process.env.npm_package_version || '0.1.0';

export async function GET() {
  // Check DeepTutor integration status
  let deepTutorStatus = 'disabled';
  if (isDeepTutorEnabled()) {
    const healthy = await checkDeepTutorHealth();
    deepTutorStatus = healthy ? 'healthy' : 'unavailable';
  }

  return apiSuccess({
    status: 'ok',
    version,
    capabilities: {
      webSearch: Object.keys(getServerWebSearchProviders()).length > 0,
      imageGeneration: Object.keys(getServerImageProviders()).length > 0,
      videoGeneration: Object.keys(getServerVideoProviders()).length > 0,
      tts: Object.keys(getServerTTSProviders()).length > 0,
    },
    integrations: {
      deepTutor: {
        enabled: isDeepTutorEnabled(),
        status: deepTutorStatus,
      },
    },
  });
}
