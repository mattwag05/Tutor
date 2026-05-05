import type { Course, CourseSection, CourseBlock } from '@/lib/types/course';
import { stripMarkdown } from '@/lib/utils/strip-markdown';

export interface SlideSpec {
  title: string;
  bullets: string[];
  pullQuote?: { text: string; attribution?: string };
}

function extractBullets(blocks: CourseBlock[]): string[] {
  const bullets: string[] = [];
  for (const block of blocks) {
    if (block.type === 'prose') {
      const text = stripMarkdown(block.markdown);
      if (!text) continue;
      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
      for (const s of sentences.slice(0, Math.min(3, 5 - bullets.length))) {
        if (s.length > 10) bullets.push(s.replace(/\.+$/, ''));
        if (bullets.length >= 5) return bullets;
      }
    } else if (block.type === 'heading') {
      bullets.push(block.text);
      if (bullets.length >= 5) return bullets;
    }
  }
  return bullets;
}

function sectionToSlide(section: CourseSection): SlideSpec {
  const bullets = extractBullets(section.blocks);
  const pqBlock = section.blocks.find((b) => b.type === 'pullQuote');
  const pullQuote =
    pqBlock && pqBlock.type === 'pullQuote'
      ? { text: pqBlock.text, attribution: pqBlock.attribution }
      : undefined;
  return { title: section.title, bullets, pullQuote };
}

export function courseToSlides(course: Course): SlideSpec[] {
  return course.sections.map(sectionToSlide);
}
