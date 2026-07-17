// Pure constant + type module — no runtime imports, safe to use from both
// server-only modules (web/lib/server/*) and client components ("use client").

export const PROFILED_SERVICES = [
  'llm',
  'embedding',
  'tts',
  'asr',
  'image',
  'video',
] as const;

export type ProfiledService = (typeof PROFILED_SERVICES)[number];
export type CatalogService = ProfiledService | 'search';
