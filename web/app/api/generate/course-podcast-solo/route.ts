import { NextRequest } from 'next/server';
import { PROMPT_IDS } from '@/lib/generation/prompts';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { generatePodcast } from '@/lib/server/generate-podcast';
import { createLogger } from '@/lib/logger';
import { synthesizeCourseAudio } from '@/lib/server/tts/synthesize';

const log = createLogger('CoursePodcastSolo');

export const maxDuration = 180;

const SOLO_VOICE = 'nova' as const;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { courseId?: string; force?: boolean };

    return generatePodcast(body.courseId ?? '', {
      mode: 'solo',
      promptId: PROMPT_IDS.PODCAST_SOLO,
      llmContextLabel: 'course-podcast-solo',
      parseScript: async (response: string) => {
        const script = response.trim();
        return script ? { script } : null;
      },
      synthesizeAudio: async (parsed) => {
        const script = parsed.script!;
        log.info(`Synthesizing solo podcast TTS [chars=${script.length}]`);
        const audio = await synthesizeCourseAudio(script, { voice: SOLO_VOICE });
        return { audio, transcript: script };
      },
      missingPromptMessage: 'Solo podcast prompt template not found',
      emptyResultMessage: 'LLM returned empty podcast script',
    }, body.force);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Solo podcast generation failed: ${message}`);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, message);
  }
}