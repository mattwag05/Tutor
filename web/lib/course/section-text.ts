import type { CourseBlock, CourseSection } from '@/lib/types/course';
import { stripMarkdown } from '@/lib/utils/strip-markdown';

const MD_INLINE_LATEX_RE = /\$[^$]+\$/g;
const MD_BLOCK_LATEX_RE = /\$\$[\s\S]+?\$\$/g;

/** Strip markdown + LaTeX + course markers to plain text. */
export function proseToPlainText(markdown: string): string {
  return stripMarkdown(markdown)
    .replace(MD_BLOCK_LATEX_RE, '')
    .replace(MD_INLINE_LATEX_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function blockToText(block: CourseBlock): string {
  switch (block.type) {
    case 'prose':
      return proseToPlainText(block.markdown);
    case 'heading':
      return block.text;
    case 'pullQuote':
      return block.attribution
        ? `${block.text} — ${block.attribution}`
        : block.text;
    case 'illustration':
      return block.alt ?? '';
    case 'math':
    case 'fillBlankQuiz':
    case 'multipleChoiceQuiz':
      return '';
    default:
      return '';
  }
}

export function sectionToNarration(section: CourseSection): string {
  const parts: string[] = [section.title];
  for (const block of section.blocks) {
    const t = blockToText(block);
    if (t) parts.push(t);
  }
  return parts.join('. ').replace(/\.\s*\./g, '.').trim();
}
