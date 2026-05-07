// Course ↔ Classroom projections (Phase B.2).
// Pure functions — no I/O, no side-effects.
import { nanoid } from 'nanoid';
import type {
  Course,
  CourseSection,
  CourseBlock,
  ProseBlock,
  HeadingBlock,
  MathBlock,
  IllustrationBlock,
} from '@/lib/types/course';
import type { Stage, Scene, SlideContent } from '@/lib/types/stage';
import type {
  Slide,
  SlideTheme,
  PPTElement,
  PPTTextElement,
  PPTLatexElement,
  PPTImageElement,
} from '@/lib/types/slides';
import type { Action, SpeechAction, SpotlightAction } from '@/lib/types/action';
import { proseToPlainText } from '@/lib/course/section-text';
import type { PersistedClassroomData } from '@/lib/server/classroom-storage';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const VIEWPORT_SIZE = 960;
const VIEWPORT_RATIO = 1.777; // 16:9
const SLIDE_HEIGHT = Math.round(VIEWPORT_SIZE / VIEWPORT_RATIO); // 540

const DEFAULT_THEME: SlideTheme = {
  backgroundColor: '#ffffff',
  themeColors: ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626'],
  fontColor: '#111827',
  fontName: 'Microsoft YaHei',
};

const DARK_THEME: SlideTheme = {
  backgroundColor: '#0f172a',
  themeColors: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'],
  fontColor: '#f1f5f9',
  fontName: 'Microsoft YaHei',
};

function themeForCourse(course: Course): SlideTheme {
  const depth = course.personalization?.depth;
  return depth === 'advanced' ? DARK_THEME : DEFAULT_THEME;
}

function makeId(): string {
  return nanoid(8);
}

/** Strip HTML tags and decode basic entities for plain-text extraction. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Wrap plain text in a minimal HTML span for PPTTextElement.content. */
function toHtml(text: string): string {
  return `<span>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
}

// ---------------------------------------------------------------------------
// Course → Classroom
// ---------------------------------------------------------------------------

/**
 * Converts a Course (article-reader) into a Classroom (slide-deck).
 * One Scene per CourseSection; each scene's slide stacks the section's
 * blocks as text / latex / image elements using a fixed linear layout.
 */
export function materializeAsClassroom(course: Course): PersistedClassroomData {
  const stageId = makeId();
  const now = Date.now();

  const stage: Stage = {
    id: stageId,
    name: course.title,
    description: course.topic,
    createdAt: now,
    updatedAt: now,
    languageDirective: course.language,
  };

  const scenes: Scene[] = course.sections.map((section, sectionIdx) =>
    sectionToScene(section, sectionIdx, stageId, course),
  );

  return {
    id: makeId(),
    stage,
    scenes,
    createdAt: new Date().toISOString(),
  };
}

function sectionToScene(
  section: CourseSection,
  order: number,
  stageId: string,
  course: Course,
): Scene {
  const theme = themeForCourse(course);
  const { slide, blockPairs } = buildSlide(section, theme);
  const actions = buildActions(section, slide, blockPairs);

  const content: SlideContent = { type: 'slide', canvas: slide };

  return {
    id: makeId(),
    stageId,
    type: 'slide',
    title: section.title,
    order,
    content,
    actions,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

interface BlockElementPair {
  block: CourseBlock;
  elementId: string;
}

function buildSlide(
  section: CourseSection,
  theme: SlideTheme,
): { slide: Slide; blockPairs: BlockElementPair[] } {
  const PADDING = 40;
  const USABLE_W = VIEWPORT_SIZE - PADDING * 2;

  const elements: PPTElement[] = [];
  const blockPairs: BlockElementPair[] = [];
  let cursorY = PADDING;

  // Section title
  const titleEl: PPTTextElement = {
    id: makeId(),
    type: 'text',
    left: PADDING,
    top: cursorY,
    width: USABLE_W,
    height: 56,
    rotate: 0,
    content: toHtml(section.title),
    defaultFontName: theme.fontName,
    defaultColor: theme.themeColors[0],
    textType: 'title',
  };
  elements.push(titleEl);
  cursorY += 56 + 16;

  for (const block of section.blocks) {
    const el = blockToElement(block, PADDING, cursorY, USABLE_W, theme);
    if (!el) continue;
    elements.push(el);
    blockPairs.push({ block, elementId: el.id });
    cursorY += el.height + 12;
    // Stop filling if we're approaching the bottom of the slide.
    if (cursorY > SLIDE_HEIGHT - 40) break;
  }

  return {
    slide: {
      id: makeId(),
      viewportSize: VIEWPORT_SIZE,
      viewportRatio: VIEWPORT_RATIO,
      theme,
      elements,
      type: 'content',
    },
    blockPairs,
  };
}

const makeSpotlight = (elementId: string): SpotlightAction => ({
  id: makeId(),
  type: 'spotlight',
  elementId,
});

const makeSpeech = (text: string): SpeechAction => ({
  id: makeId(),
  type: 'speech',
  text,
});

// Stage's playback engine bails on empty `scene.actions` (stage.tsx:381),
// so projected classrooms must ship a narration sequence or playback is dead.
function buildActions(
  section: CourseSection,
  slide: Slide,
  blockPairs: BlockElementPair[],
): Action[] {
  const titleElementId = slide.elements[0]!.id;
  const actions: Action[] = [makeSpotlight(titleElementId), makeSpeech(section.title)];

  for (const { block, elementId } of blockPairs) {
    const text = narrationForBlock(block);
    if (!text) continue;
    actions.push(makeSpotlight(elementId), makeSpeech(text));
  }

  return actions;
}

function narrationForBlock(block: CourseBlock): string | null {
  switch (block.type) {
    case 'prose':
      return proseToPlainText(block.markdown) || null;
    case 'heading':
      return block.text;
    case 'pullQuote':
      return block.attribution ? `${block.text} — ${block.attribution}` : block.text;
    case 'math':
      return block.display ? "Here's a key formula on the board." : null;
    case 'illustration':
      return block.alt || null;
    case 'fillBlankQuiz':
    case 'multipleChoiceQuiz':
      return block.question;
    default:
      return null;
  }
}

function blockToElement(
  block: CourseBlock,
  left: number,
  top: number,
  width: number,
  theme: SlideTheme,
): (PPTElement & { height: number }) | null {
  switch (block.type) {
    case 'prose': {
      const text = block.markdown
        .replace(/\{\{[^}]+\}\}/g, '') // strip {{cite:}} / {{term:}} markers
        .replace(/[*_`#]/g, '')
        .trim();
      if (!text) return null;
      const lines = Math.ceil(text.length / 80) + 1;
      const height = Math.min(Math.max(lines * 22, 36), 160);
      const el: PPTTextElement & { height: number } = {
        id: makeId(),
        type: 'text',
        left,
        top,
        width,
        height,
        rotate: 0,
        content: toHtml(text.slice(0, 400)),
        defaultFontName: theme.fontName,
        defaultColor: theme.fontColor,
      };
      return el;
    }
    case 'heading': {
      const height = 40;
      const el: PPTTextElement & { height: number } = {
        id: makeId(),
        type: 'text',
        left,
        top,
        width,
        height,
        rotate: 0,
        content: toHtml(block.text),
        defaultFontName: theme.fontName,
        defaultColor: theme.themeColors[0],
        textType: 'subtitle',
      };
      return el;
    }
    case 'math': {
      const height = block.display ? 80 : 40;
      const el: PPTLatexElement & { height: number } = {
        id: makeId(),
        type: 'latex',
        left,
        top,
        width,
        height,
        rotate: 0,
        fixedRatio: false,
        latex: block.latex,
        align: 'left',
      };
      return el;
    }
    case 'illustration': {
      if (!block.src) return null;
      const height = 140;
      const el: PPTImageElement & { height: number } = {
        id: makeId(),
        type: 'image',
        left,
        top,
        width: Math.min(width, 240),
        height,
        rotate: 0,
        fixedRatio: true,
        src: block.src,
      };
      return el;
    }
    case 'pullQuote': {
      const height = 60;
      const el: PPTTextElement & { height: number } = {
        id: makeId(),
        type: 'text',
        left,
        top,
        width,
        height,
        rotate: 0,
        content: toHtml(`"${block.text}"${block.attribution ? ` — ${block.attribution}` : ''}`),
        defaultFontName: theme.fontName,
        defaultColor: theme.themeColors[1] ?? theme.fontColor,
      };
      return el;
    }
    case 'fillBlankQuiz':
    case 'multipleChoiceQuiz': {
      const label =
        block.type === 'fillBlankQuiz'
          ? `Q: ${block.question}`
          : `Q: ${block.question}\n${block.choices.map((c, i) => `${String.fromCharCode(65 + i)}) ${c}`).join('  ')}`;
      const height = 56;
      const el: PPTTextElement & { height: number } = {
        id: makeId(),
        type: 'text',
        left,
        top,
        width,
        height,
        rotate: 0,
        content: toHtml(label.slice(0, 300)),
        defaultFontName: theme.fontName,
        defaultColor: theme.fontColor,
      };
      return el;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Classroom → Course
// ---------------------------------------------------------------------------

/**
 * Converts a Classroom (slide-deck) into a Course (article-reader).
 * Each slide Scene becomes a CourseSection; PPTElements map to CourseBlocks.
 */
export function materializeAsCourse(classroom: PersistedClassroomData): Course {
  const slideScenes = classroom.scenes.filter((s) => s.type === 'slide');

  const sections: CourseSection[] = slideScenes.map((scene, idx) =>
    sceneToSection(scene, idx),
  );

  return {
    id: makeId(),
    title: classroom.stage.name,
    topic: classroom.stage.description ?? classroom.stage.name,
    language: (classroom.stage.languageDirective as Course['language']) ?? 'en-US',
    createdAt: new Date().toISOString(),
    sections,
    citations: {},
    progress: {
      sections: Object.fromEntries(sections.map((s) => [s.id, 'notStarted'])),
    },
  };
}

function sceneToSection(scene: Scene, order: number): CourseSection {
  const blocks: CourseBlock[] = [];

  if (scene.content.type === 'slide') {
    const slide = scene.content.canvas;
    for (const el of slide.elements) {
      const block = elementToBlock(el);
      if (block) blocks.push(block);
    }
  }

  return {
    id: makeId(),
    order,
    title: scene.title,
    description: `Projected from classroom slide ${order + 1}`,
    blocks,
    goDeeperPrompts: [],
    status: 'ready',
  };
}

function elementToBlock(el: PPTElement): CourseBlock | null {
  switch (el.type) {
    case 'text': {
      const text = stripHtml(el.content);
      if (!text) return null;
      if (el.textType === 'title' || el.textType === 'subtitle') {
        const heading: HeadingBlock = {
          id: makeId(),
          type: 'heading',
          level: el.textType === 'title' ? 2 : 3,
          text,
        };
        return heading;
      }
      const prose: ProseBlock = {
        id: makeId(),
        type: 'prose',
        markdown: text,
      };
      return prose;
    }
    case 'latex': {
      const math: MathBlock = {
        id: makeId(),
        type: 'math',
        latex: el.latex,
        display: (el.height ?? 60) >= 60,
      };
      return math;
    }
    case 'image': {
      if (!el.src) return null;
      const illus: IllustrationBlock = {
        id: makeId(),
        type: 'illustration',
        src: el.src,
        prompt: '',
        alt: 'Projected from classroom slide',
      };
      return illus;
    }
    default:
      return null;
  }
}
