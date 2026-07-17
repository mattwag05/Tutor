const MAX_FAILURE_MESSAGE_LENGTH = 500;

function normalizePlainText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!trimmed) return fallback;
  if (/^<!doctype html/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) return fallback;
  return trimmed.slice(0, MAX_FAILURE_MESSAGE_LENGTH);
}

export function normalizeFailureMessage(value: unknown, fallback: string): string {
  return normalizePlainText(value, fallback);
}

export async function readFailureMessage(res: Response, fallback: string): Promise<string> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = (await res.json()) as { error?: unknown; message?: unknown };
      return normalizeFailureMessage(data.error ?? data.message, fallback);
    } catch {
      return fallback;
    }
  }

  let text = '';
  try {
    text = await res.text();
  } catch {
    return fallback;
  }
  if (contentType.includes('text/html')) return fallback;
  return normalizeFailureMessage(text, fallback);
}
