import { NextRequest, NextResponse } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { buildPrompt, PROMPT_IDS } from '@/lib/generation/prompts';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { isValidCourseId, readCourse, writeCourse } from '@/lib/server/course-storage';
import { createLogger } from '@/lib/logger';
import { sectionsToText } from '@/lib/course/sections-to-text';

const log = createLogger('CourseFlashcards');

export const maxDuration = 120;

interface FlashcardShape {
  cards: Array<{ id: string; sectionId: string; front: string; back: string }>;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { courseId?: string };

    if (!body.courseId || !isValidCourseId(body.courseId)) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'courseId is required');
    }

    const course = await readCourse(body.courseId);
    if (!course) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, `Course ${body.courseId} not found`);
    }

    // Return cached result if already generated
    if (course.artifacts?.flashcards?.status === 'ready' && course.artifacts.flashcards.cards?.length) {
      return NextResponse.json({ cards: course.artifacts.flashcards.cards });
    }

    const { model: languageModel, modelInfo, modelString } = await resolveModelFromHeaders(req);

    const sections = sectionsToText(course.sections, { includeSectionId: true });
    if (!sections) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Course has no ready sections to generate flashcards from');
    }

    const prompts = buildPrompt(PROMPT_IDS.COURSE_FLASHCARDS, {
      courseTitle: course.title,
      language: course.language,
      sections,
    });

    if (!prompts) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Flashcard prompt template not found');
    }

    log.info(`Generating flashcards for course "${course.title}" [model=${modelString}]`);

    const result = await callLLM(
      {
        model: languageModel,
        system: prompts.system,
        prompt: prompts.user,
        maxOutputTokens: modelInfo?.outputWindow,
      },
      'course-flashcards',
      { retries: 1 },
    );

    const parsed = parseJsonResponse<FlashcardShape>(result.text);
    if (!parsed || !Array.isArray(parsed.cards)) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'LLM response could not be parsed into flashcards');
    }

    const cards = parsed.cards.map((c, i) => ({ ...c, id: c.id || `card_${i + 1}` }));

    course.artifacts = course.artifacts || {};
    course.artifacts.flashcards = { status: 'ready', cards };
    await writeCourse(course);

    return NextResponse.json({ cards });
  } catch (error) {
    log.error(`Flashcard generation failed: ${error}`);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
