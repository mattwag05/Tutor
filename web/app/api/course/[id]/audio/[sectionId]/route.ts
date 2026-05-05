import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import {
  COURSES_DIR,
  courseAudioPath,
  isValidCourseId,
  isValidSectionId,
} from '@/lib/server/course-storage';
import { streamAudioFile } from '@/lib/server/stream-audio-file';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  const { id, sectionId } = await params;

  if (!isValidCourseId(id) || !isValidSectionId(sectionId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  return streamAudioFile(
    courseAudioPath(id, sectionId),
    path.resolve(COURSES_DIR, id),
    `CourseAudioServe courseId=${id} sectionId=${sectionId}`,
  );
}
