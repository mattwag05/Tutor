/**
 * Tests for GET /api/spaced-review/block — the lookup route the Python
 * spaced-review picker calls to resolve course attempts back to their
 * original question payload. Legacy classroom rows must 400 so the
 * picker drops them silently.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import type { Course } from '@/lib/types/course';

const mockReadCourse = vi.fn();

vi.mock('@/lib/server/course-storage', () => ({
  readCourse: (...args: unknown[]) => mockReadCourse(...args),
}));

// Imported AFTER vi.mock so the route picks up the mocked storage module.
const { GET } = await import('@/app/api/spaced-review/block/route');

function buildRequest(params: Record<string, string>): NextRequest {
  const qs = new URLSearchParams(params).toString();
  return new NextRequest(`http://localhost:3782/api/spaced-review/block?${qs}`);
}

beforeEach(() => {
  mockReadCourse.mockReset();
});

describe('GET /api/spaced-review/block', () => {
  it('400s when source or source_id missing', async () => {
    const res = await GET(buildRequest({ source: 'course' }));
    expect(res.status).toBe(400);
  });

  it('400s when source_id is not 3 ::-separated parts', async () => {
    const res = await GET(buildRequest({ source: 'course', source_id: 'too::short' }));
    expect(res.status).toBe(400);
  });

  it('400s when source is unsupported', async () => {
    const res = await GET(buildRequest({ source: 'book', source_id: 'a::b::c' }));
    expect(res.status).toBe(400);
  });

  it('400s for legacy classroom rows (picker drops them silently)', async () => {
    const res = await GET(
      buildRequest({ source: 'classroom', source_id: 'cls_a1::scn_2::q_0' }),
    );
    expect(res.status).toBe(400);
  });

  describe('course', () => {
    function courseFixture(): Course {
      return {
        id: 'crs_z9',
        title: 'Intro',
        topic: 'Math',
        language: 'en-US',
        createdAt: '2026-05-05T00:00:00Z',
        sections: [
          {
            id: 'sec_1',
            order: 0,
            title: 'Numbers',
            blocks: [
              {
                id: 'mc_blk',
                type: 'multipleChoiceQuiz',
                question: 'What is 2 + 2?',
                choices: ['3', '4', '5', '22'],
                correctIndex: 1,
                explanation: 'Two plus two is four.',
              },
              {
                id: 'fb_blk',
                type: 'fillBlankQuiz',
                question: 'The capital of France is ___.',
                choices: ['London', 'Paris', 'Berlin'],
                correctAnswer: 'B',
                explanation: 'Paris is the capital.',
              },
            ],
            goDeeperPrompts: [],
          },
        ],
        citations: {},
      };
    }

    it('normalizes a multiple-choice quiz block', async () => {
      mockReadCourse.mockResolvedValue(courseFixture());
      const res = await GET(
        buildRequest({ source: 'course', source_id: 'crs_z9::sec_1::mc_blk' }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        question: 'What is 2 + 2?',
        options: { A: '3', B: '4', C: '5', D: '22' },
        correct_answer: 'B',
        explanation: 'Two plus two is four.',
        question_type: 'multiple-choice',
        difficulty: 'medium',
        concentration: 'Numbers',
      });
    });

    it('normalizes a fill-blank quiz block', async () => {
      mockReadCourse.mockResolvedValue(courseFixture());
      const res = await GET(
        buildRequest({ source: 'course', source_id: 'crs_z9::sec_1::fb_blk' }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.question).toBe('The capital of France is ___.');
      expect(body.options).toEqual({ A: 'London', B: 'Paris', C: 'Berlin' });
      expect(body.correct_answer).toBe('B');
      expect(body.question_type).toBe('fill-in-the-blank');
    });

    it('404s when course does not exist', async () => {
      mockReadCourse.mockResolvedValue(null);
      const res = await GET(
        buildRequest({ source: 'course', source_id: 'gone::sec_1::blk' }),
      );
      expect(res.status).toBe(404);
    });

    it('400s when block is not a quiz block', async () => {
      const fixture = courseFixture();
      fixture.sections[0].blocks = [
        { id: 'prose_blk', type: 'prose', markdown: 'just prose' },
      ];
      mockReadCourse.mockResolvedValue(fixture);
      const res = await GET(
        buildRequest({ source: 'course', source_id: 'crs_z9::sec_1::prose_blk' }),
      );
      expect(res.status).toBe(400);
    });
  });
});
