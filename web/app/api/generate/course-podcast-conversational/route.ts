import { promises as fs } from 'fs';
import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { buildPrompt, PROMPT_IDS } from '@/lib/generation/prompts';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
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
import { synthesizeLong } from '@/lib/server/tts/chunk';

const log = createLogger('CoursePodcastConversational');

export const maxDuration = 180;

const VOICE_A = 'nova' as const;
const VOICE_B = 'onyx' as const;

interface DialogueShape {
  turns: Array<{ speaker: 'A' | 'B'; text: string }>;
}

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

    const audioUrl = `/api/course/${course.id}/podcast/conversational`;
    const cached = course.artifacts?.podcast?.conversational;

    if (!body.force && cached?.status === 'ready' && cached.audioUrl) {
      try {
        const stat = await fs.stat(coursePodcastPath(course.id, 'conversational'));
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

    const { model: languageModel, modelInfo, modelString } = await resolveModelFromHeaders(req);

    const prompts = buildPrompt(PROMPT_IDS.PODCAST_CONVERSATIONAL, {
      courseTitle: course.title,
      topic: course.topic,
      language: course.language,
      sections,
      personalization: formatPersonalization(course.personalization),
    });

    if (!prompts) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Conversational podcast prompt template not found');
    }

    log.info(`Generating conversational podcast for course "${course.title}" [model=${modelString}]`);

    const result = await callLLM(
      {
        model: languageModel,
        system: prompts.system,
        prompt: prompts.user,
        maxOutputTokens: modelInfo?.outputWindow,
      },
      'course-podcast-conversational',
      { retries: 1 },
    );

    const parsed = parseJsonResponse<DialogueShape>(result.text);
    if (!parsed || !Array.isArray(parsed.turns) || parsed.turns.length === 0) {
      return apiError(
        API_ERROR_CODES.PARSE_FAILED,
        500,
        'LLM response could not be parsed into a dialogue',
      );
    }

    const turns = parsed.turns
      .filter((t) => (t.speaker === 'A' || t.speaker === 'B') && typeof t.text === 'string')
      .map((t) => ({ speaker: t.speaker as 'A' | 'B', text: t.text.trim() }))
      .filter((t) => t.text.length > 0);

    if (turns.length === 0) {
      return apiError(API_ERROR_CODES.GENERATION_FAILED, 500, 'Dialogue produced no usable turns');
    }

    log.info(`Synthesizing conversational podcast TTS [turns=${turns.length}]`);
    const buffers = await Promise.all(
      turns.map((t) =>
        synthesizeLong(t.text, { voice: t.speaker === 'A' ? VOICE_A : VOICE_B }),
      ),
    );
    const audio = Buffer.concat(buffers);
    await writePodcastAudio(course.id, 'conversational', audio);

    const transcript = turns
      .map((t) => `Host ${t.speaker}: ${t.text}`)
      .join('\n\n');

    course.artifacts = course.artifacts || {};
    course.artifacts.podcast = course.artifacts.podcast || {};
    course.artifacts.podcast.conversational = {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Conversational podcast generation failed: ${message}`);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, message);
  }
}
