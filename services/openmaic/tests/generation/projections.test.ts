import { describe, it, expect } from 'vitest';
import { materializeAsClassroom, materializeAsCourse } from '@/lib/generation/projections';
import type { Course } from '@/lib/types/course';
import type { PersistedClassroomData } from '@/lib/server/classroom-storage';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COURSE: Course = {
  id: 'c1',
  title: 'Intro to Quantum Computing',
  topic: 'quantum computing for beginners',
  language: 'en-US',
  createdAt: '2026-05-05T00:00:00Z',
  sections: [
    {
      id: 's1',
      order: 0,
      title: 'What is a Qubit?',
      blocks: [
        {
          id: 'b1',
          type: 'prose',
          markdown: 'A qubit is the basic unit of quantum information.',
        },
        {
          id: 'b2',
          type: 'heading',
          level: 2,
          text: 'Superposition',
        },
        {
          id: 'b3',
          type: 'math',
          latex: '|\\psi\\rangle = \\alpha|0\\rangle + \\beta|1\\rangle',
          display: true,
        },
      ],
      goDeeperPrompts: ['How does superposition work?'],
    },
    {
      id: 's2',
      order: 1,
      title: 'Entanglement',
      blocks: [
        {
          id: 'b4',
          type: 'prose',
          markdown: 'Entanglement links qubits regardless of distance.',
        },
        {
          id: 'b5',
          type: 'pullQuote',
          text: 'Spooky action at a distance.',
          attribution: 'Albert Einstein',
        },
      ],
      goDeeperPrompts: [],
    },
  ],
  citations: {},
};

// ---------------------------------------------------------------------------
// Course → Classroom
// ---------------------------------------------------------------------------

describe('materializeAsClassroom', () => {
  it('creates one scene per section', () => {
    const classroom = materializeAsClassroom(COURSE);
    expect(classroom.scenes).toHaveLength(2);
  });

  it('preserves section titles as scene titles', () => {
    const classroom = materializeAsClassroom(COURSE);
    expect(classroom.scenes[0].title).toBe('What is a Qubit?');
    expect(classroom.scenes[1].title).toBe('Entanglement');
  });

  it('scenes are type slide', () => {
    const classroom = materializeAsClassroom(COURSE);
    for (const scene of classroom.scenes) {
      expect(scene.type).toBe('slide');
    }
  });

  it('stage uses course title and topic', () => {
    const classroom = materializeAsClassroom(COURSE);
    expect(classroom.stage.name).toBe('Intro to Quantum Computing');
    expect(classroom.stage.description).toBe('quantum computing for beginners');
  });

  it('first slide has a title text element', () => {
    const classroom = materializeAsClassroom(COURSE);
    const scene0 = classroom.scenes[0];
    expect(scene0.content.type).toBe('slide');
    if (scene0.content.type !== 'slide') return;
    const titleEl = scene0.content.canvas.elements.find(
      (el) => el.type === 'text' && (el as { textType?: string }).textType === 'title',
    );
    expect(titleEl).toBeDefined();
  });

  it('maps math blocks to latex elements', () => {
    const classroom = materializeAsClassroom(COURSE);
    const scene0 = classroom.scenes[0];
    if (scene0.content.type !== 'slide') return;
    const latexEl = scene0.content.canvas.elements.find((el) => el.type === 'latex');
    expect(latexEl).toBeDefined();
    expect((latexEl as { latex: string }).latex).toContain('psi');
  });

  it('assigns sequential order to scenes', () => {
    const classroom = materializeAsClassroom(COURSE);
    expect(classroom.scenes[0].order).toBe(0);
    expect(classroom.scenes[1].order).toBe(1);
  });

  it('generates unique ids for stage, scenes, and slides', () => {
    const classroom = materializeAsClassroom(COURSE);
    const ids = new Set([
      classroom.id,
      classroom.stage.id,
      ...classroom.scenes.map((s) => s.id),
    ]);
    expect(ids.size).toBe(1 + 1 + classroom.scenes.length);
  });
});

// ---------------------------------------------------------------------------
// Classroom → Course
// ---------------------------------------------------------------------------

function makeMiniClassroom(): PersistedClassroomData {
  return materializeAsClassroom(COURSE);
}

describe('materializeAsCourse', () => {
  it('creates one section per slide scene', () => {
    const course = materializeAsCourse(makeMiniClassroom());
    expect(course.sections).toHaveLength(2);
  });

  it('preserves scene titles as section titles', () => {
    const course = materializeAsCourse(makeMiniClassroom());
    expect(course.sections[0].title).toBe('What is a Qubit?');
    expect(course.sections[1].title).toBe('Entanglement');
  });

  it('extracts latex elements as math blocks', () => {
    const course = materializeAsCourse(makeMiniClassroom());
    const section0 = course.sections[0];
    const mathBlock = section0.blocks.find((b) => b.type === 'math');
    expect(mathBlock).toBeDefined();
    expect((mathBlock as { latex: string }).latex).toContain('psi');
  });

  it('title field uses stage name', () => {
    const course = materializeAsCourse(makeMiniClassroom());
    expect(course.title).toBe('Intro to Quantum Computing');
  });

  it('sections have sequential order', () => {
    const course = materializeAsCourse(makeMiniClassroom());
    expect(course.sections[0].order).toBe(0);
    expect(course.sections[1].order).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Round-trip invariants
// ---------------------------------------------------------------------------

describe('round-trip: course → classroom → course', () => {
  it('section count is preserved', () => {
    const classroom = materializeAsClassroom(COURSE);
    const recovered = materializeAsCourse(classroom);
    expect(recovered.sections).toHaveLength(COURSE.sections.length);
  });

  it('section titles are preserved', () => {
    const classroom = materializeAsClassroom(COURSE);
    const recovered = materializeAsCourse(classroom);
    for (let i = 0; i < COURSE.sections.length; i++) {
      expect(recovered.sections[i].title).toBe(COURSE.sections[i].title);
    }
  });

  it('generates new ids on each call (idempotent but not identity)', () => {
    const c1 = materializeAsClassroom(COURSE);
    const c2 = materializeAsClassroom(COURSE);
    expect(c1.id).not.toBe(c2.id);
  });
});
