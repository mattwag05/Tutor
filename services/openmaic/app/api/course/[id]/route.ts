import { NextRequest, NextResponse } from 'next/server';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
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
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid course id');
  }
  const course = await readCourse(id);
  if (!course) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, `Course ${id} not found`);
  }
  return NextResponse.json(course);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isValidCourseId(id)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid course id');
  }
  let course: Course;
  try {
    course = (await req.json()) as Course;
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Request body must be JSON');
  }
  if (!course || course.id !== id) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Course payload id must match URL id');
  }
  await writeCourse(course);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isValidCourseId(id)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid course id');
  }
  const removed = await deleteCourse(id);
  return NextResponse.json({ ok: true, removed });
}
