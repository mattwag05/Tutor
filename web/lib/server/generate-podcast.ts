import { promises as fs } from 'fs';
import { callLLM } from '@/lib/ai/llm';
import { buildPrompt, type PromptId } from '@/lib/generation/prompts';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolveModelFromProfile } from '@/lib/server/resolve-profile';
import {
  coursePodcastPath,
  isValidCourseId,
  PodcastMode,
  readCourse,
  writeCourse,
  writePodcastAudio,
} from '@/lib/server/course-storage';
import { createLogger } from '@/lib/logger';
import { sectionsToText } from '@/lib/course/sections-to-text';
import { formatPersonalization } from '@/lib/generation/format-personalization';
import { synthesizeCourseAudio } from '@/lib/server/tts/synthesize';

const log = createLogger('GeneratePodcast');

export interface PodcastTurn {
  speaker: string;
  text: string;
}

export interface PodcastRouteOptions {
  mode: PodcastMode;
  promptId: PromptId;
  llmContextLabel: string;
  parseScript: (response: string) => Promise<{ turns?: PodcastTurn[]; script?: string } | null>;
  synthesizeAudio: (parsed: { turns?: PodcastTurn[]; script?: string }) => Promise<{ audio: Buffer; transcript: string }>;
  missingPromptMessage: string;
  emptyResultMessage: string;
}

export async function generatePodcast(courseId: string, options: PodcastRouteOptions, force?: boolean) {
  if (!courseId || !isValidCourseId(courseId)) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'courseId is required');
  }

  const course = await readCourse(courseId);
  if (!course) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, `Course ${courseId} not found`);
  }

  const audioUrl = `/api/course/${course.id}/podcast/${options.mode}`;
  const cached = course.artifacts?.podcast?.[options.mode];

  if (!force && cached?.status === 'ready' && cached.audioUrl) {
    try {
      const stat = await fs.stat(coursePodcastPath(course.id, options.mode));
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

  const prompts = buildPrompt(options.promptId, {
    courseTitle: course.title,
    topic: course.topic,
    language: course.language,
    sections,
    personalization: formatPersonalization(course.personalization),
  });

  if (!prompts) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, options.missingPromptMessage);
  }

  log.info(`Generating ${options.mode} podcast for course "${course.title}" [model=${modelString}]`);

  const result = await callLLM(
    {
      model: languageModel,
      system: prompts.system,
      prompt: prompts.user,
      maxOutputTokens: modelInfo?.outputWindow,
    },
    options.llmContextLabel,
    { retries: 1 },
  );

  const parsed = await options.parseScript(result.text);
  if (!parsed) {
    return apiError(API_ERROR_CODES.PARSE_FAILED, 500, options.emptyResultMessage);
  }

  const { audio, transcript } = await options.synthesizeAudio(parsed);

  await writePodcastAudio(course.id, options.mode, audio);

  course.artifacts = course.artifacts || {};
  course.artifacts.podcast = course.artifacts.podcast || {};
  (course.artifacts.podcast as Record<string, unknown>)[options.mode] = {
    status: 'ready',
    audioUrl,
    transcript,
    generatedAt: new Date().toISOString(),
  };
  await writeCourse(course);

  return apiSuccess({
    audioUrl,
    transcript,
    bytes: audio.byteLength,
    cached: false,
  });
}
