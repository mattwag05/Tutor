import { NextRequest } from 'next/server';
import { generateImage } from '@/lib/media/image-providers';
import { getActiveImageConfig } from '@/lib/server/provider-config';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { getFeatureFlags } from '@/lib/server/feature-flags';

// Book-agnostic raster illustration endpoint. Unlike course-illustration (which
// requires a courseId and persists to course storage), this takes a bare prompt
// and returns the image inline (provider URL or data: URL), so it can back Book
// figures or any other surface. Gated by the shared illustrations feature flag.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!getFeatureFlags().course_illustrations) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 503, 'Illustrations are not enabled');
  }

  let body: { prompt?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Invalid JSON body');
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'prompt is required');
  }

  const cfg = getActiveImageConfig();
  if (!cfg || !cfg.apiKey) {
    return apiError(API_ERROR_CODES.MISSING_API_KEY, 500, 'No image API key configured');
  }

  let result: Awaited<ReturnType<typeof generateImage>>;
  try {
    result = await generateImage(
      {
        providerId: cfg.providerId,
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
      },
      { prompt, aspectRatio: '16:9' },
    );
  } catch {
    // Generic detail per the API-error convention (no exception leak).
    return apiError(API_ERROR_CODES.GENERATION_FAILED, 500, 'Image generation failed');
  }

  if (result.url) {
    return apiSuccess({ src: result.url });
  }
  if (result.base64) {
    return apiSuccess({ src: `data:image/png;base64,${result.base64}` });
  }
  return apiError(API_ERROR_CODES.GENERATION_FAILED, 500, 'Provider returned no image data');
}
