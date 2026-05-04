/**
 * DeepTutor API Client
 *
 * Provides typed wrappers for DeepTutor's REST and WebSocket APIs.
 * Handles connection errors gracefully — returns specific error types
 * that callers can check to trigger fallback behavior.
 */

import {
  type KnowledgeBaseInfo,
  type KnowledgeBaseDetails,
  type RAGQueryResult,
  type DeepTutorConfig,
  DeepTutorUnavailableError,
  DeepTutorAPIError,
} from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('DeepTutor');

// ==================== Configuration ====================

const DEFAULT_CONFIG: DeepTutorConfig = {
  baseUrl: process.env.DEEPTUTOR_API_URL || 'http://127.0.0.1:8001',
  queryTimeout: 30_000,
  generationTimeout: 120_000,
  enabled: process.env.DEEPTUTOR_ENABLED !== 'false',
};

const config: DeepTutorConfig = { ...DEFAULT_CONFIG };
export function getDeepTutorConfig(): DeepTutorConfig {
  return { ...config };
}

export function isDeepTutorEnabled(): boolean {
  return config.enabled;
}

// ==================== Internal Helpers ====================

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = config.queryTimeout,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new DeepTutorUnavailableError(`Request to ${url} timed out after ${timeout}ms`);
    }
    throw new DeepTutorUnavailableError(
      `Failed to connect to DeepTutor at ${config.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function apiGet<T>(path: string, timeout?: number): Promise<T> {
  const url = `${config.baseUrl}${path}`;
  const response = await fetchWithTimeout(url, {}, timeout);

  if (!response.ok) {
    throw new DeepTutorAPIError(
      `DeepTutor API error: ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

async function apiPost<T>(
  path: string,
  body: unknown,
  timeout?: number,
): Promise<{ status: number; body: T }> {
  const url = `${config.baseUrl}${path}`;
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    },
    timeout,
  );

  if (response.status === 204) {
    return { status: 204, body: undefined as unknown as T };
  }

  const data = (await response.json()) as T;
  if (!response.ok) {
    throw new DeepTutorAPIError(
      `DeepTutor API error: ${response.status} ${response.statusText}`,
      response.status,
    );
  }
  return { status: response.status, body: data };
}

// ==================== Health Check ====================

export async function checkHealth(): Promise<boolean> {
  if (!config.enabled) {
    return false;
  }

  try {
    await fetchWithTimeout(`${config.baseUrl}/api/v1/knowledge/health`, {}, 5_000);
    log.info('DeepTutor health check passed');
    return true;
  } catch {
    log.warn('DeepTutor health check failed — integration features will use fallback behavior');
    return false;
  }
}

// ==================== Knowledge Base API ====================

export async function listKnowledgeBases(): Promise<KnowledgeBaseInfo[]> {
  if (!config.enabled) return [];

  // Intentionally does NOT swallow `DeepTutorUnavailableError`. Callers
  // (notably `/api/knowledge-bases`) catch and report `available: false`
  // so the KB selector can render the "unavailable" state instead of an
  // empty-but-present picker — the degraded UX is the point.
  return await apiGet<KnowledgeBaseInfo[]>('/api/v1/knowledge/list');
}

export async function getKnowledgeBase(kbName: string): Promise<KnowledgeBaseDetails | null> {
  if (!config.enabled) return null;

  try {
    return await apiGet<KnowledgeBaseDetails>(
      `/api/v1/knowledge/${encodeURIComponent(kbName)}`,
    );
  } catch (error) {
    if (error instanceof DeepTutorUnavailableError) {
      log.warn(`DeepTutor unavailable for KB details: ${kbName}`);
      return null;
    }
    throw error;
  }
}

export async function listRAGProviders(): Promise<string[]> {
  if (!config.enabled) return [];

  try {
    return await apiGet<string[]>('/api/v1/knowledge/rag-providers');
  } catch (error) {
    if (error instanceof DeepTutorUnavailableError) return [];
    throw error;
  }
}

// ==================== RAG Query ====================

interface KnowledgeQueryPassage {
  text: string;
  score: number;
  source: string;
  page?: string | null;
  title?: string | null;
  chunk_id?: string | null;
}

interface KnowledgeQueryResponse {
  query: string;
  kb_name: string;
  provider: string;
  results: KnowledgeQueryPassage[];
  warning?: string | null;
  needs_reindex?: boolean;
}

/**
 * Query a knowledge base for relevant passages via real retrieval.
 *
 * Calls the synchronous REST endpoint `POST /api/v1/knowledge/{kb}/query`
 * (added in Phase A.1 of the unified-tutor merge) and returns ranked
 * passages plus a synthesized `answer` field built from concatenated top-K
 * passage text. Suitable for single-shot generation-time grounding.
 *
 * Falls back to an empty result on `DeepTutorUnavailableError` /
 * `needs_reindex` so callers never see a hard failure — `getRAGContextForGeneration`
 * detects empty results and skips the injection block.
 */
export async function queryKnowledgeBase(
  kbName: string,
  query: string,
  options?: { timeout?: number; topK?: number },
): Promise<{ answer: string; sources: RAGQueryResult[] }> {
  if (!config.enabled) {
    throw new DeepTutorUnavailableError('DeepTutor integration is disabled');
  }

  if (!query || !query.trim()) {
    return { answer: '', sources: [] };
  }

  const topK = options?.topK ?? 8;
  let payload: KnowledgeQueryResponse;
  try {
    const { body } = await apiPost<KnowledgeQueryResponse>(
      `/api/v1/knowledge/${encodeURIComponent(kbName)}/query`,
      { query, top_k: topK },
      options?.timeout,
    );
    payload = body;
  } catch (error) {
    if (error instanceof DeepTutorAPIError && error.status === 409) {
      log.warn(`KB "${kbName}" needs reindex — returning empty RAG result`);
      return { answer: '', sources: [] };
    }
    throw error;
  }

  if (payload.warning) {
    log.warn(`RAG warning for KB "${kbName}": ${payload.warning}`);
  }

  const passages = payload.results ?? [];
  if (passages.length === 0) {
    return { answer: '', sources: [] };
  }

  // Synthesize an `answer` by concatenating passage text. Downstream
  // (`getRAGContextForGeneration`) caps the total at MAX_RAG_CONTEXT_CHARS.
  const answer = passages.map((p) => p.text).join('\n\n');
  const sources: RAGQueryResult[] = passages.map((p) => ({
    content: p.text,
    score: p.score,
    source: p.source,
    metadata: {
      kind: 'kb-passage',
      page: p.page ?? null,
      title: p.title ?? null,
      chunk_id: p.chunk_id ?? null,
    },
  }));

  return { answer, sources };
}

// ==================== Convenience: Get RAG Context for Generation ====================

// Soft cap on injected RAG context size before we summarize.
// Roughly 4k tokens at ~4 chars/token.
const MAX_RAG_CONTEXT_CHARS = 16_000;

// In-memory cache for getRAGContextForGeneration. Same KB + same requirement
// inside the TTL skips the WebSocket round-trip — common during retries and
// section-by-section generation against the same KB.
const RAG_CTX_CACHE_TTL_MS = 120_000; // 2 minutes
const RAG_CTX_CACHE_MAX_ENTRIES = 200;
type RagCacheEntry = { value: string | null; expiresAt: number };
const ragContextCache = new Map<string, RagCacheEntry>();

// FNV-1a 32-bit — small, fast, no dependency. Cache key only, not security.
function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function ragContextCacheKey(kbName: string, requirement: string): string {
  return `${kbName}:${hashString(requirement)}`;
}

function getCachedRagContext(key: string): string | null | undefined {
  const entry = ragContextCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    ragContextCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCachedRagContext(key: string, value: string | null): void {
  if (ragContextCache.size >= RAG_CTX_CACHE_MAX_ENTRIES) {
    // Evict oldest insertion (Map preserves insertion order).
    const oldestKey = ragContextCache.keys().next().value;
    if (oldestKey !== undefined) ragContextCache.delete(oldestKey);
  }
  ragContextCache.set(key, { value, expiresAt: Date.now() + RAG_CTX_CACHE_TTL_MS });
}

export function clearRagContextCache(): void {
  ragContextCache.clear();
}

/**
 * Fetch RAG context from DeepTutor and format it for injection into
 * OpenMAIC's outline generation pipeline.
 *
 * Returns formatted string suitable for the `researchContext` parameter,
 * or null if DeepTutor is unavailable or returns no useful metadata.
 *
 * If the payload exceeds MAX_RAG_CONTEXT_CHARS it is truncated with a
 * visible marker (spec Q5).
 */
export async function getRAGContextForGeneration(
  kbName: string,
  topic: string,
): Promise<string | null> {
  const cacheKey = ragContextCacheKey(kbName, topic);
  const cached = getCachedRagContext(cacheKey);
  if (cached !== undefined) {
    log.info(`RAG context cache hit for "${kbName}"`);
    return cached;
  }

  try {
    const { answer, sources } = await queryKnowledgeBase(kbName, topic);

    if (!answer && sources.length === 0) {
      log.info(`No KB metadata available for "${kbName}"`);
      setCachedRagContext(cacheKey, null);
      return null;
    }

    const parts: string[] = [];

    if (sources.length > 0) {
      parts.push('## Retrieved Passages');
      sources.forEach((source, i) => {
        const meta = (source.metadata ?? {}) as Record<string, unknown>;
        const page = meta.page;
        const labelBits: string[] = [];
        if (source.source) labelBits.push(String(source.source));
        if (page !== undefined && page !== null && page !== '') {
          labelBits.push(`page ${String(page)}`);
        }
        const scoreLabel =
          typeof source.score === 'number' ? ` · score ${source.score.toFixed(3)}` : '';
        const label = labelBits.length > 0 ? ` (${labelBits.join(', ')}${scoreLabel})` : scoreLabel;
        parts.push(`### Passage ${i + 1}${label}\n${source.content}`);
      });
    } else if (answer) {
      // Defensive: pre-rewrite call-sites might still produce a synthesized answer
      // without per-source rows. Treat as a single passage block.
      parts.push(`## Retrieved Passages\n${answer}`);
    }

    let result = parts.join('\n\n');
    if (result.length > MAX_RAG_CONTEXT_CHARS) {
      const original = result.length;
      result =
        result.slice(0, MAX_RAG_CONTEXT_CHARS) +
        `\n\n_[truncated: ${original - MAX_RAG_CONTEXT_CHARS} chars removed to stay within generation context budget]_`;
      log.warn(
        `RAG context for KB "${kbName}" truncated from ${original} to ${MAX_RAG_CONTEXT_CHARS} chars`,
      );
    }

    setCachedRagContext(cacheKey, result);
    return result;
  } catch (error) {
    if (error instanceof DeepTutorUnavailableError) {
      log.warn(`DeepTutor unavailable for RAG context: ${error.message}`);
      // Don't cache transient errors — let the next request retry.
      return null;
    }
    log.error(`Error fetching RAG context: ${error}`);
    return null;
  }
}

// ==================== Initialize on Import ====================

// Run a non-blocking health check on module load. Guarded to skip build-time
// (NEXT_PHASE=phase-production-build) so Next.js builds don't hang on it.
if (config.enabled && process.env.NEXT_PHASE !== 'phase-production-build') {
  checkHealth().catch(() => {});
}
