import { NextRequest } from 'next/server';
import { readCourse, isValidCourseId } from '@/lib/server/course-storage';
import { generateCoursePdf } from '@/lib/server/course-pdf';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { courseId?: string };
  try {
    body = (await req.json()) as { courseId?: string };
  } catch {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Invalid JSON body');
  }

  const { courseId } = body;
  if (!courseId || !isValidCourseId(courseId)) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'courseId is required');
  }

  const course = await readCourse(courseId);
  if (!course) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, `Course ${courseId} not found`);
  }

  const pdf = generateCoursePdf(course);
  const filename = course.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60);

  return new Response(pdf.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      'Content-Length': String(pdf.byteLength),
    },
  });
}
