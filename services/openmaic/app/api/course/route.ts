import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { listCourses, writeCourse, readCourse } from '@/lib/server/course-storage';
import type { Course, CourseSection, Language } from '@/lib/types/course';

export async function GET() {
  const summaries = await listCourses();
  // Newest first
  summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json(summaries);
}

export async function POST(req: NextRequest) {
  let body: {
    id?: string;
    title?: string;
    topic?: string;
    language?: Language;
    knowledgeBase?: string;
    sections?: CourseSection[];
  };
  try {
    body = await req.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Request body must be JSON');
  }

  if (!body.topic || !body.title) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'topic and title are required');
  }

  const id = body.id || nanoid();

  // Reject collisions — caller should re-try with a fresh id
  const existing = await readCourse(id);
  if (existing) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, `Course ${id} already exists`);
  }

  const course: Course = {
    id,
    title: body.title,
    topic: body.topic,
    language: body.language || 'en-US',
    createdAt: new Date().toISOString(),
    knowledgeBase: body.knowledgeBase,
    sections: body.sections || [],
    citations: {},
    progress: { sections: {} },
  };

  await writeCourse(course);
  return NextResponse.json({ id, ok: true });
}
