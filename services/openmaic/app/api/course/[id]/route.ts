/**
 * Course CRUD API.
 *
 *   GET    /api/course/[id]  → returns stored course JSON
 *   PUT    /api/course/[id]  → replaces stored course JSON
 *   DELETE /api/course/[id]  → removes stored course
 *
 * Mirrors the classroom CRUD pattern. The reader UI reads on mount and
 * persists on meaningful state changes (section generated, progress, etc).
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/server/api-response';
import {
  isValidCourseId,
  readCourse,
  writeCourse,
  deleteCourse,
} from '@/lib/server/course-storage';
import type { Course } from '@/lib/types/course';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isValidCourseId(id)) {
    return apiError('INVALID_INPUT', 400, 'Invalid course id');
  }
  const course = await readCourse(id);
  if (!course) {
    return apiError('NOT_FOUND', 404, `Course ${id} not found`);
  }
  return NextResponse.json(course);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isValidCourseId(id)) {
    return apiError('INVALID_INPUT', 400, 'Invalid course id');
  }
  let course: Course;
  try {
    course = (await req.json()) as Course;
  } catch {
    return apiError('INVALID_INPUT', 400, 'Request body must be JSON');
  }
  if (!course || course.id !== id) {
    return apiError('INVALID_INPUT', 400, 'Course payload id must match URL id');
  }
  await writeCourse(course);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isValidCourseId(id)) {
    return apiError('INVALID_INPUT', 400, 'Invalid course id');
  }
  const removed = await deleteCourse(id);
  return NextResponse.json({ ok: true, removed });
}
