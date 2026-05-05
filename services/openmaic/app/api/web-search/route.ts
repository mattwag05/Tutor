/**
 * Stub — web-search route moved to web/app/api/web-search/route.ts (Phase B.1).
 * This stub keeps OpenMAIC tests compiling until they move to web/ in DeepTutor-ise.
 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json({ error: 'moved to web/' }, { status: 501 });
}
