import type { CourseSection } from '@/lib/types/course';

interface SectionsToTextOptions {
  includeSectionId?: boolean;
  quizStyle?: 'omit' | 'label' | 'bracket-existing';
}

/** Render ready sections into a plain-text document for LLM prompts. */
export function sectionsToText(sections: CourseSection[], options?: SectionsToTextOptions): string {
  const { includeSectionId = false, quizStyle = 'omit' } = options ?? {};
  return sections
    .filter((s) => s.status === 'ready' && s.blocks.length > 0)
    .map((s) => {
      const body = s.blocks
        .map((b) => {
          if (b.type === 'prose') return b.markdown;
          if (b.type === 'heading') return `### ${b.text}`;
          if (b.type === 'pullQuote') return `> "${b.text}"`;
          if (b.type === 'fillBlankQuiz' || b.type === 'multipleChoiceQuiz') {
            if (quizStyle === 'label') return `Quiz: ${b.question}`;
            if (quizStyle === 'bracket-existing') return `[Existing quiz: "${b.question}"]`;
            return '';
          }
          return '';
        })
        .filter(Boolean)
        .join('\n\n');
      const header = includeSectionId ? `## ${s.title} (id: ${s.id})` : `## ${s.title}`;
      return `${header}\n\n${body}`;
    })
    .join('\n\n---\n\n');
}
