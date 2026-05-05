import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import {
  COURSES_DIR,
  coursePodcastPath,
  isValidCourseId,
  isValidPodcastMode,
} from '@/lib/server/course-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('CoursePodcastServe');

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; mode: string }> },
) {
  const { id, mode } = await params;

  if (!isValidCourseId(id) || !isValidPodcastMode(mode)) {
    return NextResponse.json({ error: 'Invalid id or mode' }, { status: 400 });
  }

  const filePath = coursePodcastPath(id, mode);
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
    log.error(`Course podcast serve failed [courseId=${id} mode=${mode}]:`, error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
