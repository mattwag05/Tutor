import type { CoursePersonalization } from '@/lib/types/course';

export type SectionDensity = 'concise' | 'standard' | 'deep';

/** Map reader depth to a section-density tier. */
export function densityForDepth(depth: CoursePersonalization['depth'] | undefined): SectionDensity {
  if (depth === 'introductory') return 'concise';
  if (depth === 'advanced') return 'deep';
  return 'standard';
}

interface DensityProfile {
  wordCountRange: string;
  proseChunks: string;
  quizzes: string;
  illustrations: string;
  pullQuotes: string;
  math: string;
}

export const DENSITY_PROFILES: Record<SectionDensity, DensityProfile> = {
  concise: {
    wordCountRange: '350–650',
    proseChunks: '2–3',
    quizzes: '0–1',
    illustrations: '0–1',
    pullQuotes: '0–1',
    math: '0–1',
  },
  standard: {
    wordCountRange: '700–1100',
    proseChunks: '3–5',
    quizzes: '1–2',
    illustrations: '1',
    pullQuotes: '1–2',
    math: '0–1',
  },
  deep: {
    wordCountRange: '1200–1800',
    proseChunks: '5–8',
    quizzes: '2–3',
    illustrations: '1–2',
    pullQuotes: '1–2',
    math: '1–2',
  },
};

/** Format personalization settings into a prompt-ready string. */
export function formatPersonalization(p: CoursePersonalization | undefined): string {
  if (!p) {
    return 'Not specified — use intermediate depth, general audience, narrative style.';
  }
  const density = densityForDepth(p.depth);
  const profile = DENSITY_PROFILES[density];
  return [
    `Target reader depth: ${p.depth}`,
    `Audience: ${p.audience}`,
    `Prose style: ${p.style}`,
    `Section density tier: ${density} (derived from depth)`,
    `Targets for this density:`,
    `  • Total prose: ${profile.wordCountRange} words across ${profile.proseChunks} prose chunks`,
    `  • Quizzes: ${profile.quizzes} per section`,
    `  • Illustrations: ${profile.illustrations} per section`,
    `  • Pull quotes: ${profile.pullQuotes} per section (only with real research context)`,
    `  • Display math: ${profile.math} per section (only when topic warrants)`,
  ].join('\n');
}
