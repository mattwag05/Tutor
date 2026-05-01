import {
  synthesizeSpeech,
  type OpenAITTSVoice,
  type OpenAITTSModel,
} from './openai-tts';

const MAX_CHUNK_CHARS = 3800; // leave headroom under the 4096 SDK cap

/** Split text into TTS-sized chunks at paragraph then sentence boundaries. */
export function chunkForTTS(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return [trimmed];

  const out: string[] = [];
  let buf = '';
  const flush = () => {
    if (buf.trim()) out.push(buf.trim());
    buf = '';
  };

  // Paragraphs first.
  for (const para of trimmed.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length > maxChars) {
      flush();
      // Sentence-level split for long paragraphs.
      const sentences = p.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if ((buf + ' ' + s).trim().length > maxChars) flush();
        buf += (buf ? ' ' : '') + s;
      }
      flush();
      continue;
    }
    if ((buf + '\n\n' + p).length > maxChars) flush();
    buf += (buf ? '\n\n' : '') + p;
  }
  flush();
  return out;
}

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
  const chunks = chunkForTTS(text);
  if (chunks.length === 1) {
    return synthesizeSpeech(chunks[0], opts);
  }
  const bufs: Buffer[] = [];
  for (const chunk of chunks) {
    bufs.push(await synthesizeSpeech(chunk, opts));
  }
  return Buffer.concat(bufs);
}
