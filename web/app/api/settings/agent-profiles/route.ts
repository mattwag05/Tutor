/**
 * Proxy to Python backend `GET/PUT /api/v1/settings/agents`.
 * Keeps all settings calls on the same Next.js origin from the client.
 */
import { NextResponse } from 'next/server';

const BACKEND = process.env.DEEPTUTOR_API_URL || 'http://127.0.0.1:8001';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/v1/settings/agents`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'backend unreachable';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(`${BACKEND}/api/v1/settings/agents`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'backend unreachable';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
