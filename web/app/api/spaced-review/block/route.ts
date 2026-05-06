/**
 * Spaced-review block lookup.
 *
 * GET /api/spaced-review/block?source=classroom|course&source_id=...
 *
 * Returns the normalized question payload for an attempt's source_id so
 * the Python picker can reconstruct a ReviewCandidate without
 * duplicating classroom/course storage on the backend. `book` is
 * resolved in-process via BookEngine and is NOT supported here.
 *
 * source_id formats:
 *   classroom : "{classroomId}::{sceneId}::{questionId}"
 *   course    : "{courseId}::{sectionId}::{blockId}"
 */

import { NextResponse, type NextRequest } from 'next/server';

import { readClassroom } from '@/lib/server/classroom-storage';
import { readCourse } from '@/lib/server/course-storage';
import type { Scene, QuizContent, QuizQuestion } from '@/lib/types/stage';
import type {
  CourseBlock,
  CourseSection,
  FillBlankQuizBlock,
  MultipleChoiceQuizBlock,
} from '@/lib/types/course';

interface NormalizedBlockPayload {
  question: string;
  options: Record<string, string>;
  correct_answer: string;
  explanation: string;
  question_type: string;
  difficulty: string;
  concentration: string;
}

function notFound(detail: string) {
  return NextResponse.json({ error: detail }, { status: 404 });
}

function badRequest(detail: string) {
  return NextResponse.json({ error: detail }, { status: 400 });
}

function parseSourceId(sourceId: string): [string, string, string] | null {
  const parts = sourceId.split('::');
  if (parts.length !== 3 || parts.some((p) => !p)) return null;
  return [parts[0], parts[1], parts[2]];
}

function findScene(scenes: Scene[], sceneId: string): Scene | null {
  return scenes.find((s) => s.id === sceneId) ?? null;
}

function findQuizQuestion(scene: Scene, questionId: string): QuizQuestion | null {
  if (scene.content.type !== 'quiz') return null;
  const quiz = scene.content as QuizContent;
  return quiz.questions.find((q) => q.id === questionId) ?? null;
}

function classroomQuestionToPayload(
  question: QuizQuestion,
  sceneTitle: string,
): NormalizedBlockPayload {
  const options: Record<string, string> = {};
  for (const opt of question.options ?? []) {
    options[opt.label] = opt.value;
  }
  // QuizQuestion.answer is string[]; for single/short_answer pick first.
  const correct = (question.answer ?? []).join(', ');
  return {
    question: question.question,
    options,
    correct_answer: correct,
    explanation: question.analysis ?? '',
    question_type: question.type === 'short_answer' ? 'written' : 'choice',
    difficulty: 'medium',
    concentration: sceneTitle,
  };
}

function findSection(sections: CourseSection[], sectionId: string): CourseSection | null {
  for (const section of sections) {
    if (section.id === sectionId) return section;
    if (section.subSections) {
      const nested = findSection(section.subSections, sectionId);
      if (nested) return nested;
    }
  }
  return null;
}

function findCourseBlock(section: CourseSection, blockId: string): CourseBlock | null {
  return section.blocks.find((b) => b.id === blockId) ?? null;
}

function multipleChoiceToPayload(
  block: MultipleChoiceQuizBlock,
  sectionTitle: string,
): NormalizedBlockPayload {
  const options: Record<string, string> = {};
  block.choices.forEach((choice, i) => {
    options[String.fromCharCode(65 + i)] = choice;
  });
  const correctLetter = String.fromCharCode(65 + block.correctIndex);
  return {
    question: block.question,
    options,
    correct_answer: correctLetter,
    explanation: block.explanation,
    question_type: 'multiple-choice',
    difficulty: 'medium',
    concentration: sectionTitle,
  };
}

function fillBlankToPayload(
  block: FillBlankQuizBlock,
  sectionTitle: string,
): NormalizedBlockPayload {
  const options: Record<string, string> = {};
  if (block.choices) {
    block.choices.forEach((choice, i) => {
      options[String.fromCharCode(65 + i)] = choice;
    });
  }
  return {
    question: block.question,
    options,
    correct_answer: block.correctAnswer,
    explanation: block.explanation,
    question_type: 'fill-in-the-blank',
    difficulty: 'medium',
    concentration: sectionTitle,
  };
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const source = sp.get('source');
  const sourceId = sp.get('source_id');

  if (!source || !sourceId) {
    return badRequest('source and source_id are required');
  }
  const parsed = parseSourceId(sourceId);
  if (!parsed) {
    return badRequest('source_id must be three :: -separated non-empty parts');
  }

  if (source === 'classroom') {
    const [classroomId, sceneId, questionId] = parsed;
    const data = await readClassroom(classroomId);
    if (!data) return notFound(`classroom not found: ${classroomId}`);
    const scene = findScene(data.scenes, sceneId);
    if (!scene) return notFound(`scene not found: ${sceneId}`);
    const question = findQuizQuestion(scene, questionId);
    if (!question) return notFound(`question not found: ${questionId}`);
    return NextResponse.json(classroomQuestionToPayload(question, scene.title));
  }

  if (source === 'course') {
    const [courseId, sectionId, blockId] = parsed;
    const course = await readCourse(courseId);
    if (!course) return notFound(`course not found: ${courseId}`);
    const section = findSection(course.sections, sectionId);
    if (!section) return notFound(`section not found: ${sectionId}`);
    const block = findCourseBlock(section, blockId);
    if (!block) return notFound(`block not found: ${blockId}`);
    if (block.type === 'multipleChoiceQuiz') {
      return NextResponse.json(multipleChoiceToPayload(block, section.title));
    }
    if (block.type === 'fillBlankQuiz') {
      return NextResponse.json(fillBlankToPayload(block, section.title));
    }
    return badRequest(`block type ${block.type} is not a quiz block`);
  }

  return badRequest(`unsupported source: ${source}`);
}
