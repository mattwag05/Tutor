/**
 * Quiz attempt proxy.
 *
 * POST forwards a single attempt to Tutor's unified store; GET passes
 * filters through unchanged. Both degrade gracefully when Tutor is
 * unavailable so the quiz UX never blocks on it.
 */

import { NextResponse, type NextRequest } from 'next/server';

import {
  isDeepTutorEnabled,
  listQuizAttempts,
  recordQuizAttempt,
  type QuizAttemptPayload,
  type QuizAttemptFilter,
  type QuizSource,
} from '@/lib/integrations';
import { DeepTutorUnavailableError } from '@/lib/integrations';

const VALID_SOURCES: ReadonlySet<QuizSource> = new Set(['book', 'classroom', 'course']);

export async function POST(request: NextRequest) {
  if (!isDeepTutorEnabled()) {
    return NextResponse.json(
      { available: false, message: 'Tutor integration is disabled' },
      { status: 503 },
    );
  }

  let payload: QuizAttemptPayload;
  try {
    payload = (await request.json()) as QuizAttemptPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || !VALID_SOURCES.has(payload.source as QuizSource)) {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
  }
  if (!payload.source_id || !payload.question_id) {
    return NextResponse.json({ error: 'Missing source_id or question_id' }, { status: 400 });
  }
  if (typeof payload.ts_ms !== 'number' || payload.ts_ms < 0) {
    return NextResponse.json({ error: 'Invalid ts_ms' }, { status: 400 });
  }

  try {
    const record = await recordQuizAttempt(payload);
    if (record === null) {
      return NextResponse.json(
        { available: false, message: 'Tutor unavailable' },
        { status: 503 },
      );
    }
    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof DeepTutorUnavailableError) {
      return NextResponse.json(
        { available: false, message: error.message },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest) {
  if (!isDeepTutorEnabled()) {
    return NextResponse.json([]);
  }
  const sp = request.nextUrl.searchParams;
  const filter: QuizAttemptFilter = {};
  const source = sp.get('source');
  if (source && VALID_SOURCES.has(source as QuizSource)) {
    filter.source = source as QuizSource;
  }
  const sourceId = sp.get('source_id');
  if (sourceId) filter.source_id = sourceId;
  const isCorrect = sp.get('is_correct');
  if (isCorrect === 'true') filter.is_correct = true;
  if (isCorrect === 'false') filter.is_correct = false;
  const olderThan = sp.get('older_than_ms');
  if (olderThan && /^\d+$/.test(olderThan)) filter.older_than_ms = Number(olderThan);
  const newerThan = sp.get('newer_than_ms');
  if (newerThan && /^\d+$/.test(newerThan)) filter.newer_than_ms = Number(newerThan);
  const limit = sp.get('limit');
  if (limit && /^\d+$/.test(limit)) filter.limit = Math.min(Number(limit), 1000);

  try {
    return NextResponse.json(await listQuizAttempts(filter));
  } catch (error) {
    if (error instanceof DeepTutorUnavailableError) {
      return NextResponse.json([]);
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 502 },
    );
  }
}
