import { describe, it, expect } from 'vitest';
import { materializeAsClassroom } from '@/lib/generation/projections';
import type { Course } from '@/lib/types/course';
import type { SpeechAction } from '@/lib/types/action';

function fixtureCourse(): Course {
  return {
    id: 'c1',
    title: 'Photosynthesis',
    topic: 'How plants make food',
    language: 'en-US',
    createdAt: new Date().toISOString(),
    sections: [
      {
        id: 's1',
        order: 0,
        title: 'The light reactions',
        blocks: [
          { id: 'b1', type: 'heading', level: 2, text: 'Overview' },
          {
            id: 'b2',
            type: 'prose',
            markdown: 'Chlorophyll absorbs light and splits water molecules.',
          },
          { id: 'b3', type: 'math', latex: '6CO_2 + 6H_2O \\to C_6H_{12}O_6 + 6O_2', display: true },
        ],
        goDeeperPrompts: [],
        status: 'ready',
      },
      {
        id: 's2',
        order: 1,
        title: 'The Calvin cycle',
        blocks: [
          {
            id: 'b4',
            type: 'prose',
            markdown: 'In the stroma, ATP and NADPH drive carbon fixation.',
          },
        ],
        goDeeperPrompts: [],
        status: 'ready',
      },
    ],
    citations: {},
    progress: { sections: {} },
  };
}

describe('materializeAsClassroom — playback wiring', () => {
  it('emits actions for every scene so the playback engine starts', () => {
    const classroom = materializeAsClassroom(fixtureCourse());

    expect(classroom.scenes).toHaveLength(2);
    for (const scene of classroom.scenes) {
      expect(scene.actions).toBeDefined();
      expect(scene.actions!.length).toBeGreaterThan(0);
    }
  });

  it('emits a SpeechAction containing the section title', () => {
    const classroom = materializeAsClassroom(fixtureCourse());
    const firstSpeech = classroom.scenes[0].actions?.find(
      (a): a is SpeechAction => a.type === 'speech',
    );
    expect(firstSpeech).toBeDefined();
    expect(firstSpeech!.text).toBe('The light reactions');
  });

  it('narrates prose blocks via SpeechAction', () => {
    const classroom = materializeAsClassroom(fixtureCourse());
    const speeches = classroom.scenes[0].actions!.filter(
      (a): a is SpeechAction => a.type === 'speech',
    );
    const joined = speeches.map((s) => s.text).join(' ');
    expect(joined).toContain('Chlorophyll absorbs light');
  });

  it('precedes every speech with a spotlight on its element', () => {
    const classroom = materializeAsClassroom(fixtureCourse());
    const actions = classroom.scenes[0].actions!;
    for (let i = 0; i < actions.length; i += 2) {
      expect(actions[i].type).toBe('spotlight');
      expect(actions[i + 1].type).toBe('speech');
    }
  });

  it('skips illustration blocks with no alt text', () => {
    const course = fixtureCourse();
    course.sections[1].blocks.push({
      id: 'b5',
      type: 'illustration',
      src: '/img.png',
      prompt: 'p',
    });
    const classroom = materializeAsClassroom(course);
    const speeches = classroom.scenes[1].actions!.filter(
      (a): a is SpeechAction => a.type === 'speech',
    );
    expect(speeches.every((s) => !s.text.includes('img.png'))).toBe(true);
  });
});
