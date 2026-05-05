import type { CourseBlock, CourseSection } from '@/lib/types/course';

const TERM_RE = /\{\{term:([^}]+)\}\}/g;
const CITE_RE = /\{\{cite:[^}]+\}\}/g;
const MD_BOLD_RE = /\*\*([^*]+)\*\*/g;
const MD_ITALIC_RE = /\*([^*]+)\*/g;
const MD_INLINE_LATEX_RE = /\$[^$]+\$/g;
const MD_BLOCK_LATEX_RE = /\$\$[\s\S]+?\$\$/g;
const MD_HEADING_RE = /^#{1,6}\s+/gm;
const MD_LINK_RE = /\[([^\]]+)\]\([^)]+\)/g;

export function proseToPlainText(markdown: string): string {
  return markdown
    .replace(MD_BLOCK_LATEX_RE, '')
    .replace(MD_INLINE_LATEX_RE, '')
    .replace(TERM_RE, '$1')
    .replace(CITE_RE, '')
    .replace(MD_LINK_RE, '$1')
    .replace(MD_BOLD_RE, '$1')
    .replace(MD_ITALIC_RE, '$1')
    .replace(MD_HEADING_RE, '')
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
