import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import {
  COURSES_DIR,
  coursePodcastPath,
  isValidCourseId,
  isValidPodcastMode,
} from '@/lib/server/course-storage';
import { streamAudioFile } from '@/lib/server/stream-audio-file';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; mode: string }> },
) {
  const { id, mode } = await params;

  if (!isValidCourseId(id) || !isValidPodcastMode(mode)) {
    return NextResponse.json({ error: 'Invalid id or mode' }, { status: 400 });
  }

  return streamAudioFile(
    coursePodcastPath(id, mode),
    path.resolve(COURSES_DIR, id),
    `CoursePodcastServe courseId=${id} mode=${mode}`,
  );
}
