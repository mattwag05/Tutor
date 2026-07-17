export type IntentTarget = 'chat' | 'course' | 'book' | 'notebook';

export interface IntentInput {
  text?: string;
  fileName?: string;
}

export interface IntentResult {
  target: IntentTarget;
  params: Record<string, string>;
}

const MARKDOWN_RE = /^#{1,6}\s|^[-*]\s|^```|^\[.+\]\(.+\)/m;

export function classifyIntent({ text, fileName }: IntentInput): IntentResult {
  if (fileName?.toLowerCase().endsWith('.pdf')) {
    return { target: 'book', params: { upload: '1', name: fileName } };
  }

  const t = text?.trim() ?? '';

  if (!t) {
    return { target: 'chat', params: {} };
  }

  // Short, topic-like: no question mark, no markdown, short enough to be a keyword
  if (t.length <= 80 && !t.includes('?') && !t.startsWith('#')) {
    return { target: 'course', params: { topic: t } };
  }

  // Markdown-heavy long text → notebook clip
  if (t.length > 300 && MARKDOWN_RE.test(t)) {
    return { target: 'notebook', params: { clip: t } };
  }

  // Default → chat with the text as the first message
  return { target: 'chat', params: { q: t } };
}

const TARGET_BASE: Record<IntentTarget, string> = {
  chat: '/chat',
  course: '/course',
  book: '/book',
  notebook: '/notebook',
};

export function buildIntentUrl({ target, params }: IntentResult): string {
  const base = TARGET_BASE[target];
  const search = new URLSearchParams(params).toString();
  return search ? `${base}?${search}` : base;
}
