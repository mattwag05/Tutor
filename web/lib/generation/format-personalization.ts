import type { CoursePersonalization } from '@/lib/types/course';

/** Format personalization settings into a prompt-ready string. */
export function formatPersonalization(p: CoursePersonalization | undefined): string {
  if (!p) return 'Not specified — use intermediate depth, general audience, narrative style.';
  return `Target reader depth: ${p.depth}\nAudience: ${p.audience}\nProse style: ${p.style}`;
}
