import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { callLLM } from '@/lib/ai/llm';
import { buildPrompt, PROMPT_IDS } from '@/lib/generation/prompts';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolveModelFromProfile } from '@/lib/server/resolve-profile';
import { getRAGContextForGeneration, isDeepTutorEnabled } from '@/lib/integrations';
import { createLogger } from '@/lib/logger';
import { formatPersonalization } from '@/lib/generation/format-personalization';
import type {
  CourseBlock,
  CourseCitation,
  CoursePersonalization,
  CourseSection,
  Language,
} from '@/lib/types/course';

const log = createLogger('CourseSection');

export const maxDuration = 300;

interface GeneratedSectionShape {
  sectionId?: string;
  blocks: CourseBlock[];
  citations?: CourseCitation[];
}

interface OutlineSummary {
  id: string;
  order: number;
  title: string;
  description?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      courseTitle?: string;
      topic?: string;
      language?: Language;
      courseOutline?: OutlineSummary[];
      section?: { id: string; order: number; title: string; description?: string };
      knowledgeBase?: string;
      personalization?: CoursePersonalization;
    };

    if (!body.topic || !body.section?.title) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'topic and section.title are required');
    }

    const language: Language = body.language || 'en-US';
    const { model: languageModel, modelInfo, modelString } = await resolveModelFromProfile('tutor-balanced');

    // RAG enrichment — query the KB for the specific section topic, not just
    // the course topic, so each section gets context targeted to its content.
    let researchContext = language === 'zh-CN' ? '无' : 'None';
    if (body.knowledgeBase && isDeepTutorEnabled()) {
      try {
        const sectionQuery = `${body.section.title}: ${body.section.description || body.topic}`;
        const ragContext = await getRAGContextForGeneration(body.knowledgeBase, sectionQuery);
        if (ragContext) {
          researchContext = ragContext;
          log.info(
            `RAG enriched section "${body.section.title}" from KB "${body.knowledgeBase}"`,
          );
        }
      } catch (error) {
        log.warn(`RAG enrichment failed for section, proceeding without: ${error}`);
      }
    }

    const courseOutlineText = (body.courseOutline || [])
      .map((s) => `${s.order}. ${s.title}${s.description ? ` — ${s.description}` : ''}`)
      .join('\n');

    const personalization = formatPersonalization(body.personalization);

    const prompts = buildPrompt(PROMPT_IDS.COURSE_SECTION, {
      courseTitle: body.courseTitle || body.topic,
      topic: body.topic,
      language,
      courseOutline: courseOutlineText || '(not provided)',
      sectionId: body.section.id,
      sectionOrder: String(body.section.order),
      sectionTitle: body.section.title,
      sectionDescription: body.section.description || '',
      researchContext,
      personalization,
    });

    if (!prompts) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Course section prompt template not found');
    }

    log.info(
      `Generating section "${body.section.title}" [model=${modelString}] [kb=${body.knowledgeBase || 'none'}]`,
    );

    const result = await callLLM(
      {
        model: languageModel,
        system: prompts.system,
        prompt: prompts.user,
        maxOutputTokens: modelInfo?.outputWindow,
      },
      'course-section',
      { retries: 1 },
    );

    const parsed = parseJsonResponse<GeneratedSectionShape>(result.text);
    if (!parsed || !Array.isArray(parsed.blocks)) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'LLM response could not be parsed into a course section',
      );
    }

    // Ensure every block has an id
    const blocks: CourseBlock[] = parsed.blocks.map((b, i) => ({
      ...b,
      id: b.id || `${body.section!.id}_b${i + 1}`,
    })) as CourseBlock[];

    // Ensure every citation has an id
    const citations: CourseCitation[] = (parsed.citations || []).map((c, i) => ({
      ...c,
      id: c.id || `src_${i + 1}_${nanoid(4)}`,
    }));

    const section: CourseSection = {
      id: body.section.id,
      order: body.section.order,
      title: body.section.title,
      description: body.section.description,
      blocks,
      goDeeperPrompts: [], // filled in at outline time, reused in UI
      status: 'ready',
    };

    return NextResponse.json({ section, citations });
  } catch (error) {
    log.error(`Course section generation failed: ${error}`);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
