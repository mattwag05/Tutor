import { NextRequest, NextResponse } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { buildPrompt, PROMPT_IDS } from '@/lib/generation/prompts';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { isValidCourseId, readCourse, writeCourse } from '@/lib/server/course-storage';
import { createLogger } from '@/lib/logger';
import { sectionsToText } from '@/lib/course/sections-to-text';
import type { FillBlankQuizBlock, MultipleChoiceQuizBlock } from '@/lib/types/course';

const log = createLogger('CourseFinalExam');

export const maxDuration = 120;

interface ExamShape {
  questions: Array<FillBlankQuizBlock | MultipleChoiceQuizBlock>;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { courseId?: string; targetCount?: number };

    if (!body.courseId || !isValidCourseId(body.courseId)) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'courseId is required');
    }

    const course = await readCourse(body.courseId);
    if (!course) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, `Course ${body.courseId} not found`);
    }

    // Return cached result if already generated
    if (course.artifacts?.finalExam?.status === 'ready' && course.artifacts.finalExam.questions?.length) {
      return NextResponse.json({ questions: course.artifacts.finalExam.questions });
    }

    const { model: languageModel, modelInfo, modelString } = await resolveModelFromHeaders(req);

    const sections = sectionsToText(course.sections, { quizStyle: 'bracket-existing' });
    if (!sections) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Course has no ready sections to generate an exam from');
    }

    // Target ~2 questions per section, capped at 20, minimum 5
    const sectionCount = course.sections.filter((s) => s.status === 'ready').length;
    const targetCount = body.targetCount ?? Math.min(20, Math.max(5, sectionCount * 2));

    const prompts = buildPrompt(PROMPT_IDS.COURSE_FINAL_EXAM, {
      courseTitle: course.title,
      language: course.language,
      targetCount: String(targetCount),
      sections,
    });

    if (!prompts) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Final exam prompt template not found');
    }

    log.info(`Generating final exam for course "${course.title}" [targetCount=${targetCount}] [model=${modelString}]`);

    const result = await callLLM(
      {
        model: languageModel,
        system: prompts.system,
        prompt: prompts.user,
        maxOutputTokens: modelInfo?.outputWindow,
      },
      'course-final-exam',
      { retries: 1 },
    );

    const parsed = parseJsonResponse<ExamShape>(result.text);
    if (!parsed || !Array.isArray(parsed.questions)) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'LLM response could not be parsed into exam questions');
    }

    const questions = parsed.questions.map((q, i) => ({
      ...q,
      id: q.id || `exam_q${i + 1}`,
    })) as Array<FillBlankQuizBlock | MultipleChoiceQuizBlock>;

    course.artifacts = course.artifacts || {};
    course.artifacts.finalExam = { status: 'ready', questions };
    await writeCourse(course);

    return NextResponse.json({ questions });
  } catch (error) {
    log.error(`Final exam generation failed: ${error}`);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
