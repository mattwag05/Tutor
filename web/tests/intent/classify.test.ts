import { describe, it, expect } from 'vitest';
import { classifyIntent, buildIntentUrl } from '@/lib/intent/classify';

describe('classifyIntent', () => {
  it.each([
    // PDF → book upload
    [{ fileName: 'chapter1.pdf' }, 'book', { upload: '1', name: 'chapter1.pdf' }],
    [{ fileName: 'NOTES.PDF' }, 'book', { upload: '1', name: 'NOTES.PDF' }],

    // Empty input → chat
    [{ text: '' }, 'chat', {}],
    [{ text: '   ' }, 'chat', {}],
    [{}, 'chat', {}],

    // Short keyword → course
    [{ text: 'photosynthesis' }, 'course', { topic: 'photosynthesis' }],
    [{ text: 'machine learning basics' }, 'course', { topic: 'machine learning basics' }],
    [{ text: 'a'.repeat(80) }, 'course', { topic: 'a'.repeat(80) }],

    // 81-char text without ? → chat (too long for course shortcut)
    [{ text: 'a'.repeat(81) }, 'chat', { q: 'a'.repeat(81) }],

    // Question → chat
    [{ text: 'What is the difference between TCP and UDP?' }, 'chat', { q: 'What is the difference between TCP and UDP?' }],
    [{ text: 'Why does the sky turn red at sunset?' }, 'chat', { q: 'Why does the sky turn red at sunset?' }],

    // Markdown-heavy long text → notebook
    [{ text: '# My Notes\n\n- point one\n- point two\n\n'.repeat(20) }, 'notebook', {}],
  ])('classifyIntent(%o) → target=%s', (input: { text?: string; fileName?: string }, expectedTarget: string, expectedParamsPartial: Record<string, string>) => {
    const { text, fileName } = input;
    const result = classifyIntent({ text, fileName });
    expect(result.target).toBe(expectedTarget);
    for (const [key, value] of Object.entries(expectedParamsPartial)) {
      expect(result.params[key]).toBe(value);
    }
  });
});

describe('buildIntentUrl', () => {
  it('builds chat URL with query', () => {
    expect(buildIntentUrl({ target: 'chat', params: { q: 'hello' } })).toBe('/chat?q=hello');
  });

  it('builds course URL with topic', () => {
    expect(buildIntentUrl({ target: 'course', params: { topic: 'biology' } })).toBe('/course?topic=biology');
  });

  it('builds book URL with upload params', () => {
    const url = buildIntentUrl({ target: 'book', params: { upload: '1', name: 'test.pdf' } });
    expect(url).toContain('/book');
    expect(url).toContain('upload=1');
    expect(url).toContain('name=test.pdf');
  });

  it('builds bare URL when no params', () => {
    expect(buildIntentUrl({ target: 'chat', params: {} })).toBe('/chat');
  });

  it('builds notebook URL', () => {
    const url = buildIntentUrl({ target: 'notebook', params: { clip: 'hello' } });
    expect(url).toBe('/notebook?clip=hello');
  });
});
