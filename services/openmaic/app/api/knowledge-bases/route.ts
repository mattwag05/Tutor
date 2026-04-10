/**
 * Knowledge Bases API
 *
 * Proxy endpoint to list available DeepTutor knowledge bases.
 * Returns an empty array if DeepTutor is unavailable (graceful degradation).
 */

import { NextResponse } from 'next/server';
import { listKnowledgeBases, isDeepTutorEnabled } from '@/lib/integrations';

export async function GET() {
  if (!isDeepTutorEnabled()) {
    return NextResponse.json({
      available: false,
      knowledgeBases: [],
      message: 'DeepTutor integration is disabled',
    });
  }

  try {
    const kbs = await listKnowledgeBases();
    return NextResponse.json({
      available: true,
      knowledgeBases: kbs,
    });
  } catch {
    return NextResponse.json({
      available: false,
      knowledgeBases: [],
      message: 'DeepTutor is currently unavailable',
    });
  }
}
