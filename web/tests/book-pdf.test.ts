import { describe, it, expect } from 'vitest';
import { generateBookPdf } from '@/lib/server/book-pdf';
import type { Block, BlockType, BookDetail, Chapter, Page } from '@/lib/book-types';

function block(type: BlockType, title: string, payload: Record<string, unknown>): Block {
  return {
    id: `blk-${type}-${title}`,
    type,
    status: 'ready',
    title,
    params: {},
    payload,
    source_anchors: [],
    metadata: {},
    error: '',
    created_at: 1_700_000_000,
    updated_at: 1_700_000_000,
  };
}

function page(id: string, chapterId: string, order: number, blocks: Block[]): Page {
  return {
    id,
    book_id: 'bk1',
    chapter_id: chapterId,
    title: `Page ${order}`,
    learning_objectives: [],
    content_type: 'theory',
    status: 'ready',
    order,
    blocks,
    links: [],
    parent_page_id: '',
    error: '',
    created_at: 1_700_000_000,
    updated_at: 1_700_000_000,
  };
}

function detail(pages: Page[], chapters: Chapter[]): BookDetail {
  return {
    book: {
      id: 'bk1',
      title: 'A Test Book on Transformers',
      description: 'Intuition for attention, derivations, and exercises.',
      status: 'ready',
      proposal: null,
      knowledge_bases: [],
      language: 'en',
      page_count: pages.length,
      chapter_count: chapters.length,
      created_at: 1_700_000_000,
      updated_at: 1_700_000_000,
      metadata: {},
    },
    spine: chapters.length
      ? { book_id: 'bk1', chapters, version: 1, updated_at: 1_700_000_000 }
      : null,
    pages,
    progress: {
      book_id: 'bk1',
      current_page_id: pages[0]?.id ?? '',
      visited_page_ids: [],
      bookmarked_page_ids: [],
      weak_chapters: [],
      score: 0,
      updated_at: 1_700_000_000,
    },
  };
}

const PDF_MAGIC = '%PDF';

function isPdf(bytes: Uint8Array): boolean {
  return String.fromCharCode(...bytes.slice(0, 4)) === PDF_MAGIC;
}

describe('generateBookPdf', () => {
  it('renders a full book (chapters + varied blocks) to valid PDF bytes', () => {
    const p1 = page('p1', 'c1', 0, [
      block('section', 'Attention', { intro: 'Why attention?', body: 'Attention weights tokens by relevance.', key_takeaway: 'Context matters.' }),
      block('code', 'Softmax', { language: 'python', code: 'def softmax(x):\n  ...' }),
      block('quiz', 'Check', { questions: [{ question: 'What does attention weight?', options: ['Tokens', 'Pixels'], correct_answer: 'Tokens', explanation: 'It scores token relevance.' }] }),
    ]);
    const p2 = page('p2', 'c1', 1, [
      block('figure', 'Attention heatmap', { label: 'QK^T heatmap', chart_type: 'heatmap' }),
      block('flash_cards', 'Terms', { cards: [{ front: 'Query', back: 'What we look up with' }, { front: 'Key', back: 'What we match against' }] }),
      block('timeline', 'History', { events: [{ date: '2017', title: 'Attention Is All You Need', description: 'Transformer introduced.' }] }),
    ]);
    const c1: Chapter = {
      id: 'c1',
      title: 'Foundations',
      learning_objectives: [],
      content_type: 'theory',
      source_anchors: [],
      prerequisites: [],
      page_ids: ['p1', 'p2'],
      summary: 'The basics of attention.',
      order: 0,
    };
    const bytes = generateBookPdf(detail([p1, p2], [c1]));
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(800);
    expect(isPdf(bytes)).toBe(true);
  });

  it('does not throw on missing/empty payloads, unknown order, or no spine', () => {
    const orphan = page('p9', '', 0, [
      block('text', 'Bare', {}),
      block('user_note', 'note', { body: 'private' }),
      block('concept_graph', 'Graph', {}),
    ]);
    const bytes = generateBookPdf(detail([orphan], []));
    expect(isPdf(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(500);
  });
});
