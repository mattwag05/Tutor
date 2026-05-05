import { NextRequest, NextResponse } from 'next/server';
import { readClassroom, isValidClassroomId } from '@/lib/server/classroom-storage';
import { writeCourse } from '@/lib/server/course-storage';
import { materializeAsCourse } from '@/lib/generation/projections';

export async function POST(req: NextRequest) {
  let classroomId: string;
  try {
    const body = await req.json();
    classroomId = body?.classroomId;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!classroomId || typeof classroomId !== 'string') {
    return NextResponse.json({ error: 'classroomId required' }, { status: 400 });
  }
  if (!isValidClassroomId(classroomId)) {
    return NextResponse.json({ error: 'Invalid classroomId' }, { status: 400 });
  }

  const classroom = await readClassroom(classroomId);
  if (!classroom) {
    return NextResponse.json({ error: 'Classroom not found' }, { status: 404 });
  }

  const course = materializeAsCourse(classroom);
  await writeCourse(course);

  return NextResponse.json({ id: course.id, url: `/course/${course.id}` });
}
