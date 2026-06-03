import { describe, expect, it } from 'vitest';
import type { Course } from '@/lib/types/course';

describe('course format metadata', () => {
  it('persists Tutor creator preferences and diagram artifacts on a course', () => {
    const course: Course = {
      id: 'course_1',
      title: 'Bayesian Decision Making',
      topic: 'Bayesian decision making for beginners',
      language: 'en-US',
      createdAt: '2026-06-03T00:00:00.000Z',
      generationPreferences: {
        focus: 'learning',
        length: 'medium',
        complexity: 'intermediate',
        initialFormat: 'diagram',
        selectedFormats: ['lesson', 'diagram'],
      },
      sections: [],
      citations: {},
      progress: { sections: {} },
      artifacts: {
        diagram: {
          status: 'ready',
          title: 'Bayesian Update Loop',
          mermaid: 'flowchart TD\n  A[Prior] --> B[Evidence]\n  B --> C[Posterior]',
          explanation: 'A prior changes when evidence arrives.',
        },
      },
    };

    expect(course.generationPreferences?.selectedFormats).toContain('diagram');
    expect(course.artifacts?.diagram?.mermaid).toContain('flowchart TD');
  });
});
