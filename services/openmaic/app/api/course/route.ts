/**
 * Course collection API.
 *
 *   GET  /api/course         → list course summaries (id, title, createdAt)
 *   POST /api/course         → create a new empty course document, returns id
 *
 * The reader UI calls POST after receiving a successful outline stream,
 * seeding storage with { id, title, topic, language, sections } and empty
 * section bodies. Subsequent section generation updates the document via
 * PUT /api/course/[id].
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError } from '@/lib/server/api-response';
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
    return apiError('INVALID_INPUT', 400, 'Request body must be JSON');
  }

  if (!body.topic || !body.title) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'topic and title are required');
  }

  const id = body.id || nanoid();

  // Reject collisions — caller should re-try with a fresh id
  const existing = await readCourse(id);
  if (existing) {
    return apiError('INVALID_INPUT', 409, `Course ${id} already exists`);
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
