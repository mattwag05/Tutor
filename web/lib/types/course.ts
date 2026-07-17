// Course Builder types — article-reader course format. Stored server-side
// in data/courses/<id>.json.

export type Language = 'en-US' | 'zh-CN' | 'ja-JP' | 'ru-RU';

export type CourseBlock =
  | ProseBlock
  | HeadingBlock
  | MathBlock
  | PullQuoteBlock
  | IllustrationBlock
  | FillBlankQuizBlock
  | MultipleChoiceQuizBlock;

export interface BaseBlock {
  id: string;
  type: string;
}

export interface ProseBlock extends BaseBlock {
  type: 'prose';
  /** Markdown body. May contain {{term:...}} and {{cite:src_N}} markers. */
  markdown: string;
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading';
  /** Heading level (1-4). 1 is reserved for section title. */
  level: 2 | 3 | 4;
  text: string;
}

export interface MathBlock extends BaseBlock {
  type: 'math';
  /** LaTeX source. */
  latex: string;
  /** Display (block) vs inline rendering. */
  display: boolean;
  /** When true, the UI shows an "Explain this" button next to the formula. */
  explainable?: boolean;
}

export interface PullQuoteBlock extends BaseBlock {
  type: 'pullQuote';
  text: string;
  /** e.g. "Understanding Gauge Theory and Particle Interactions" */
  attribution?: string;
  /** Short source pill shown after the attribution, e.g. "Beuke.org". */
  source?: string;
  /** References a citation entry in Course.citations. */
  citationId?: string;
}

export interface IllustrationBlock extends BaseBlock {
  type: 'illustration';
  /** Served image URL (media proxy or static). */
  src?: string;
  /** Prompt used to generate the image (useful for re-gen / caching). */
  prompt: string;
  alt?: string;
  aspectRatio?: string;
  /** Deferred generation flag — UI shows placeholder until populated. */
  pending?: boolean;
}

export interface FillBlankQuizBlock extends BaseBlock {
  type: 'fillBlankQuiz';
  /** Question with a single ___ placeholder for the blank. */
  question: string;
  /** Correct answer letter (if choices provided) or free-text expected answer. */
  correctAnswer: string;
  /** Optional multiple-choice answer list. When present, UI renders A/B/C/D. */
  choices?: string[];
  /** Explanation shown after the user answers. */
  explanation: string;
}

export interface MultipleChoiceQuizBlock extends BaseBlock {
  type: 'multipleChoiceQuiz';
  question: string;
  choices: string[];
  /** Index into `choices` of the correct answer. */
  correctIndex: number;
  explanation: string;
}

export type CourseFormat =
  | 'lesson'
  | 'podcast'
  | 'flashcards'
  | 'studyGuide'
  | 'quiz'
  | 'diagram';

export interface CourseGenerationPreferences {
  focus: 'learning' | 'reviewing';
  length: 'short' | 'medium' | 'long';
  complexity: 'beginner' | 'intermediate' | 'advanced';
  initialFormat: CourseFormat;
  selectedFormats: CourseFormat[];
}

// ==================== Sections ====================

export interface CourseSection {
  id: string;
  order: number;
  title: string;
  /** Short description used in the TOC and loading states. */
  description?: string;
  /** Ordered list of blocks that make up the section body. */
  blocks: CourseBlock[];
  /**
   * 4-5 suggested follow-up prompts shown in the "GO DEEPER" strip at
   * section end. Each tap triggers a sub-section generation.
   */
  goDeeperPrompts: string[];
  /** Dynamic sub-sections inserted via "Go deeper" taps or free-text input. */
  subSections?: CourseSection[];
  /** Generation state for lazy section loading. */
  status?: 'pending' | 'generating' | 'ready' | 'error';
  error?: string;
  /** On-demand TTS audio for this section. Absent until synthesized. */
  audio?: {
    status: 'pending' | 'generating' | 'ready' | 'error';
    /** Path served by /api/course/[id]/audio/[sectionId]. */
    url?: string;
    durationSec?: number;
    error?: string;
  };
}

// ==================== Course ====================

export interface CourseCitation {
  id: string;
  text: string;
  source?: string;
  url?: string;
  /** Metadata from the RAG provider (KB name, passage index, etc.). */
  metadata?: Record<string, unknown>;
}

export interface PodcastModeArtifact {
  status: 'pending' | 'generating' | 'ready' | 'error';
  /** Path served by /api/course/[id]/podcast/[mode]. */
  audioUrl?: string;
  durationSec?: number;
  /** Solo: narrator script. Conversational: flat "Host A: …\n\nHost B: …" transcript. */
  transcript?: string;
  /** ISO8601 timestamp of last successful synthesis. */
  generatedAt?: string;
  error?: string;
}

export interface CourseArtifacts {
  podcast?: {
    solo?: PodcastModeArtifact;
    conversational?: PodcastModeArtifact;
  };
  flashcards?: {
    status: 'pending' | 'generating' | 'ready' | 'error';
    cards?: Array<{ id: string; sectionId: string; front: string; back: string }>;
    error?: string;
  };
  studyGuide?: {
    status: 'pending' | 'generating' | 'ready' | 'error';
    /** Markdown body. */
    content?: string;
    error?: string;
  };
  finalExam?: {
    status: 'pending' | 'generating' | 'ready' | 'error';
    questions?: Array<FillBlankQuizBlock | MultipleChoiceQuizBlock>;
    error?: string;
  };
  diagram?: {
    status: 'pending' | 'generating' | 'ready' | 'error';
    title?: string;
    mermaid?: string;
    explanation?: string;
    error?: string;
  };
}

export interface CourseProgress {
  /** Map of sectionId → completion state. */
  sections: Record<string, 'notStarted' | 'inProgress' | 'completed'>;
  /** Last section the user was reading, for resume. */
  lastVisitedSectionId?: string;
}

export interface CoursePersonalization {
  depth: 'introductory' | 'intermediate' | 'advanced';
  audience: 'student' | 'professional' | 'hobbyist';
  style: 'narrative' | 'academic' | 'conversational';
}

export interface Course {
  id: string;
  /** Short title shown in the TOC header. */
  title: string;
  /** The original user prompt that seeded the course. */
  topic: string;
  language: Language;
  /** ISO8601 timestamp. */
  createdAt: string;
  /** Optional Tutor KB name used for RAG citations. */
  knowledgeBase?: string;
  /** Reader depth, audience, and prose style chosen at creation time. */
  personalization?: CoursePersonalization;
  /** Tutor creator controls and requested output formats. */
  generationPreferences?: CourseGenerationPreferences;
  /** Top-level sections. Rendered linearly in the reader. */
  sections: CourseSection[];
  /** Citation store — block markers like {{cite:src_1}} resolve here. */
  citations: Record<string, CourseCitation>;
  /** On-demand artifacts (podcast, flashcards, etc.). Absent until generated. */
  artifacts?: CourseArtifacts;
  /** Per-section user progress. */
  progress?: CourseProgress;
}

// ==================== SSE event shapes ====================

export type CourseOutlineStreamEvent =
  | { type: 'section'; data: CourseSection; index: number }
  | { type: 'retry'; attempt: number; maxAttempts: number }
  | { type: 'done'; sections: CourseSection[]; title: string }
  | { type: 'error'; error: string };

export type CourseSectionStreamEvent =
  | { type: 'block'; data: CourseBlock; index: number }
  | { type: 'citation'; data: CourseCitation }
  | { type: 'done'; section: CourseSection }
  | { type: 'error'; error: string };
