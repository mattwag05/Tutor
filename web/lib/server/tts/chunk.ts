import {
  synthesizeSpeech,
  type OpenAITTSVoice,
  type OpenAITTSModel,
} from './openai-tts';
import { splitLongSpeechText } from '@/lib/audio/tts-utils';

const MAX_CHUNK_CHARS = 3800; // headroom under the 4096 SDK cap

interface SynthesizeLongOptions {
  voice?: OpenAITTSVoice;
  model?: OpenAITTSModel;
  speed?: number;
}

/**
 * Synthesize text of any length by chunking and concatenating MP3 buffers.
 * MP3 frames are self-delimiting, so naive Buffer.concat plays back in
 * Chrome and Safari without re-encoding.
 */
export async function synthesizeLong(
  text: string,
  opts: SynthesizeLongOptions = {},
): Promise<Buffer> {
  const chunks = splitLongSpeechText(text, MAX_CHUNK_CHARS);
  if (chunks.length === 1) {
    return synthesizeSpeech(chunks[0], opts);
  }
  const bufs = await Promise.all(chunks.map((c) => synthesizeSpeech(c, opts)));
  return Buffer.concat(bufs);
}
