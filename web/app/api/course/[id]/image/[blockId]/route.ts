import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { courseImagePath, isValidCourseId } from '@/lib/server/course-storage';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> },
) {
  const { id, blockId } = await params;
  if (!isValidCourseId(id) || !isValidCourseId(blockId)) {
    return new NextResponse('Not found', { status: 404 });
  }
  const filePath = courseImagePath(id, blockId);
  try {
    const buf = await fs.readFile(filePath);
    return new Response(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
