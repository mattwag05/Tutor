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
  type ChatRAGResponse,
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

  try {
    return await apiGet<KnowledgeBaseInfo[]>('/api/v1/knowledge/list');
  } catch (error) {
    if (error instanceof DeepTutorUnavailableError) {
      log.warn('DeepTutor unavailable for KB listing, returning empty list');
      return [];
    }
    throw error;
  }
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

// ==================== RAG Query via Chat WebSocket ====================

/**
 * Query a knowledge base for relevant context using DeepTutor's chat endpoint.
 * Sends a single-turn RAG-enabled chat message and collects the response.
 * Returns the RAG source passages and the synthesized answer.
 */
export async function queryKnowledgeBase(
  kbName: string,
  query: string,
  options?: { timeout?: number },
): Promise<{ answer: string; sources: RAGQueryResult[] }> {
  if (!config.enabled) {
    throw new DeepTutorUnavailableError('DeepTutor integration is disabled');
  }

  const timeout = options?.timeout ?? config.queryTimeout;
  const wsUrl = config.baseUrl.replace(/^http/, 'ws') + '/api/v1/chat';

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ws: any;

    const timer = setTimeout(() => {
      try {
        ws?.close();
      } catch {}
      reject(new DeepTutorUnavailableError(`RAG query timed out after ${timeout}ms`));
    }, timeout);

    try {
      // Dynamic require to avoid bundling issues
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const WebSocket = require('ws');
      ws = new WebSocket(wsUrl);
    } catch {
      clearTimeout(timer);
      reject(new DeepTutorUnavailableError('WebSocket not available'));
      return;
    }

    let answer = '';
    let sources: RAGQueryResult[] = [];

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          message: query,
          session_id: null,
          kb_name: kbName,
          enable_rag: true,
          enable_web_search: false,
        }),
      );
    });

    ws.on('message', (data: Buffer | string) => {
      try {
        const parsed: ChatRAGResponse = JSON.parse(
          typeof data === 'string' ? data : data.toString(),
        );

        switch (parsed.type) {
          case 'stream':
            answer += parsed.content || '';
            break;
          case 'sources':
            sources = (parsed.rag || []).map((s) => ({
              content: s.content || '',
              score: s.score,
              source: s.source,
              metadata: s.metadata,
            }));
            break;
          case 'result':
            answer = parsed.content || answer;
            break;
          case 'error':
            clearTimeout(timer);
            ws.close();
            reject(new DeepTutorAPIError(parsed.message || 'Unknown error', 500));
            return;
        }
      } catch {
        // Ignore parse errors for non-JSON messages
      }
    });

    ws.on('close', () => {
      clearTimeout(timer);
      resolve({ answer, sources });
    });

    ws.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(new DeepTutorUnavailableError(`WebSocket error: ${err.message}`));
    });
  });
}

// ==================== Convenience: Get RAG Context for Generation ====================

/**
 * Fetch RAG context from DeepTutor and format it for injection into
 * OpenMAIC's outline generation pipeline.
 *
 * Returns formatted string suitable for the `researchContext` parameter,
 * or null if DeepTutor is unavailable or returns no results.
 */
export async function getRAGContextForGeneration(
  kbName: string,
  topic: string,
): Promise<string | null> {
  try {
    const { answer, sources } = await queryKnowledgeBase(kbName, topic);

    if (!answer && sources.length === 0) {
      log.info(`No RAG results for topic "${topic}" in KB "${kbName}"`);
      return null;
    }

    const parts: string[] = [];

    if (answer) {
      parts.push(`## Research Summary\n${answer}`);
    }

    if (sources.length > 0) {
      parts.push('## Source Passages');
      sources.forEach((source, i) => {
        const sourceLabel = source.source ? ` (from: ${source.source})` : '';
        parts.push(`### Passage ${i + 1}${sourceLabel}\n${source.content}`);
      });
    }

    return parts.join('\n\n');
  } catch (error) {
    if (error instanceof DeepTutorUnavailableError) {
      log.warn(`DeepTutor unavailable for RAG context: ${error.message}`);
      return null;
    }
    log.error(`Error fetching RAG context: ${error}`);
    return null;
  }
}

// ==================== Initialize on Import ====================

// Run health check on module load (non-blocking)
if (config.enabled) {
  checkHealth().catch(() => {});
}
