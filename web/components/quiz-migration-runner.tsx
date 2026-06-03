'use client';

import { useEffect } from 'react';

import { migrateLocalStorageQuizAttempts } from '@/lib/quiz/migration';
import { createLogger } from '@/lib/logger';

const log = createLogger('QuizMigrationRunner');

/**
 * One-shot migration runner mounted from the root layout. Walks any
 * pre-existing localStorage quiz results into Tutor's unified store
 * on first load (sentinel-guarded so subsequent loads no-op). Renders
 * nothing — purely a side-effect component.
 */
export function QuizMigrationRunner() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await migrateLocalStorageQuizAttempts();
        if (cancelled) return;
        if (result.ran && result.attemptsRecorded > 0) {
          log.info(
            `Migrated ${result.attemptsRecorded} quiz attempt(s) across ${result.scenes} scene(s)`,
          );
        }
      } catch (error) {
        log.warn(`Quiz migration failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
