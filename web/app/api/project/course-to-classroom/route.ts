import { NextResponse } from 'next/server';

// Classroom migration (DeepTutor-99w) is in progress.
// This stub prevents a 404 at the call site; the full implementation lands in Phase 3.
export async function POST() {
  return NextResponse.json({ error: 'Classroom not yet available' }, { status: 501 });
}
