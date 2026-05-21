import { NextRequest, NextResponse } from 'next/server';
import { PROMPT_IDS } from '@/lib/generation/prompts';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { createLogger } from '@/lib/logger';
import { generateCourseArtifact } from '@/lib/server/generate-artifact';

const log = createLogger('CourseFlashcards');

export const maxDuration = 120;

interface FlashcardShape {
  cards: Array<{ id: string; sectionId: string; front: string; back: string }>;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { courseId?: string };

    return await generateCourseArtifact(body.courseId ?? '', {
      artifactKey: 'flashcards',
      promptId: PROMPT_IDS.COURSE_FLASHCARDS,
      sectionsOptions: { includeSectionId: true },
      parseResult: (text) => {
        const parsed = parseJsonResponse<FlashcardShape>(text);
        if (!parsed || !Array.isArray(parsed.cards)) return null;
        return parsed.cards.map((c, i) => ({ ...c, id: c.id || `card_${i + 1}` }));
      },
      parseError: 'LLM response could not be parsed into flashcards',
      emptySectionsError: 'Course has no ready sections to generate flashcards from',
      buildArtifact: (cards) => ({ status: 'ready', cards }),
      buildResponse: (cards) => ({ cards }),
      getCachedResponse: (course) => {
        if (course.artifacts?.flashcards?.status === 'ready' && course.artifacts.flashcards.cards?.length) {
          return { cards: course.artifacts.flashcards.cards };
        }
        return null;
      },
      label: 'flashcards',
    });
  } catch (error) {
    log.error(`Flashcard generation failed: ${error}`);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
