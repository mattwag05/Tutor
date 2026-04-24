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

describe('getRAGContextForGeneration cache', () => {
  beforeEach(() => {
    clearRagContextCache();
    vi.useRealTimers();
  });

  it('skips the network on a second call within TTL', async () => {
    // We mock fetch by replacing globalThis.fetch. The first call should hit
    // the network; the second call to the same key should not.
    const fetchSpy = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          metadata: { description: 'A test KB' },
          statistics: { raw_documents: 3 },
          status: 'ready',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
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
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('expires entries after TTL elapses', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          metadata: { description: 'A test KB' },
          statistics: { raw_documents: 3 },
          status: 'ready',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
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
