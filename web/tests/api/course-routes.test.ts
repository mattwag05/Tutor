import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Course } from '@/lib/types/course';

const mockListCourses = vi.fn();
const mockReadCourse = vi.fn();
const mockWriteCourse = vi.fn();
const mockDeleteCourse = vi.fn();

vi.mock('@/lib/server/course-storage', () => ({
  isValidCourseId: (id: string) => /^[a-zA-Z0-9_-]+$/.test(id),
  listCourses: (...args: unknown[]) => mockListCourses(...args),
  readCourse: (...args: unknown[]) => mockReadCourse(...args),
  writeCourse: (...args: unknown[]) => mockWriteCourse(...args),
  deleteCourse: (...args: unknown[]) => mockDeleteCourse(...args),
}));

const courseRoute = await import('@/app/api/course/route');
const courseIdRoute = await import('@/app/api/course/[id]/route');

function jsonRequest(path: string, body: unknown, method = 'POST'): NextRequest {
  return new NextRequest(`http://localhost:3782${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function rawRequest(path: string, body: string, method = 'POST'): NextRequest {
  return new NextRequest(`http://localhost:3782${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function fixtureCourse(): Course {
  return {
    id: 'course_1',
    title: 'Decision Making',
    topic: 'decision making',
    language: 'en-US',
    createdAt: '2026-06-03T00:00:00.000Z',
    generationPreferences: {
      focus: 'reviewing',
      length: 'long',
      complexity: 'advanced',
      initialFormat: 'diagram',
      selectedFormats: ['lesson', 'diagram'],
    },
    sections: [
      {
        id: 'sec_1',
        order: 1,
        title: 'Tradeoffs',
        blocks: [{ id: 'blk_1', type: 'prose', markdown: 'Tradeoffs matter.' }],
        goDeeperPrompts: ['Show examples'],
        status: 'ready',
      },
    ],
    citations: {
      src_1: {
        id: 'src_1',
        text: 'Bounded rationality evidence',
        source: 'Research note',
        url: 'https://example.com/source',
      },
    },
    progress: { sections: { sec_1: 'completed' } },
  };
}

beforeEach(() => {
  mockListCourses.mockReset();
  mockReadCourse.mockReset();
  mockWriteCourse.mockReset();
  mockDeleteCourse.mockReset();
});

describe('POST /api/course', () => {
  it('preserves course preferences, sections, citations, and progress', async () => {
    mockReadCourse.mockResolvedValue(null);
    const course = fixtureCourse();

    const res = await courseRoute.POST(jsonRequest('/api/course', course));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: 'course_1', ok: true });

    expect(mockWriteCourse).toHaveBeenCalledTimes(1);
    const written = mockWriteCourse.mock.calls[0][0] as Course;
    expect(written.generationPreferences).toEqual(course.generationPreferences);
    expect(written.sections).toEqual(course.sections);
    expect(written.citations).toEqual(course.citations);
    expect(written.progress).toEqual(course.progress);
  });

  it('rejects malformed JSON, invalid ids, duplicate ids, and missing fields', async () => {
    await expect(courseRoute.POST(rawRequest('/api/course', '{'))).resolves.toMatchObject({
      status: 400,
    });

    const invalidId = await courseRoute.POST(
      jsonRequest('/api/course', { id: '../bad', title: 'Bad', topic: 'bad' }),
    );
    expect(invalidId.status).toBe(400);

    mockReadCourse.mockResolvedValueOnce(fixtureCourse());
    const duplicate = await courseRoute.POST(
      jsonRequest('/api/course', { id: 'course_1', title: 'Dup', topic: 'dup' }),
    );
    expect(duplicate.status).toBe(409);

    const missing = await courseRoute.POST(jsonRequest('/api/course', { title: 'Missing' }));
    expect(missing.status).toBe(400);
    expect(mockWriteCourse).not.toHaveBeenCalled();
  });
});

describe('PUT /api/course/[id]', () => {
  it('writes the exact course payload when URL and body ids match', async () => {
    const course = fixtureCourse();
    const res = await courseIdRoute.PUT(jsonRequest('/api/course/course_1', course, 'PUT'), params('course_1'));

    expect(res.status).toBe(200);
    expect(mockWriteCourse).toHaveBeenCalledWith(course);
  });

  it('rejects malformed JSON, invalid URL ids, and URL/body id mismatch', async () => {
    const badJson = await courseIdRoute.PUT(rawRequest('/api/course/course_1', '{', 'PUT'), params('course_1'));
    expect(badJson.status).toBe(400);

    const invalidUrl = await courseIdRoute.PUT(
      jsonRequest('/api/course/../bad', fixtureCourse(), 'PUT'),
      params('../bad'),
    );
    expect(invalidUrl.status).toBe(400);

    const mismatch = await courseIdRoute.PUT(
      jsonRequest('/api/course/course_1', { ...fixtureCourse(), id: 'other' }, 'PUT'),
      params('course_1'),
    );
    expect(mismatch.status).toBe(400);
    expect(mockWriteCourse).not.toHaveBeenCalled();
  });
});
