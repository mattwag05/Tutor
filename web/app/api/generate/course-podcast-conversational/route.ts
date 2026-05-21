import { NextRequest } from 'next/server';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { PROMPT_IDS } from '@/lib/generation/prompts';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { generatePodcast } from '@/lib/server/generate-podcast';
import { createLogger } from '@/lib/logger';
import { synthesizeCourseAudio } from '@/lib/server/tts/synthesize';

const log = createLogger('CoursePodcastConversational');

export const maxDuration = 180;

const VOICE_A = 'nova' as const;
const VOICE_B = 'onyx' as const;

interface DialogueShape {
  turns: Array<{ speaker: 'A' | 'B'; text: string }>;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { courseId?: string; force?: boolean };

    return generatePodcast(body.courseId ?? '', {
      mode: 'conversational',
      promptId: PROMPT_IDS.PODCAST_CONVERSATIONAL,
      llmContextLabel: 'course-podcast-conversational',
      parseScript: async (response: string) => {
        const parsed = parseJsonResponse<DialogueShape>(response);
        if (!parsed || !Array.isArray(parsed.turns) || parsed.turns.length === 0) {
          return null;
        }
        const turns = parsed.turns
          .filter((t) => (t.speaker === 'A' || t.speaker === 'B') && typeof t.text === 'string')
          .map((t) => ({ speaker: t.speaker as 'A' | 'B', text: t.text.trim() }))
          .filter((t) => t.text.length > 0);
        return turns.length > 0 ? { turns } : null;
      },
      synthesizeAudio: async (parsed) => {
        const turns = parsed.turns!;
        log.info(`Synthesizing conversational podcast TTS [turns=${turns.length}]`);
        const buffers = await Promise.all(
          turns.map((t) =>
            synthesizeCourseAudio(t.text, { voice: t.speaker === 'A' ? VOICE_A : VOICE_B }),
          ),
        );
        const audio = Buffer.concat(buffers);
        const transcript = turns
          .map((t) => `Host ${t.speaker}: ${t.text}`)
          .join('\n\n');
        return { audio, transcript };
      },
      missingPromptMessage: 'Conversational podcast prompt template not found',
      emptyResultMessage: 'LLM response could not be parsed into a dialogue',
    }, body.force);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Conversational podcast generation failed: ${message}`);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, message);
  }
}