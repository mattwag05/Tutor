/**
 * Knowledge Bases API
 *
 * Proxy endpoint to list available Tutor knowledge bases.
 * Returns an empty array if Tutor is unavailable (graceful degradation).
 */

import { NextResponse } from 'next/server';
import { listKnowledgeBases, isDeepTutorEnabled } from '@/lib/integrations';

export async function GET() {
  if (!isDeepTutorEnabled()) {
    return NextResponse.json({
      available: false,
      knowledgeBases: [],
      message: 'Tutor integration is disabled',
    });
  }

  try {
    const kbs = await listKnowledgeBases();
    // Normalize to the shape the generation toolbar expects
    // ({ name, documentCount, isDefault }). DeepTutor's native statistics
    // field uses `raw_documents` for the file count; fall back to
    // `total_documents` if a future version starts emitting that.
    const knowledgeBases = kbs.map((kb) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stats = (kb as any).statistics ?? {};
      const documentCount =
        typeof stats.raw_documents === 'number'
          ? stats.raw_documents
          : typeof stats.total_documents === 'number'
            ? stats.total_documents
            : 0;
      return {
        name: kb.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        isDefault: Boolean((kb as any).is_default),
        documentCount,
      };
    });
    return NextResponse.json({
      available: true,
      knowledgeBases,
    });
  } catch {
    return NextResponse.json({
      available: false,
      knowledgeBases: [],
      message: 'Tutor is currently unavailable',
    });
  }
}
