import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

/**
 * Serves a local mp3 file as a streaming NextResponse.
 * Validates the resolved path stays within resolvedBase (path-traversal guard).
 * Returns a 404/500 NextResponse on failure; callers may inspect `.status`.
 */
export async function streamAudioFile(
  filePath: string,
  resolvedBase: string,
  logTag: string,
): Promise<NextResponse> {
  try {
    const realPath = await fs.realpath(filePath);
    if (!realPath.startsWith(resolvedBase + path.sep) && realPath !== resolvedBase) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const stat = await fs.stat(realPath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const nodeStream = createReadStream(realPath);
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk: Buffer | string) => controller.enqueue(chunk));
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
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
    console.error(`[${logTag}] stream failed:`, error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
