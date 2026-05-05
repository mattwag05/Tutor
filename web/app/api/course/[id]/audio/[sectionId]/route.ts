import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import {
  COURSES_DIR,
  courseAudioPath,
  isValidCourseId,
  isValidSectionId,
} from '@/lib/server/course-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('CourseAudioServe');

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  const { id, sectionId } = await params;

  if (!isValidCourseId(id) || !isValidSectionId(sectionId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const filePath = courseAudioPath(id, sectionId);
  const resolvedBase = path.resolve(COURSES_DIR, id);

  try {
    const realPath = await fs.realpath(filePath);
    if (!realPath.startsWith(resolvedBase + path.sep) && realPath !== resolvedBase) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const stat = await fs.stat(realPath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const stream = createReadStream(realPath);
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer | string) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    log.error(`Course audio serve failed [courseId=${id} sectionId=${sectionId}]:`, error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
