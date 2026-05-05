import { NextRequest, NextResponse } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { buildPrompt, PROMPT_IDS } from '@/lib/generation/prompts';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolveModelFromProfile } from '@/lib/server/resolve-profile';
import { isValidCourseId, readCourse, writeCourse } from '@/lib/server/course-storage';
import { createLogger } from '@/lib/logger';
import { sectionsToText } from '@/lib/course/sections-to-text';

const log = createLogger('CourseStudyGuide');

export const maxDuration = 120;

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
    if (course.artifacts?.studyGuide?.status === 'ready' && course.artifacts.studyGuide.content) {
      return NextResponse.json({ content: course.artifacts.studyGuide.content });
    }

    const { model: languageModel, modelInfo, modelString } = await resolveModelFromProfile('tutor-balanced');

    const sections = sectionsToText(course.sections, { quizStyle: 'label' });
    if (!sections) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Course has no ready sections to generate a study guide from');
    }

    const outline = course.sections
      .map((s, i) => `${i + 1}. ${s.title}${s.description ? ` — ${s.description}` : ''}`)
      .join('\n');

    const prompts = buildPrompt(PROMPT_IDS.COURSE_STUDY_GUIDE, {
      courseTitle: course.title,
      language: course.language,
      outline,
      sections,
    });

    if (!prompts) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Study guide prompt template not found');
    }

    log.info(`Generating study guide for course "${course.title}" [model=${modelString}]`);

    const result = await callLLM(
      {
        model: languageModel,
        system: prompts.system,
        prompt: prompts.user,
        maxOutputTokens: modelInfo?.outputWindow,
      },
      'course-study-guide',
      { retries: 1 },
    );

    // Study guide is plain Markdown — strip any accidental JSON fencing
    const content = result.text
      .replace(/^```(?:markdown)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim();

    if (!content) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'LLM returned empty study guide');
    }

    course.artifacts = course.artifacts || {};
    course.artifacts.studyGuide = { status: 'ready', content };
    await writeCourse(course);

    return NextResponse.json({ content });
  } catch (error) {
    log.error(`Study guide generation failed: ${error}`);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
