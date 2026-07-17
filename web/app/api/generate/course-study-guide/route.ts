import { NextRequest, NextResponse } from 'next/server';
import { PROMPT_IDS } from '@/lib/generation/prompts';
import { createLogger } from '@/lib/logger';
import { generateCourseArtifact } from '@/lib/server/generate-artifact';

const log = createLogger('CourseStudyGuide');

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { courseId?: string };

    return await generateCourseArtifact(body.courseId ?? '', {
      artifactKey: 'studyGuide',
      promptId: PROMPT_IDS.COURSE_STUDY_GUIDE,
      sectionsOptions: { quizStyle: 'label' },
      extraVars: (course) => ({
        outline: course.sections
          .map((s, i) => `${i + 1}. ${s.title}${s.description ? ` — ${s.description}` : ''}`)
          .join('\n'),
      }),
      parseResult: (text) => {
        const content = text
          .replace(/^```(?:markdown)?\n?/, '')
          .replace(/\n?```$/, '')
          .trim();
        return content || null;
      },
      parseError: 'LLM returned empty study guide',
      emptySectionsError: 'Course has no ready sections to generate a study guide from',
      buildArtifact: (content) => ({ status: 'ready', content }),
      buildResponse: (content) => ({ content }),
      getCachedResponse: (course) => {
        if (course.artifacts?.studyGuide?.status === 'ready' && course.artifacts.studyGuide.content) {
          return { content: course.artifacts.studyGuide.content };
        }
        return null;
      },
      label: 'study guide',
    });
  } catch (error) {
    log.error(`Study guide generation failed: ${error}`);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
