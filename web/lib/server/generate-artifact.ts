import { NextResponse } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { buildPrompt, PROMPT_IDS } from '@/lib/generation/prompts';
import type { PromptId } from '@/lib/generation/prompts';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolveModelFromProfile } from '@/lib/server/resolve-profile';
import type { ManifestTier } from '@/lib/ai/manifest/profiles';
import { isValidCourseId, readCourse, writeCourse } from '@/lib/server/course-storage';
import { createLogger } from '@/lib/logger';
import { sectionsToText } from '@/lib/course/sections-to-text';
import type { Course, CourseArtifacts } from '@/lib/types/course';

const log = createLogger('GenerateArtifact');

export interface GenerateArtifactConfig<T> {
  /** The artifact key under course.artifacts (e.g. 'flashcards', 'studyGuide', 'finalExam') */
  artifactKey: keyof CourseArtifacts;
  /** Prompt template ID */
  promptId: PromptId;
  /** Manifest tier for model selection (default: 'tutor-balanced') */
  tier?: ManifestTier;
  /** Options passed to sectionsToText */
  sectionsOptions?: { includeSectionId?: boolean; quizStyle?: 'omit' | 'label' | 'bracket-existing' };
  /** Extra prompt variables beyond courseTitle/language/sections */
  extraVars?: (course: Course) => Record<string, string>;
  /** Parse the LLM response text into the desired value. Return null to signal parse failure. */
  parseResult: (text: string, course: Course) => T | null;
  /** Error message when parsing fails */
  parseError: string;
  /** Error message when no ready sections exist */
  emptySectionsError: string;
  /** Build the artifact value to store in course.artifacts[key] */
  buildArtifact: (value: T) => Record<string, unknown>;
  /** Build the JSON response body on success */
  buildResponse: (value: T) => Record<string, unknown>;
  /**
   * Check for a cached result. Return the cached response object, or null to proceed with generation.
   * Receives the full course so you can inspect any artifact field.
   */
  getCachedResponse: (course: Course) => Record<string, unknown> | null;
  /** Label for logging (e.g. 'flashcards', 'study guide') */
  label: string;
}

/**
 * Shared helper for course artifact generation routes.
 * Handles validation, caching, model resolution, prompt building,
 * LLM call, response parsing, and artifact persistence.
 */
export async function generateCourseArtifact<T>(
  courseId: string,
  config: GenerateArtifactConfig<T>,
): Promise<NextResponse> {
  if (!courseId || !isValidCourseId(courseId)) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'courseId is required');
  }

  const course = await readCourse(courseId);
  if (!course) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, `Course ${courseId} not found`);
  }

  // Check cache
  const cached = config.getCachedResponse(course);
  if (cached) {
    return NextResponse.json(cached);
  }

  const tier = config.tier ?? 'tutor-balanced';
  const { model: languageModel, modelInfo, modelString } = await resolveModelFromProfile(tier);

  const sections = sectionsToText(course.sections, config.sectionsOptions);
  if (!sections) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, config.emptySectionsError);
  }

  const promptVars: Record<string, string> = {
    courseTitle: course.title,
    language: course.language,
    sections,
    ...(config.extraVars ? config.extraVars(course) : {}),
  };

  const prompts = buildPrompt(config.promptId, promptVars as Record<string, unknown>);
  if (!prompts) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, `${config.label} prompt template not found`);
  }

  log.info(`Generating ${config.label} for course "${course.title}" [model=${modelString}]`);

  const result = await callLLM(
    {
      model: languageModel,
      system: prompts.system,
      prompt: prompts.user,
      maxOutputTokens: modelInfo?.outputWindow,
    },
    config.label,
    { retries: 1 },
  );

  const value = config.parseResult(result.text, course);
  if (value === null || value === undefined) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, config.parseError);
  }

  course.artifacts = course.artifacts || {};
  (course.artifacts as Record<string, unknown>)[config.artifactKey] = config.buildArtifact(value);
  await writeCourse(course);

  return NextResponse.json(config.buildResponse(value));
}
