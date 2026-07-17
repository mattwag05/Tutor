import { jsPDF } from 'jspdf';
import type { BookDetail, Block, Chapter, Page } from '@/lib/book-types';
import { stripMarkdown } from '@/lib/utils/strip-markdown';

// A4 page geometry (mm). Mirrors web/lib/server/course-pdf.ts; if a third PDF
// exporter appears, lift these helpers into a shared lib/server/pdf-layout.ts.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_L = 16;
const MARGIN_R = 16;
const MARGIN_T = 20;
const MARGIN_B = 20;
const TEXT_W = PAGE_W - MARGIN_L - MARGIN_R;

type Doc = InstanceType<typeof jsPDF>;

function checkPageBreak(doc: Doc, y: number, needed: number): number {
  if (y + needed > PAGE_H - MARGIN_B) {
    doc.addPage();
    return MARGIN_T;
  }
  return y;
}

function addWrappedText(
  doc: Doc,
  text: string,
  y: number,
  options: { fontSize?: number; fontStyle?: string; indent?: number; color?: string } = {},
): number {
  const { fontSize = 10, fontStyle = 'normal', indent = 0, color = '#222222' } = options;
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', fontStyle);
  doc.setTextColor(color);
  const x = MARGIN_L + indent;
  const lines = doc.splitTextToSize(text, TEXT_W - indent) as string[];
  const lineH = fontSize * 0.4;
  for (const line of lines) {
    y = checkPageBreak(doc, y, lineH + 2);
    doc.text(line, x, y);
    y += lineH + 1.5;
  }
  return y;
}

function addSectionDivider(doc: Doc, y: number): number {
  y = checkPageBreak(doc, y, 8);
  doc.setDrawColor('#e5e7eb');
  doc.setLineWidth(0.3);
  doc.line(MARGIN_L, y, PAGE_W - MARGIN_R, y);
  return y + 6;
}

// ── Defensive payload access (Block.payload is Record<string, unknown>) ──
function asRec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function str(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}
function list(o: Record<string, unknown>, key: string): unknown[] {
  const v = o[key];
  return Array.isArray(v) ? v : [];
}

function renderBlock(doc: Doc, block: Block, y: number): number {
  const p = asRec(block.payload);
  if (block.title) {
    y = checkPageBreak(doc, y, 8);
    y = addWrappedText(doc, block.title, y + 1, { fontSize: 11, fontStyle: 'bold', color: '#111827' });
  }
  switch (block.type) {
    case 'text':
    case 'section':
    case 'deep_dive':
    case 'interactive': {
      const intro = str(p, 'intro');
      if (intro) y = addWrappedText(doc, stripMarkdown(intro), y, { fontSize: 10 });
      const body = str(p, 'body', 'description', 'summary', 'content', 'markdown', 'text');
      if (body) y = addWrappedText(doc, stripMarkdown(body), y, { fontSize: 10 });
      for (const sub of list(p, 'subsections')) {
        const s = asRec(sub);
        const st = str(s, 'title', 'heading');
        if (st) y = addWrappedText(doc, st, y + 1, { fontSize: 10.5, fontStyle: 'bold' });
        const sb = str(s, 'body', 'description', 'content', 'text');
        if (sb) y = addWrappedText(doc, stripMarkdown(sb), y, { fontSize: 10 });
      }
      const kt = str(p, 'key_takeaway');
      if (kt) y = addWrappedText(doc, `Key takeaway: ${stripMarkdown(kt)}`, y, { fontSize: 9.5, fontStyle: 'italic', color: '#374151' });
      return y + 3;
    }
    case 'callout': {
      const body = str(p, 'body', 'description', 'text', 'summary');
      if (body) y = addWrappedText(doc, stripMarkdown(body), y, { fontSize: 9.5, fontStyle: 'italic', indent: 4, color: '#374151' });
      return y + 3;
    }
    case 'code': {
      const code = str(p, 'code');
      const lang = str(p, 'language');
      if (code) {
        y = addWrappedText(doc, lang ? `[code · ${lang}]` : '[code]', y, { fontSize: 8.5, fontStyle: 'italic', color: '#6b7280', indent: 4 });
        y = addWrappedText(doc, code, y, { fontSize: 8.5, color: '#1f2937', indent: 4 });
      }
      return y + 3;
    }
    case 'quiz': {
      const questions = list(p, 'questions');
      const items = questions.length ? questions : [p]; // single-question fallback
      for (const raw of items) {
        const q = asRec(raw);
        const qt = str(q, 'question', 'prompt');
        if (!qt) continue;
        y = checkPageBreak(doc, y, 14);
        y = addWrappedText(doc, `Q: ${qt}`, y, { fontSize: 9.5, fontStyle: 'bold', indent: 4 });
        for (const opt of list(q, 'options')) {
          if (typeof opt === 'string' && opt.trim()) {
            y = addWrappedText(doc, `• ${opt}`, y, { fontSize: 9, indent: 8, color: '#374151' });
          }
        }
        const ans = str(q, 'correct_answer', 'answer');
        if (ans) y = addWrappedText(doc, `Answer: ${ans}`, y, { fontSize: 9, indent: 8, color: '#059669' });
        const ex = str(q, 'explanation');
        if (ex) y = addWrappedText(doc, `Explanation: ${stripMarkdown(ex)}`, y, { fontSize: 8.5, fontStyle: 'italic', indent: 8, color: '#6b7280' });
      }
      return y + 3;
    }
    case 'flash_cards': {
      for (const raw of list(p, 'cards')) {
        const c = asRec(raw);
        const front = str(c, 'front', 'term');
        const back = str(c, 'back', 'definition');
        if (front) y = addWrappedText(doc, `• ${front}${back ? ` — ${stripMarkdown(back)}` : ''}`, y, { fontSize: 9.5, indent: 4 });
      }
      return y + 3;
    }
    case 'timeline': {
      for (const raw of list(p, 'events')) {
        const e = asRec(raw);
        const head = [str(e, 'date', 'year'), str(e, 'title', 'label')].filter(Boolean).join(' — ');
        if (head) y = addWrappedText(doc, `• ${head}`, y, { fontSize: 9.5, fontStyle: 'bold', indent: 4 });
        const desc = str(e, 'description');
        if (desc) y = addWrappedText(doc, stripMarkdown(desc), y, { fontSize: 9, indent: 8, color: '#374151' });
      }
      return y + 3;
    }
    case 'figure':
    case 'concept_graph':
    case 'animation': {
      const kind = block.type === 'concept_graph' ? 'Concept graph' : block.type === 'animation' ? 'Animation' : 'Figure';
      const label = str(p, 'label', 'description', 'caption') || block.title || kind;
      y = addWrappedText(doc, `[${kind}: ${label}]`, y, { fontSize: 9, fontStyle: 'italic', color: '#9ca3af', indent: 4 });
      return y + 2;
    }
    case 'user_note':
      return y; // user-private; omit from export
    default: {
      const body = str(p, 'body', 'description', 'text', 'content', 'summary');
      if (body) y = addWrappedText(doc, stripMarkdown(body), y, { fontSize: 10 });
      return y + 2;
    }
  }
}

function renderPage(doc: Doc, page: Page, y: number): number {
  y = checkPageBreak(doc, y, 14);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor('#111827');
  for (const line of doc.splitTextToSize(page.title || 'Untitled', TEXT_W) as string[]) {
    y = checkPageBreak(doc, y, 7);
    doc.text(line, MARGIN_L, y);
    y += 6;
  }
  y += 2;
  for (const block of page.blocks ?? []) {
    y = renderBlock(doc, block, y);
  }
  return y;
}

/**
 * Render a fully-assembled book (BookDetail from `GET /api/v1/book/books/{id}`)
 * to a PDF. Pure: no I/O. Augments — does not replace — the course PDF export.
 * Visual blocks (figure/concept_graph/animation) become labelled placeholders,
 * matching course-pdf.ts behaviour until raster embedding lands (DeepTutor-hap).
 */
export function generateBookPdf(detail: BookDetail): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { book, spine, pages } = detail;
  const pageById = new Map<string, Page>((pages ?? []).map((p) => [p.id, p]));

  let y = MARGIN_T;

  // Cover
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor('#111827');
  for (const line of doc.splitTextToSize(book.title || 'Untitled Book', TEXT_W) as string[]) {
    doc.text(line, MARGIN_L, y);
    y += 10;
  }
  y += 2;
  if (book.description) {
    y = addWrappedText(doc, stripMarkdown(book.description), y, { fontSize: 11, color: '#374151' });
    y += 2;
  }
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor('#6b7280');
  const ms = book.created_at ? (book.created_at > 1e12 ? book.created_at : book.created_at * 1000) : Date.now();
  const date = new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(`Generated ${date} · ${book.chapter_count} chapters · ${book.page_count} pages`, MARGIN_L, y);
  y += 10;
  y = addSectionDivider(doc, y);

  // Ordered chapters (fall back to page order when spine is absent)
  const chapters: Chapter[] = spine ? [...spine.chapters].sort((a, b) => a.order - b.order) : [];

  // Table of contents
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor('#111827');
  doc.text('Contents', MARGIN_L, y);
  y += 6;
  if (chapters.length) {
    chapters.forEach((c, i) => {
      y = addWrappedText(doc, `${i + 1}. ${c.title}`, y, { fontSize: 9.5, indent: 4, color: '#374151' });
    });
  } else {
    [...(pages ?? [])].sort((a, b) => a.order - b.order).forEach((p, i) => {
      y = addWrappedText(doc, `${i + 1}. ${p.title}`, y, { fontSize: 9.5, indent: 4, color: '#374151' });
    });
  }

  // Body
  const rendered = new Set<string>();
  if (chapters.length) {
    for (const chapter of chapters) {
      doc.addPage();
      y = MARGIN_T;
      y = addWrappedText(doc, chapter.title, y, { fontSize: 18, fontStyle: 'bold', color: '#111827' });
      if (chapter.summary) y = addWrappedText(doc, stripMarkdown(chapter.summary), y + 1, { fontSize: 10, color: '#6b7280' });
      y += 4;
      for (const pid of chapter.page_ids ?? []) {
        const page = pageById.get(pid);
        if (page) {
          y = renderPage(doc, page, y);
          rendered.add(pid);
        }
      }
    }
  }
  // Any pages not attached to a chapter
  const orphans = [...(pages ?? [])].filter((p) => !rendered.has(p.id)).sort((a, b) => a.order - b.order);
  if (orphans.length) {
    doc.addPage();
    y = MARGIN_T;
    for (const page of orphans) {
      y = renderPage(doc, page, y);
    }
  }

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}
