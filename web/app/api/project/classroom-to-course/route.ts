import { NextRequest, NextResponse } from 'next/server';
import { readClassroom, isValidClassroomId, type PersistedClassroomData } from '@/lib/server/classroom-storage';
import { writeCourse } from '@/lib/server/course-storage';
import { materializeAsCourse } from '@/lib/generation/projections';
import type { Stage, Scene } from '@/lib/types/stage';

export async function POST(req: NextRequest) {
  let classroomId: string;
  let inlineStage: Stage | undefined;
  let inlineScenes: Scene[] | undefined;
  try {
    const body = await req.json();
    classroomId = body?.classroomId;
    inlineStage = body?.stage;
    inlineScenes = body?.scenes;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!classroomId || typeof classroomId !== 'string') {
    return NextResponse.json({ error: 'classroomId required' }, { status: 400 });
  }
  if (!isValidClassroomId(classroomId)) {
    return NextResponse.json({ error: 'Invalid classroomId' }, { status: 400 });
  }

  let classroom = await readClassroom(classroomId);

  // Client-generated classrooms live in IndexedDB and are not on the server filesystem.
  // Accept inline stage+scenes from the request body as a fallback.
  if (!classroom && inlineStage && Array.isArray(inlineScenes)) {
    classroom = {
      id: classroomId,
      stage: inlineStage,
      scenes: inlineScenes,
      createdAt: new Date().toISOString(),
    } satisfies PersistedClassroomData;
  }

  if (!classroom) {
    return NextResponse.json({ error: 'Classroom not found' }, { status: 404 });
  }

  const course = materializeAsCourse(classroom);
  await writeCourse(course);

  return NextResponse.json({ id: course.id, url: `/course/${course.id}` });
}
