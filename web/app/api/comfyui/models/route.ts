/**
 * ComfyUI Refresh-models endpoint.
 *
 * Proxies the configured ComfyUI server's /object_info to surface available
 * checkpoints in the Settings image picker. Triggered by a manual "Refresh"
 * button — we don't auto-probe because it adds latency to Settings open and
 * ComfyUI may be on a sleeping host (M5 + Amphetamine).
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchComfyUIModels } from '@/lib/media/adapters/comfyui-adapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { baseUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const baseUrl = body.baseUrl?.trim();
  if (!baseUrl) {
    return NextResponse.json({ error: 'baseUrl is required' }, { status: 400 });
  }
  try {
    const models = await fetchComfyUIModels(baseUrl);
    return NextResponse.json({ models });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
