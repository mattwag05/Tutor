/**
 * Client-side helper for posting quiz attempts to the local Next.js
 * proxy at /api/quiz/attempts (which forwards to Tutor's unified
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

export interface CourseAttemptPayload {
  courseId: string;
  sectionId: string;
  blockId: string;
  isCorrect: boolean;
  userAnswer?: string;
  /** Override timestamp; defaults to Date.now(). */
  tsMs?: number;
}

/** Record a single course quiz block attempt. */
export async function recordCourseAttempt(
  payload: CourseAttemptPayload,
): Promise<QuizAttemptRecord | null> {
  return recordAttempt({
    source: 'course',
    source_id: `${payload.courseId}::${payload.sectionId}::${payload.blockId}`,
    question_id: payload.blockId,
    user_answer: payload.userAnswer ?? '',
    is_correct: payload.isCorrect,
    earned: payload.isCorrect ? 1 : 0,
    ts_ms: payload.tsMs ?? Date.now(),
  });
}
