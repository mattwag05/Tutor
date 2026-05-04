import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ragContextCacheKey, clearRagContextCache } from '@/lib/integrations/deeptutor-client';

describe('ragContextCacheKey', () => {
  it('produces stable keys for the same input', () => {
    const a = ragContextCacheKey('kb-1', 'Teach me linear algebra');
    const b = ragContextCacheKey('kb-1', 'Teach me linear algebra');
    expect(a).toBe(b);
  });

  it('differentiates by kbName', () => {
    const a = ragContextCacheKey('kb-1', 'topic');
    const b = ragContextCacheKey('kb-2', 'topic');
    expect(a).not.toBe(b);
  });

  it('differentiates by requirement text', () => {
    const a = ragContextCacheKey('kb-1', 'topic A');
    const b = ragContextCacheKey('kb-1', 'topic B');
    expect(a).not.toBe(b);
  });

  it('starts the key with the kbName prefix', () => {
    const key = ragContextCacheKey('my-kb', 'whatever');
    expect(key.startsWith('my-kb:')).toBe(true);
  });
});

function mockQueryResponse(
  passages: Array<{ text: string; source?: string; page?: string | null; score?: number }> = [
    { text: 'A retrieved passage.', source: '/data/test.pdf', page: '3', score: 0.91 },
  ],
) {
  return new Response(
    JSON.stringify({
      query: 'topic',
      kb_name: 'test-kb',
      provider: 'llamaindex',
      results: passages.map((p) => ({
        text: p.text,
        score: p.score ?? 0.85,
        source: p.source ?? '/data/test.pdf',
        page: p.page ?? null,
        title: null,
        chunk_id: null,
      })),
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('getRAGContextForGeneration cache', () => {
  beforeEach(() => {
    clearRagContextCache();
    vi.useRealTimers();
  });

  it('skips the network on a second call within TTL', async () => {
    const fetchSpy = vi.fn(async () => mockQueryResponse());
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    try {
      const { getRAGContextForGeneration } = await import('@/lib/integrations/deeptutor-client');
      clearRagContextCache();

      const a = await getRAGContextForGeneration('test-kb', 'topic');
      const b = await getRAGContextForGeneration('test-kb', 'topic');

      expect(a).toBe(b);
      expect(a).toBeTruthy();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // Sanity: the rendered context now reflects retrieved passages, not metadata.
      expect(a).toContain('Retrieved Passages');
      expect(a).toContain('A retrieved passage.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('expires entries after TTL elapses', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => mockQueryResponse());
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    try {
      const { getRAGContextForGeneration } = await import('@/lib/integrations/deeptutor-client');
      clearRagContextCache();

      await getRAGContextForGeneration('ttl-kb', 'topic');
      vi.advanceTimersByTime(180_000); // 3 min — past 2 min TTL
      await getRAGContextForGeneration('ttl-kb', 'topic');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    }
  });
});

describe('queryKnowledgeBase (real RAG)', () => {
  beforeEach(() => {
    clearRagContextCache();
  });

  it('hits POST /api/v1/knowledge/{kb}/query with query and top_k', async () => {
    const fetchSpy = vi.fn(async () => mockQueryResponse());
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    try {
      const { queryKnowledgeBase } = await import('@/lib/integrations/deeptutor-client');
      const { answer, sources } = await queryKnowledgeBase('abfm', 'diabetic retinopathy', {
        topK: 4,
      });

      expect(answer).toContain('A retrieved passage.');
      expect(sources).toHaveLength(1);
      expect(sources[0].content).toBe('A retrieved passage.');
      expect(sources[0].source).toBe('/data/test.pdf');

      // First call to a fresh query — fetch was used.
      expect(fetchSpy).toHaveBeenCalled();
      const firstCall = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
      const [calledUrl, calledOpts] = firstCall;
      expect(calledUrl).toContain('/api/v1/knowledge/abfm/query');
      expect(calledOpts.method).toBe('POST');
      expect(JSON.parse(calledOpts.body as string)).toEqual({
        query: 'diabetic retinopathy',
        top_k: 4,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns empty result on 409 needs_reindex', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            detail: { error_type: 'needs_reindex', message: 'reindex me', kb_name: 'abfm' },
          }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        ),
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    try {
      const { queryKnowledgeBase } = await import('@/lib/integrations/deeptutor-client');
      const result = await queryKnowledgeBase('abfm', 'q');
      expect(result).toEqual({ answer: '', sources: [] });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns empty result for empty query without hitting the network', async () => {
    const fetchSpy = vi.fn(async () => mockQueryResponse());
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    try {
      const { queryKnowledgeBase } = await import('@/lib/integrations/deeptutor-client');
      const result = await queryKnowledgeBase('abfm', '   ');
      expect(result).toEqual({ answer: '', sources: [] });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
