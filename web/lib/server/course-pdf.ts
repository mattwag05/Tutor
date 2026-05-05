import { jsPDF } from 'jspdf';
import type {
  Course,
  CourseBlock,
  CourseSection,
  FillBlankQuizBlock,
  MultipleChoiceQuizBlock,
} from '@/lib/types/course';

// A4 page dimensions in mm
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_L = 16;
const MARGIN_R = 16;
const MARGIN_T = 20;
const MARGIN_B = 20;
const TEXT_W = PAGE_W - MARGIN_L - MARGIN_R;

type Doc = InstanceType<typeof jsPDF>;

// Strip inline markers: {{term:X}}, {{cite:X}}, **bold**, *italic*, `code`, [text](url)
function stripMarkdown(text: string): string {
  return text
    .replace(/\{\{term:[^}]+\}\}/g, (m) => m.slice(7, -2))
    .replace(/\{\{cite:[^}]+\}\}/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,4}\s+/gm, '')
    .trim();
}

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
  const width = TEXT_W - indent;
  const lines = doc.splitTextToSize(text, width) as string[];
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

function renderBlock(doc: Doc, block: CourseBlock, citations: Record<string, { text: string; url?: string }>, y: number): number {
  switch (block.type) {
    case 'prose': {
      const text = stripMarkdown(block.markdown);
      if (text) y = addWrappedText(doc, text, y, { fontSize: 10 });
      return y + 3;
    }
    case 'heading': {
      const sizeMap: Record<number, number> = { 2: 13, 3: 11.5, 4: 10.5 };
      y = checkPageBreak(doc, y, 10);
      y = addWrappedText(doc, block.text, y + 2, {
        fontSize: sizeMap[block.level] ?? 11,
        fontStyle: 'bold',
      });
      return y + 1;
    }
    case 'pullQuote': {
      const quoteParts = [block.text];
      if (block.attribution) quoteParts.push(`— ${block.attribution}`);
      if (block.source) quoteParts.push(`(${block.source})`);
      const text = quoteParts.join(' ');
      y = checkPageBreak(doc, y, 10);
      doc.setDrawColor('#6b7280');
      doc.setLineWidth(0.8);
      doc.line(MARGIN_L + 4, y - 1, MARGIN_L + 4, y + (text.length / 40) * 5 + 6);
      y = addWrappedText(doc, text, y, { fontSize: 10, fontStyle: 'italic', indent: 10, color: '#374151' });
      return y + 3;
    }
    case 'math': {
      y = checkPageBreak(doc, y, 8);
      y = addWrappedText(doc, `[Math] ${block.latex}`, y, {
        fontSize: 9,
        fontStyle: 'italic',
        color: '#6b7280',
        indent: 4,
      });
      return y + 2;
    }
    case 'illustration': {
      if (block.alt || block.prompt) {
        y = checkPageBreak(doc, y, 8);
        const label = block.alt || block.prompt;
        y = addWrappedText(doc, `[Illustration: ${label}]`, y, {
          fontSize: 9,
          fontStyle: 'italic',
          color: '#9ca3af',
          indent: 4,
        });
      }
      return y + 2;
    }
    case 'fillBlankQuiz': {
      y = checkPageBreak(doc, y, 14);
      y = addWrappedText(doc, `Q: ${block.question}`, y, { fontSize: 9.5, fontStyle: 'bold', indent: 4 });
      y = addWrappedText(doc, `Answer: ${block.correctAnswer}`, y, { fontSize: 9, indent: 8, color: '#374151' });
      if (block.explanation) {
        y = addWrappedText(doc, `Explanation: ${block.explanation}`, y, {
          fontSize: 8.5,
          fontStyle: 'italic',
          indent: 8,
          color: '#6b7280',
        });
      }
      return y + 3;
    }
    case 'multipleChoiceQuiz': {
      y = checkPageBreak(doc, y, 14);
      y = addWrappedText(doc, `Q: ${block.question}`, y, { fontSize: 9.5, fontStyle: 'bold', indent: 4 });
      const letters = ['A', 'B', 'C', 'D'];
      block.choices?.forEach((opt, i) => {
        const marker = i === block.correctIndex ? '✓ ' : '   ';
        y = addWrappedText(doc, `${marker}${letters[i]}) ${opt}`, y, {
          fontSize: 9,
          indent: 10,
          color: i === block.correctIndex ? '#059669' : '#374151',
        });
      });
      if (block.explanation) {
        y = addWrappedText(doc, `Explanation: ${block.explanation}`, y, {
          fontSize: 8.5,
          fontStyle: 'italic',
          indent: 10,
          color: '#6b7280',
        });
      }
      return y + 3;
    }
    default:
      return y;
  }
}

function renderSection(doc: Doc, section: CourseSection, citations: Record<string, { text: string; url?: string }>, y: number): number {
  y = checkPageBreak(doc, y, 16);

  // Section title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor('#111827');
  const titleLines = doc.splitTextToSize(section.title, TEXT_W) as string[];
  for (const line of titleLines) {
    y = checkPageBreak(doc, y, 8);
    doc.text(line, MARGIN_L, y);
    y += 7;
  }
  y += 3;

  for (const block of section.blocks) {
    y = renderBlock(doc, block, citations, y);
  }
  return y;
}

function renderStudyGuide(doc: Doc, content: string, y: number): number {
  doc.addPage();
  y = MARGIN_T;
  y = addWrappedText(doc, 'Study Guide', y, { fontSize: 18, fontStyle: 'bold' });
  y += 6;
  y = addSectionDivider(doc, y);

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { y += 3; continue; }
    if (trimmed === '---' || trimmed === '***') { y = addSectionDivider(doc, y); continue; }
    if (trimmed.startsWith('## ')) {
      y = addWrappedText(doc, trimmed.slice(3), y + 2, { fontSize: 13, fontStyle: 'bold' });
    } else if (trimmed.startsWith('### ')) {
      y = addWrappedText(doc, trimmed.slice(4), y + 1, { fontSize: 11, fontStyle: 'bold' });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      y = addWrappedText(doc, `• ${trimmed.slice(2)}`, y, { fontSize: 10, indent: 6 });
    } else {
      y = addWrappedText(doc, stripMarkdown(trimmed), y, { fontSize: 10 });
    }
  }
  return y;
}

function renderFinalExam(doc: Doc, questions: Array<FillBlankQuizBlock | MultipleChoiceQuizBlock>, y: number): number {
  doc.addPage();
  y = MARGIN_T;
  y = addWrappedText(doc, 'Final Exam', y, { fontSize: 18, fontStyle: 'bold' });
  y += 6;
  y = addSectionDivider(doc, y);

  questions.forEach((q, i) => {
    y = checkPageBreak(doc, y, 18);
    y = addWrappedText(doc, `${i + 1}. ${q.question}`, y, { fontSize: 10.5, fontStyle: 'bold' });
    if (q.type === 'multipleChoiceQuiz') {
      const letters = ['A', 'B', 'C', 'D'];
      q.choices?.forEach((opt, oi) => {
        y = addWrappedText(doc, `  ${letters[oi]}) ${opt}`, y, { fontSize: 10, indent: 6 });
      });
    }
    y += 4;
  });
  return y;
}

export function generateCoursePdf(course: Course): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = MARGIN_T;

  // Cover: title and metadata
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor('#111827');
  const titleLines = doc.splitTextToSize(course.title, TEXT_W) as string[];
  for (const line of titleLines) {
    doc.text(line, MARGIN_L, y);
    y += 10;
  }
  y += 2;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor('#6b7280');
  const date = new Date(course.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  doc.text(`Generated ${date} · ${course.sections.length} sections`, MARGIN_L, y);
  y += 10;

  y = addSectionDivider(doc, y);

  // Table of contents
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor('#111827');
  doc.text('Contents', MARGIN_L, y);
  y += 6;
  course.sections.forEach((s, i) => {
    y = addWrappedText(doc, `${i + 1}. ${s.title}`, y, { fontSize: 9.5, indent: 4, color: '#374151' });
  });

  if (course.artifacts?.studyGuide?.content) {
    y = addWrappedText(doc, `${course.sections.length + 1}. Study Guide`, y, { fontSize: 9.5, indent: 4, color: '#374151' });
  }
  if (course.artifacts?.finalExam?.questions?.length) {
    const n = (course.artifacts?.studyGuide?.content ? course.sections.length + 2 : course.sections.length + 1);
    y = addWrappedText(doc, `${n}. Final Exam`, y, { fontSize: 9.5, indent: 4, color: '#374151' });
  }

  // Sections
  for (const section of course.sections) {
    doc.addPage();
    y = MARGIN_T;
    y = renderSection(doc, section, course.citations as Record<string, { text: string; url?: string }>, y);
  }

  // Study guide appendix
  if (course.artifacts?.studyGuide?.status === 'ready' && course.artifacts.studyGuide.content) {
    renderStudyGuide(doc, course.artifacts.studyGuide.content, MARGIN_T);
  }

  // Final exam appendix
  if (
    course.artifacts?.finalExam?.status === 'ready' &&
    course.artifacts.finalExam.questions?.length
  ) {
    renderFinalExam(doc, course.artifacts.finalExam.questions, MARGIN_T);
  }

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}
