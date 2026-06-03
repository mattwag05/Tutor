import { NextRequest, NextResponse } from 'next/server';
import { PROMPT_IDS } from '@/lib/generation/prompts';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { createLogger } from '@/lib/logger';
import { generateCourseArtifact } from '@/lib/server/generate-artifact';

const log = createLogger('CourseDiagram');

export const maxDuration = 120;

type DiagramResult = {
  title: string;
  mermaid: string;
  explanation: string;
};

function normalizeDiagram(text: string): DiagramResult | null {
  const parsed = parseJsonResponse<Partial<DiagramResult>>(text);
  const title = parsed?.title?.trim();
  const mermaid = parsed?.mermaid?.trim();
  const explanation = parsed?.explanation?.trim();
  if (!title || !mermaid || !explanation) return null;
  if (!mermaid.startsWith('flowchart')) return null;
  return { title, mermaid, explanation };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { courseId?: string };

    return await generateCourseArtifact(body.courseId ?? '', {
      artifactKey: 'diagram',
      promptId: PROMPT_IDS.COURSE_DIAGRAM,
      sectionsOptions: { quizStyle: 'label' },
      parseResult: normalizeDiagram,
      parseError: 'LLM response could not be parsed into a Mermaid diagram',
      emptySectionsError: 'Course has no ready sections to generate a diagram from',
      buildArtifact: (diagram) => ({ status: 'ready', ...diagram }),
      buildResponse: (diagram) => diagram,
      getCachedResponse: (course) => {
        const diagram = course.artifacts?.diagram;
        if (diagram?.status === 'ready' && diagram.mermaid) {
          return {
            title: diagram.title,
            mermaid: diagram.mermaid,
            explanation: diagram.explanation,
          };
        }
        return null;
      },
      label: 'course diagram',
    });
  } catch (error) {
    log.error(`Diagram generation failed: ${error}`);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
