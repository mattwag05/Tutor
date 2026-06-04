import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Course } from '@/lib/types/course';

const mockCallLLM = vi.fn();
const mockBuildPrompt = vi.fn();
const mockResolveModelFromProfile = vi.fn();
const mockReadCourse = vi.fn();
const mockWriteCourse = vi.fn();

vi.mock('@/lib/ai/llm', () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...args),
}));

vi.mock('@/lib/generation/prompts', () => ({
  PROMPT_IDS: {
    COURSE_SECTION: 'course-section',
    COURSE_DIAGRAM: 'course-diagram',
  },
  buildPrompt: (...args: unknown[]) => mockBuildPrompt(...args),
}));

vi.mock('@/lib/server/resolve-profile', () => ({
  resolveModelFromProfile: (...args: unknown[]) => mockResolveModelFromProfile(...args),
}));

vi.mock('@/lib/integrations', () => ({
  isDeepTutorEnabled: () => false,
  getRAGContextForGeneration: vi.fn(),
}));

vi.mock('@/lib/server/course-storage', () => ({
  isValidCourseId: (id: string) => /^[a-zA-Z0-9_-]+$/.test(id),
  readCourse: (...args: unknown[]) => mockReadCourse(...args),
  writeCourse: (...args: unknown[]) => mockWriteCourse(...args),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const sectionRoute = await import('@/app/api/generate/course-section/route');
const diagramRoute = await import('@/app/api/generate/course-diagram/route');

function jsonRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3782${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function readyCourse(patch: Partial<Course> = {}): Course {
  return {
    id: 'course_1',
    title: 'Decision Making',
    topic: 'decision making',
    language: 'en-US',
    createdAt: '2026-06-03T00:00:00.000Z',
    sections: [
      {
        id: 'sec_1',
        order: 1,
        title: 'Tradeoffs',
        blocks: [
          { id: 'blk_1', type: 'heading', level: 2, text: 'Tradeoffs' },
          { id: 'blk_2', type: 'prose', markdown: 'Tradeoffs matter.' },
          {
            id: 'quiz_1',
            type: 'multipleChoiceQuiz',
            question: 'What matters?',
            choices: ['Speed', 'Tradeoffs'],
            correctIndex: 1,
            explanation: 'Tradeoffs drive decisions.',
          },
        ],
        goDeeperPrompts: [],
        status: 'ready',
      },
    ],
    citations: {},
    progress: { sections: {} },
    ...patch,
  };
}

beforeEach(() => {
  mockCallLLM.mockReset();
  mockBuildPrompt.mockReset();
  mockResolveModelFromProfile.mockReset();
  mockReadCourse.mockReset();
  mockWriteCourse.mockReset();

  mockResolveModelFromProfile.mockResolvedValue({
    model: 'mock-model',
    modelInfo: { outputWindow: 4096 },
    modelString: 'mock-provider/mock-model',
  });
  mockBuildPrompt.mockImplementation((_id: string, vars: Record<string, unknown>) => ({
    system: 'system prompt',
    user: JSON.stringify(vars),
  }));
});

describe('POST /api/generate/course-section', () => {
  it('validates required fields', async () => {
    const res = await sectionRoute.POST(jsonRequest('/api/generate/course-section', { topic: 'decisions' }));
    expect(res.status).toBe(400);
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it('passes creator preferences into generation and fills missing ids', async () => {
    mockCallLLM.mockResolvedValue({
      text: JSON.stringify({
        blocks: [
          { type: 'prose', markdown: 'Use a fixed decision window.' },
          { id: 'explicit_block', type: 'heading', level: 2, text: 'Practice' },
        ],
        citations: [
          {
            text: 'Evidence about bounded rationality',
            source: 'Research note',
            url: 'https://example.com/research',
          },
        ],
      }),
    });

    const res = await sectionRoute.POST(
      jsonRequest('/api/generate/course-section', {
        courseTitle: 'Decision Making',
        topic: 'decision making',
        language: 'en-US',
        generationPreferences: {
          focus: 'reviewing',
          length: 'long',
          complexity: 'advanced',
          initialFormat: 'diagram',
          selectedFormats: ['lesson', 'diagram'],
        },
        courseOutline: [{ id: 'sec_1', order: 1, title: 'Tradeoffs' }],
        section: { id: 'sec_1', order: 1, title: 'Tradeoffs', description: 'Decision tradeoffs' },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.section.blocks[0].id).toBe('sec_1_b1');
    expect(body.section.blocks[1].id).toBe('explicit_block');
    expect(body.citations[0]).toMatchObject({
      text: 'Evidence about bounded rationality',
      source: 'Research note',
      url: 'https://example.com/research',
    });
    expect(body.citations[0].id).toMatch(/^src_1_/);

    const promptVars = mockBuildPrompt.mock.calls[0][1] as { personalization: string };
    expect(promptVars.personalization).toContain('Primary focus: reviewing');
    expect(promptVars.personalization).toContain('Requested length: long');
    expect(promptVars.personalization).toContain('Complexity: advanced');
    expect(promptVars.personalization).toContain('Initial format: diagram');
    expect(promptVars.personalization).toContain('Selected formats: lesson, diagram');
  });

  it('reports parse failures and model errors cleanly', async () => {
    mockCallLLM.mockResolvedValueOnce({ text: 'not json' });
    const parseFailure = await sectionRoute.POST(
      jsonRequest('/api/generate/course-section', {
        topic: 'decision making',
        section: { id: 'sec_1', order: 1, title: 'Tradeoffs' },
      }),
    );
    expect(parseFailure.status).toBe(500);
    await expect(parseFailure.json()).resolves.toMatchObject({
      error: 'LLM response could not be parsed into a course section',
    });

    mockCallLLM.mockRejectedValueOnce(new Error('model unavailable'));
    const modelFailure = await sectionRoute.POST(
      jsonRequest('/api/generate/course-section', {
        topic: 'decision making',
        section: { id: 'sec_1', order: 1, title: 'Tradeoffs' },
      }),
    );
    expect(modelFailure.status).toBe(500);
    await expect(modelFailure.json()).resolves.toMatchObject({ error: 'model unavailable' });
  });
});

describe('POST /api/generate/course-diagram', () => {
  it('validates course id', async () => {
    const res = await diagramRoute.POST(jsonRequest('/api/generate/course-diagram', { courseId: '../bad' }));
    expect(res.status).toBe(400);
    expect(mockReadCourse).not.toHaveBeenCalled();
  });

  it('returns cached ready diagrams without calling the model', async () => {
    mockReadCourse.mockResolvedValue(
      readyCourse({
        artifacts: {
          diagram: {
            status: 'ready',
            title: 'Cached Map',
            mermaid: 'flowchart TD\n  A --> B',
            explanation: 'Cached explanation.',
          },
        },
      }),
    );

    const res = await diagramRoute.POST(jsonRequest('/api/generate/course-diagram', { courseId: 'course_1' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      title: 'Cached Map',
      mermaid: 'flowchart TD\n  A --> B',
      explanation: 'Cached explanation.',
    });
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it('rejects empty courses and non-flowchart Mermaid output', async () => {
    mockReadCourse.mockResolvedValueOnce(readyCourse({ sections: [] }));
    const empty = await diagramRoute.POST(jsonRequest('/api/generate/course-diagram', { courseId: 'course_1' }));
    expect(empty.status).toBe(400);
    await expect(empty.json()).resolves.toMatchObject({
      error: 'Course has no ready sections to generate a diagram from',
    });

    mockReadCourse.mockResolvedValueOnce(readyCourse());
    mockCallLLM.mockResolvedValueOnce({
      text: JSON.stringify({
        title: 'Wrong Mermaid',
        mermaid: 'sequenceDiagram\n  A->>B: hi',
        explanation: 'Wrong type.',
      }),
    });
    const wrongMermaid = await diagramRoute.POST(
      jsonRequest('/api/generate/course-diagram', { courseId: 'course_1' }),
    );
    expect(wrongMermaid.status).toBe(500);
    await expect(wrongMermaid.json()).resolves.toMatchObject({
      error: 'LLM response could not be parsed into a Mermaid diagram',
    });
    expect(mockWriteCourse).not.toHaveBeenCalled();
  });

  it('persists ready diagram artifacts', async () => {
    mockReadCourse.mockResolvedValue(readyCourse());
    mockCallLLM.mockResolvedValue({
      text: JSON.stringify({
        title: 'Decision Map',
        mermaid: 'flowchart TD\n  A[Question] --> B[Tradeoffs]',
        explanation: 'Read from question to tradeoffs.',
      }),
    });

    const res = await diagramRoute.POST(jsonRequest('/api/generate/course-diagram', { courseId: 'course_1' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      title: 'Decision Map',
      mermaid: 'flowchart TD\n  A[Question] --> B[Tradeoffs]',
      explanation: 'Read from question to tradeoffs.',
    });

    const written = mockWriteCourse.mock.calls[0][0] as Course;
    expect(written.artifacts?.diagram).toEqual({
      status: 'ready',
      title: 'Decision Map',
      mermaid: 'flowchart TD\n  A[Question] --> B[Tradeoffs]',
      explanation: 'Read from question to tradeoffs.',
    });
  });
});
