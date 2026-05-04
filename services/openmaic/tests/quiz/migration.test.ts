import { describe, it, expect, beforeEach, vi } from 'vitest';

const store: Record<string, string> = {};
const localStorageStub = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => {
    store[k] = String(v);
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    for (const k of Object.keys(store)) delete store[k];
  },
  key: (i: number) => Object.keys(store)[i] ?? null,
  get length() {
    return Object.keys(store).length;
  },
};

vi.stubGlobal('localStorage', localStorageStub);
vi.stubGlobal('window', { localStorage: localStorageStub });

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { RESULTS_KEY_PREFIX, enumerateResultsKeys } from '@/lib/quiz/persistence';
import {
  MIGRATION_SENTINEL_KEY,
  migrateLocalStorageQuizAttempts,
} from '@/lib/quiz/migration';

function seedScene(sceneId: string, results: Array<Record<string, unknown>>) {
  localStorageStub.setItem(RESULTS_KEY_PREFIX + sceneId, JSON.stringify(results));
}

function okResponse(body: unknown = { id: 'abc' }) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } as Response;
}

function failResponse(status = 503) {
  return {
    ok: false,
    status,
    statusText: 'Service Unavailable',
    json: async () => ({}),
  } as Response;
}

describe('quiz migration', () => {
  beforeEach(() => {
    localStorageStub.clear();
    fetchMock.mockReset();
  });

  it('enumerateResultsKeys skips empty arrays and malformed entries', () => {
    seedScene('s1', [{ questionId: 'q1', correct: true, status: 'correct', earned: 1 }]);
    seedScene('s2', []);
    localStorageStub.setItem(RESULTS_KEY_PREFIX + 's3', '{not json');

    const found = enumerateResultsKeys();
    expect(found.map((s) => s.sceneId)).toEqual(['s1']);
  });

  it('short-circuits when sentinel is set', async () => {
    localStorageStub.setItem(MIGRATION_SENTINEL_KEY, 'true');
    seedScene('s1', [{ questionId: 'q1', correct: true, status: 'correct', earned: 1 }]);

    const result = await migrateLocalStorageQuizAttempts();
    expect(result).toEqual({ ran: false, scenes: 0, attemptsRecorded: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sets sentinel and POSTs every result on first run', async () => {
    seedScene('s1', [
      { questionId: 'q1', correct: true, status: 'correct', earned: 1 },
      { questionId: 'q2', correct: false, status: 'incorrect', earned: 0 },
    ]);
    seedScene('s2', [{ questionId: 'q3', correct: true, status: 'correct', earned: 1 }]);
    fetchMock.mockResolvedValue(okResponse());

    const result = await migrateLocalStorageQuizAttempts();

    expect(result.ran).toBe(true);
    expect(result.scenes).toBe(2);
    expect(result.attemptsRecorded).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(localStorageStub.getItem(MIGRATION_SENTINEL_KEY)).toBe('true');

    const calls = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse((init as RequestInit).body as string),
    );
    expect(calls.every((c) => c.source === 'classroom')).toBe(true);
    expect(new Set(calls.map((c) => c.source_id))).toEqual(new Set(['s1', 's2']));
  });

  it('does NOT set sentinel when DeepTutor is unreachable', async () => {
    seedScene('s1', [{ questionId: 'q1', correct: true, status: 'correct', earned: 1 }]);
    fetchMock.mockResolvedValue(failResponse(503));

    const result = await migrateLocalStorageQuizAttempts();
    expect(result.ran).toBe(true);
    expect(result.attemptsRecorded).toBe(0);
    expect(localStorageStub.getItem(MIGRATION_SENTINEL_KEY)).toBeNull();
  });

  it('sets sentinel and short-circuits when no results exist', async () => {
    const result = await migrateLocalStorageQuizAttempts();
    expect(result).toEqual({ ran: true, scenes: 0, attemptsRecorded: 0 });
    expect(localStorageStub.getItem(MIGRATION_SENTINEL_KEY)).toBe('true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not delete the localStorage entries it migrates', async () => {
    seedScene('s1', [{ questionId: 'q1', correct: true, status: 'correct', earned: 1 }]);
    fetchMock.mockResolvedValue(okResponse());

    await migrateLocalStorageQuizAttempts();

    expect(localStorageStub.getItem(RESULTS_KEY_PREFIX + 's1')).not.toBeNull();
  });
});
