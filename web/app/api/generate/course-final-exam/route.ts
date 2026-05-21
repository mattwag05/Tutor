import { NextRequest, NextResponse } from 'next/server';
import { PROMPT_IDS } from '@/lib/generation/prompts';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { createLogger } from '@/lib/logger';
import { generateCourseArtifact } from '@/lib/server/generate-artifact';
import type { FillBlankQuizBlock, MultipleChoiceQuizBlock } from '@/lib/types/course';

const log = createLogger('CourseFinalExam');

export const maxDuration = 120;

interface ExamShape {
  questions: Array<FillBlankQuizBlock | MultipleChoiceQuizBlock>;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { courseId?: string; targetCount?: number };

    return await generateCourseArtifact(body.courseId ?? '', {
      artifactKey: 'finalExam',
      promptId: PROMPT_IDS.COURSE_FINAL_EXAM,
      tier: 'tutor-premium',
      sectionsOptions: { quizStyle: 'bracket-existing' },
      extraVars: (course) => {
        const sectionCount = course.sections.filter((s) => s.status === 'ready').length;
        const targetCount = body.targetCount ?? Math.min(20, Math.max(5, sectionCount * 2));
        return { targetCount: String(targetCount) };
      },
      parseResult: (text) => {
        const parsed = parseJsonResponse<ExamShape>(text);
        if (!parsed || !Array.isArray(parsed.questions)) return null;
        return parsed.questions.map((q, i) => ({
          ...q,
          id: q.id || `exam_q${i + 1}`,
        })) as Array<FillBlankQuizBlock | MultipleChoiceQuizBlock>;
      },
      parseError: 'LLM response could not be parsed into exam questions',
      emptySectionsError: 'Course has no ready sections to generate an exam from',
      buildArtifact: (questions) => ({ status: 'ready', questions }),
      buildResponse: (questions) => ({ questions }),
      getCachedResponse: (course) => {
        if (course.artifacts?.finalExam?.status === 'ready' && course.artifacts.finalExam.questions?.length) {
          return { questions: course.artifacts.finalExam.questions };
        }
        return null;
      },
      label: 'final exam',
    });
  } catch (error) {
    log.error(`Final exam generation failed: ${error}`);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}