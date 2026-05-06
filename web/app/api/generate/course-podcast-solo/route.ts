import { promises as fs } from 'fs';
import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { buildPrompt, PROMPT_IDS } from '@/lib/generation/prompts';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolveModelFromProfile } from '@/lib/server/resolve-profile';
import {
  coursePodcastPath,
  isValidCourseId,
  readCourse,
  writeCourse,
  writePodcastAudio,
} from '@/lib/server/course-storage';
import { createLogger } from '@/lib/logger';
import { sectionsToText } from '@/lib/course/sections-to-text';
import { formatPersonalization } from '@/lib/generation/format-personalization';
import { synthesizeCourseAudio } from '@/lib/server/tts/synthesize';

const log = createLogger('CoursePodcastSolo');

export const maxDuration = 180;

const SOLO_VOICE = 'nova' as const;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { courseId?: string; force?: boolean };

    if (!body.courseId || !isValidCourseId(body.courseId)) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'courseId is required');
    }

    const course = await readCourse(body.courseId);
    if (!course) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, `Course ${body.courseId} not found`);
    }

    const audioUrl = `/api/course/${course.id}/podcast/solo`;
    const cached = course.artifacts?.podcast?.solo;

    if (!body.force && cached?.status === 'ready' && cached.audioUrl) {
      try {
        const stat = await fs.stat(coursePodcastPath(course.id, 'solo'));
        if (stat.isFile() && stat.size > 0) {
          return apiSuccess({
            audioUrl: cached.audioUrl,
            transcript: cached.transcript,
            bytes: stat.size,
            cached: true,
          });
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }

    const sections = sectionsToText(course.sections);
    if (!sections) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        'Course has no ready sections to generate a podcast from',
      );
    }

    const { model: languageModel, modelInfo, modelString } = await resolveModelFromProfile('tutor-balanced');

    const prompts = buildPrompt(PROMPT_IDS.PODCAST_SOLO, {
      courseTitle: course.title,
      topic: course.topic,
      language: course.language,
      sections,
      personalization: formatPersonalization(course.personalization),
    });

    if (!prompts) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Solo podcast prompt template not found');
    }

    log.info(`Generating solo podcast script for course "${course.title}" [model=${modelString}]`);

    const result = await callLLM(
      {
        model: languageModel,
        system: prompts.system,
        prompt: prompts.user,
        maxOutputTokens: modelInfo?.outputWindow,
      },
      'course-podcast-solo',
      { retries: 1 },
    );

    const script = result.text.trim();
    if (!script) {
      return apiError(API_ERROR_CODES.GENERATION_FAILED, 500, 'LLM returned empty podcast script');
    }

    log.info(`Synthesizing solo podcast TTS [chars=${script.length}]`);
    const audio = await synthesizeCourseAudio(script, { voice: SOLO_VOICE });
    await writePodcastAudio(course.id, 'solo', audio);

    course.artifacts = course.artifacts || {};
    course.artifacts.podcast = course.artifacts.podcast || {};
    course.artifacts.podcast.solo = {
      status: 'ready',
      audioUrl,
      transcript: script,
      generatedAt: new Date().toISOString(),
    };
    await writeCourse(course);

    return apiSuccess({
      audioUrl,
      transcript: script,
      bytes: audio.byteLength,
      cached: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Solo podcast generation failed: ${message}`);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, message);
  }
}
