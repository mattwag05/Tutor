/**
 * One-shot localStorage → unified-store migration.
 *
 * Walks every `quizResults:<sceneId>` key in localStorage, posts each
 * result to /api/quiz/attempts as `source=classroom`, and writes a
 * sentinel so subsequent app loads no-op. localStorage entries are NOT
 * deleted — they continue to act as the offline cache for quiz-view's
 * rehydrate path (PRD §9 Phase B.6: "IndexedDB read-only after
 * migration"). The sentinel is the source of truth for "already
 * migrated".
 *
 * Today only classroom writes `quizResults:*`; migration tags every row
 * `source=classroom`. If course quizzes ever start using these keys,
 * extend persistence.ts to namespace by source.
 */

import { createLogger } from '@/lib/logger';
import { enumerateResultsKeys, safeGet, safeSet } from '@/lib/quiz/persistence';
import { recordSceneResults } from '@/lib/quiz/api-client';

const log = createLogger('QuizMigration');

export const MIGRATION_SENTINEL_KEY = 'quizMigrationV1Done';

export interface MigrationResult {
  /** Whether the migration ran or short-circuited. */
  ran: boolean;
  /** Total scenes considered. */
  scenes: number;
  /** Sum of attempt rows written across all scenes. */
  attemptsRecorded: number;
}

export async function migrateLocalStorageQuizAttempts(): Promise<MigrationResult> {
  if (typeof window === 'undefined') {
    return { ran: false, scenes: 0, attemptsRecorded: 0 };
  }
  if (safeGet(MIGRATION_SENTINEL_KEY) === 'true') {
    return { ran: false, scenes: 0, attemptsRecorded: 0 };
  }

  const scenes = enumerateResultsKeys();
  if (scenes.length === 0) {
    safeSet(MIGRATION_SENTINEL_KEY, 'true');
    return { ran: true, scenes: 0, attemptsRecorded: 0 };
  }

  let totalRecorded = 0;
  for (const { sceneId, results } of scenes) {
    const recorded = await recordSceneResults({
      sceneId,
      results: results.map((r) => ({
        questionId: r.questionId,
        correct: r.correct,
        earned: r.earned,
        aiComment: r.aiComment,
      })),
    });
    totalRecorded += recorded;
  }

  // Skip the sentinel when every POST returned null (Tutor unreachable)
  // so the next session retries; otherwise mark migration done.
  if (totalRecorded > 0) {
    safeSet(MIGRATION_SENTINEL_KEY, 'true');
  } else {
    log.warn(
      `Migration found ${scenes.length} scene(s) but recorded 0 attempts — Tutor likely unavailable. Will retry on next load.`,
    );
  }

  return { ran: true, scenes: scenes.length, attemptsRecorded: totalRecorded };
}
