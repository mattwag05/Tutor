import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { readCourse, isValidCourseId, courseImagePath } from '@/lib/server/course-storage';
import { generateImage } from '@/lib/media/image-providers';
import { getActiveImageConfig } from '@/lib/server/provider-config';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { getFeatureFlags } from '@/lib/server/feature-flags';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!getFeatureFlags().course_illustrations) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 503, 'Course illustrations are not enabled');
  }

  let body: { courseId?: string; blockId?: string; prompt?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Invalid JSON body');
  }

  const { courseId, blockId, prompt } = body;
  if (!courseId || !isValidCourseId(courseId)) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'courseId is required');
  }
  if (!blockId || !isValidCourseId(blockId)) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'blockId is required');
  }
  if (!prompt) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'prompt is required');
  }

  const course = await readCourse(courseId);
  if (!course) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, `Course ${courseId} not found`);
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
  } catch (err) {
    return apiError(
      API_ERROR_CODES.GENERATION_FAILED,
      500,
      err instanceof Error ? err.message : 'Image generation failed',
    );
  }

  let src: string;
  if (result.url) {
    src = result.url;
  } else if (result.base64) {
    const imgPath = courseImagePath(courseId, blockId);
    await fs.mkdir(path.dirname(imgPath), { recursive: true });
    await fs.writeFile(imgPath, Buffer.from(result.base64, 'base64'));
    src = `/api/course/${courseId}/image/${blockId}`;
  } else {
    return apiError(API_ERROR_CODES.GENERATION_FAILED, 500, 'Provider returned no image data');
  }

  // Persistence is handled by the client's schedulePersist PUT after setBlockSrc is called.
  // We do not write the course here — concurrent illustration requests would overwrite each
  // other's updates because all read the same initial course snapshot.
  return apiSuccess({ src });
}
