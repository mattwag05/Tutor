import { generateTTS } from '@/lib/audio/tts-providers';
import { resolveTTSApiKey, resolveTTSBaseUrl } from '@/lib/server/provider-config';
import { TTS_PROVIDERS } from '@/lib/audio/constants';
import { TTS_MAX_TEXT_LENGTH, splitLongSpeechText } from '@/lib/audio/tts-utils';
import type { TTSProviderId } from '@/lib/audio/types';

export interface CourseTTSOptions {
  providerId?: TTSProviderId;
  modelId?: string;
  voice?: string;
  speed?: number;
}

const DEFAULT_PROVIDER_ID: TTSProviderId = 'openai-tts';
const DEFAULT_VOICE = 'nova';
const DEFAULT_MAX_CHUNK_CHARS = 3800;

function defaultModelFor(providerId: TTSProviderId): string | undefined {
  const provider = TTS_PROVIDERS[providerId as keyof typeof TTS_PROVIDERS];
  return provider?.defaultModelId || undefined;
}

export async function synthesizeCourseAudio(
  text: string,
  opts: CourseTTSOptions = {},
): Promise<Buffer> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('TTS input text is empty');
  }

  const providerId = opts.providerId ?? DEFAULT_PROVIDER_ID;
  const provider = TTS_PROVIDERS[providerId as keyof typeof TTS_PROVIDERS];

  const apiKey = resolveTTSApiKey(providerId);
  const baseUrl = resolveTTSBaseUrl(providerId);

  if (provider?.requiresApiKey && !apiKey) {
    throw new Error(
      `No server-configured key found for TTS provider '${providerId}'. ` +
        `Configure it via the Settings UI or set the corresponding *_API_KEY env var.`,
    );
  }

  const config = {
    providerId,
    modelId: opts.modelId ?? defaultModelFor(providerId),
    voice: opts.voice ?? DEFAULT_VOICE,
    speed: opts.speed ?? 1.0,
    apiKey,
    baseUrl,
  };

  const maxChunk = TTS_MAX_TEXT_LENGTH[providerId] ?? DEFAULT_MAX_CHUNK_CHARS;
  const chunks =
    trimmed.length <= maxChunk ? [trimmed] : splitLongSpeechText(trimmed, maxChunk);

  if (chunks.length === 1) {
    const { audio } = await generateTTS(config, chunks[0]);
    return Buffer.from(audio);
  }

  const buffers = await Promise.all(
    chunks.map(async (chunk) => {
      const { audio } = await generateTTS(config, chunk);
      return Buffer.from(audio);
    }),
  );
  return Buffer.concat(buffers);
}
