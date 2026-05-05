/**
 * Client-side helper for posting quiz attempts to the local Next.js
 * proxy at /api/quiz/attempts (which forwards to DeepTutor's unified
 * store). Browser code can't reach DEEPTUTOR_API_URL directly because
 * that's a server-side env var pointing at the internal port.
 *
 * All calls are fire-and-forget from the UI's perspective: failures log
 * and return `null` rather than blocking the localStorage write that
 * already happened.
 */

import { createLogger } from '@/lib/logger';
import type { QuizAttemptPayload, QuizAttemptRecord } from '@/lib/integrations';

const log = createLogger('QuizAPI');

const POST_TIMEOUT_MS = 10_000;

export async function recordAttempt(
  payload: QuizAttemptPayload,
): Promise<QuizAttemptRecord | null> {
  try {
    const response = await fetch('/api/quiz/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.warn(`Quiz attempt POST failed: ${response.status} ${response.statusText}`);
      return null;
    }
    return (await response.json()) as QuizAttemptRecord;
  } catch (error) {
    log.warn(`Quiz attempt POST error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export interface SceneResult {
  questionId: string;
  correct: boolean | null;
  earned: number;
  aiComment?: string;
  userAnswer?: string | string[];
}

export interface SceneResultsPayload {
  sceneId: string;
  results: SceneResult[];
  /** Override timestamp; defaults to Date.now(). Used by migration to preserve historical order. */
  tsMs?: number;
}

/**
 * QuizView (the only caller today) is mounted from classroom scenes —
 * `source: 'classroom'` is the right tag. If course pages ever render
 * QuizView, this needs a `source` parameter.
 *
 * Returns the count of successfully recorded attempts. Issues all POSTs
 * concurrently with `Promise.allSettled` so a 20-question quiz doesn't
 * stack up 20 sequential round-trips.
 */
export async function recordSceneResults(payload: SceneResultsPayload): Promise<number> {
  const ts = payload.tsMs ?? Date.now();
  const settled = await Promise.allSettled(
    payload.results.map((r) => {
      const userAnswer =
        r.userAnswer === undefined
          ? ''
          : Array.isArray(r.userAnswer)
            ? JSON.stringify(r.userAnswer)
            : String(r.userAnswer);
      return recordAttempt({
        source: 'classroom',
        source_id: payload.sceneId,
        question_id: r.questionId,
        user_answer: userAnswer,
        is_correct: r.correct,
        earned: r.earned,
        ai_comment: r.aiComment ?? '',
        ts_ms: ts,
      });
    }),
  );
  return settled.filter((s) => s.status === 'fulfilled' && s.value !== null).length;
}
