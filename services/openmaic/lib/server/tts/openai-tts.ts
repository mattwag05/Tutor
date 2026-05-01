import OpenAI from 'openai';

export type OpenAITTSVoice =
  | 'alloy'
  | 'echo'
  | 'fable'
  | 'onyx'
  | 'nova'
  | 'shimmer';

export type OpenAITTSModel = 'tts-1' | 'tts-1-hd';

export interface SynthesizeOptions {
  voice?: OpenAITTSVoice;
  model?: OpenAITTSModel;
  speed?: number;
}

const MAX_INPUT_CHARS = 4096;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.TTS_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'TTS_OPENAI_API_KEY is not set. Course-builder TTS requires a direct OpenAI key (not OpenRouter).',
    );
  }
  // Explicit baseURL prevents the SDK from auto-reading OPENAI_BASE_URL (OpenRouter) from env.
  const baseURL = process.env.TTS_OPENAI_BASE_URL || 'https://api.openai.com/v1';
  if (!client) {
    client = new OpenAI({ apiKey, baseURL });
  }
  return client;
}

export async function synthesizeSpeech(
  text: string,
  opts: SynthesizeOptions = {},
): Promise<Buffer> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('TTS input text is empty');
  }
  const input = trimmed.length > MAX_INPUT_CHARS ? trimmed.slice(0, MAX_INPUT_CHARS) : trimmed;

  const response = await getClient().audio.speech.create({
    model: opts.model ?? 'tts-1',
    voice: opts.voice ?? 'nova',
    input,
    response_format: 'mp3',
    speed: opts.speed ?? 1.0,
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
