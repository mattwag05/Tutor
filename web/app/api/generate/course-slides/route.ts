import { NextRequest } from 'next/server';
import { readCourse, isValidCourseId } from '@/lib/server/course-storage';
import { courseToSlides } from '@/lib/course/slides-adapter';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
// pptxgenjs vendored at web/packages/pptxgenjs — works in Node.js via outputType:'nodebuffer'
import pptxgen from 'pptxgenjs';

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

  const slides = courseToSlides(course);
  const pptx = new pptxgen();

  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = course.title;

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.addText(course.title, {
    x: 0.5,
    y: 1.5,
    w: '90%',
    h: 2,
    fontSize: 36,
    bold: true,
    color: '111827',
    align: 'center',
    wrap: true,
  });
  titleSlide.addText(`${course.sections.length} sections`, {
    x: 0.5,
    y: 3.8,
    w: '90%',
    h: 0.5,
    fontSize: 14,
    color: '6b7280',
    align: 'center',
  });

  for (const spec of slides) {
    const slide = pptx.addSlide();

    slide.addText(spec.title, {
      x: 0.5,
      y: 0.4,
      w: '90%',
      h: 0.8,
      fontSize: 24,
      bold: true,
      color: '111827',
      wrap: true,
    });

    if (spec.bullets.length > 0) {
      const bulletItems = spec.bullets.map((b) => ({ text: b, options: { bullet: true } }));
      slide.addText(bulletItems, {
        x: 0.5,
        y: 1.4,
        w: spec.pullQuote ? '55%' : '90%',
        h: 3.5,
        fontSize: 13,
        color: '374151',
        valign: 'top',
        wrap: true,
      });
    }

    if (spec.pullQuote) {
      const quoteLines: { text: string; options: object }[] = [
        { text: `"${spec.pullQuote.text}"`, options: { italic: true, color: '374151' } },
      ];
      if (spec.pullQuote.attribution) {
        quoteLines.push({
          text: `\n— ${spec.pullQuote.attribution}`,
          options: { fontSize: 11, color: '6b7280' },
        });
      }
      slide.addText(quoteLines, {
        x: '60%',
        y: 1.4,
        w: '38%',
        h: 3,
        fontSize: 13,
        valign: 'top',
        wrap: true,
        line: { color: '6b7280', width: 2, dashType: 'solid' },
      });
    }
  }

  const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  const filename = course.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60);

  // buf may be a view into a larger Node.js pool slab; slice to exact bounds.
  return new Response(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${filename}.pptx"`,
      'Content-Length': String(buf.byteLength),
    },
  });
}
