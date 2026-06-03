import { describe, expect, it } from 'vitest';
import { buildPrompt, PROMPT_IDS } from '@/lib/generation/prompts';

describe('course diagram prompt', () => {
  it('registers the Mermaid diagram template without unresolved placeholders', () => {
    const prompt = buildPrompt(PROMPT_IDS.COURSE_DIAGRAM, {
      courseTitle: 'Bayesian Decision Making',
      language: 'en-US',
      sections: '## Bayesian Thinking\n\nPriors update with evidence.',
    });

    expect(prompt).not.toBeNull();
    expect(prompt!.system).toContain('Mermaid');
    expect(prompt!.user).toContain('Bayesian Decision Making');
    expect(`${prompt!.system}\n${prompt!.user}`).not.toMatch(/\{\{\w[\w-]*\}\}/);
  });
});
