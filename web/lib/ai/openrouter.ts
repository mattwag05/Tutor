/**
 * Shared helpers for OpenRouter-routed providers (LLM, TTS, ASR, image).
 *
 * OpenRouter recommends sending `HTTP-Referer` + `X-Title` so usage shows up
 * attributed in their dashboard. The referer defaults to the deployed Tutor
 * URL but can be overridden at runtime via `OPENROUTER_REFERER` — useful for
 * local dev and forks.
 */

export const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

const DEFAULT_REFERER = 'https://github.com/mattwag05/Tutor';
const DEFAULT_TITLE = 'Tutor';

export function getOpenRouterRankingHeaders(): Record<string, string> {
  return {
    'HTTP-Referer': process.env.OPENROUTER_REFERER || DEFAULT_REFERER,
    'X-Title': process.env.OPENROUTER_TITLE || DEFAULT_TITLE,
  };
}

export function normalizeBaseUrl(baseUrl: string | undefined, fallback: string): string {
  return (baseUrl || fallback).replace(/\/$/, '');
}
