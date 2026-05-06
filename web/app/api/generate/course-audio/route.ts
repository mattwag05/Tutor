import { promises as fs } from 'fs';
import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import {
  courseAudioPath,
  isValidCourseId,
  isValidSectionId,
  readCourse,
  writeSectionAudio,
} from '@/lib/server/course-storage';
import { sectionToNarration } from '@/lib/course/section-text';
import { synthesizeCourseAudio } from '@/lib/server/tts/synthesize';

const log = createLogger('CourseAudio');

export const maxDuration = 60;

interface PostBody {
  courseId?: string;
  sectionId?: string;
  voice?: string;
  model?: string;
}

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Request body must be JSON');
  }

  const { courseId, sectionId, voice, model } = body;
  if (!courseId || !sectionId) {
    return apiError(
      API_ERROR_CODES.MISSING_REQUIRED_FIELD,
      400,
      'courseId and sectionId are required',
    );
  }
  if (!isValidCourseId(courseId) || !isValidSectionId(sectionId)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid courseId or sectionId');
  }

  const course = await readCourse(courseId);
  if (!course) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, `Course ${courseId} not found`);
  }

  const section = course.sections.find((s) => s.id === sectionId);
  if (!section) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      404,
      `Section ${sectionId} not found in course ${courseId}`,
    );
  }
  if (section.status !== 'ready' || section.blocks.length === 0) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      409,
      'Section is not ready for synthesis (no blocks generated yet)',
    );
  }

  const text = sectionToNarration(section);
  if (!text) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 422, 'Section produced no narratable text');
  }

  const audioUrl = `/api/course/${courseId}/audio/${sectionId}`;

  try {
    try {
      const stat = await fs.stat(courseAudioPath(courseId, sectionId));
      if (stat.isFile() && stat.size > 0) {
        return apiSuccess({ audioUrl, bytes: stat.size, cached: true });
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }

    const audio = await synthesizeCourseAudio(text, { voice, modelId: model });
    await writeSectionAudio(courseId, sectionId, audio);
    return apiSuccess({ audioUrl, bytes: audio.byteLength, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown TTS error';
    log.error(`TTS synth failed [courseId=${courseId} sectionId=${sectionId}]:`, error);
    return apiError(API_ERROR_CODES.UPSTREAM_ERROR, 502, 'TTS synthesis failed', message);
  }
}
