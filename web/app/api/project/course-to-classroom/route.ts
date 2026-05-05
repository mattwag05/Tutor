import { NextRequest, NextResponse } from 'next/server';
import { readCourse } from '@/lib/server/course-storage';
import {
  persistClassroom,
  buildRequestOrigin,
} from '@/lib/server/classroom-storage';
import { materializeAsClassroom } from '@/lib/generation/projections';

export async function POST(req: NextRequest) {
  let courseId: string;
  try {
    const body = await req.json();
    courseId = body?.courseId;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!courseId || typeof courseId !== 'string') {
    return NextResponse.json({ error: 'courseId required' }, { status: 400 });
  }

  const course = await readCourse(courseId);
  if (!course) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }

  const classroomData = materializeAsClassroom(course);
  const baseUrl = buildRequestOrigin(req);
  const saved = await persistClassroom(classroomData, baseUrl);

  return NextResponse.json({ id: saved.id, url: saved.url });
}
