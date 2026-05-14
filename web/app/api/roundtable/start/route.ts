import { NextRequest, NextResponse } from 'next/server';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { createRoundtableSession } from '@/lib/server/roundtable-storage';
import { getRAGContextForGeneration } from '@/lib/integrations/deeptutor-client';

interface StartRequest {
  topic: string;
  prompt?: string;
  sourceType: 'course' | 'kb' | 'classroom';
  sourceId: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: StartRequest = await req.json();
    if (!body.topic || !body.sourceType || !body.sourceId) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'topic, sourceType, and sourceId are required');
    }
    if (!['course', 'kb', 'classroom'].includes(body.sourceType)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'sourceType must be course, kb, or classroom');
    }
    const id = `rt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let ragContext: string | null = null;
    if (body.sourceType === 'kb') {
      try {
        ragContext = await getRAGContextForGeneration(body.sourceId, body.topic);
      } catch {
        // RAG failure is non-fatal — discussion proceeds without KB context
      }
    }

    await createRoundtableSession({
      id,
      topic: body.topic,
      prompt: body.prompt,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      createdAt: new Date().toISOString(),
      agentIds: [],
      ragContext: ragContext ?? undefined,
    });
    return NextResponse.json({ id, url: `/roundtable/${id}` });
  } catch {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to create roundtable session');
  }
}
