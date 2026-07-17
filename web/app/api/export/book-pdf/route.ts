import { NextRequest } from 'next/server';
import { generateBookPdf } from '@/lib/server/book-pdf';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import type { BookDetail } from '@/lib/book-types';

// Books live in the Python backend (deeptutor/book), so unlike the course PDF
// route (which reads web/ local storage) this fetches the fully-assembled
// BookDetail from the backend, then renders it with the shared jsPDF stack.
export const maxDuration = 60;

const BACKEND = process.env.DEEPTUTOR_API_URL || 'http://127.0.0.1:8001';

export async function POST(req: NextRequest) {
  let body: { bookId?: string };
  try {
    body = (await req.json()) as { bookId?: string };
  } catch {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Invalid JSON body');
  }

  const { bookId } = body;
  if (!bookId || !/^[A-Za-z0-9_-]{1,128}$/.test(bookId)) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'bookId is required');
  }

  let detail: BookDetail;
  try {
    const res = await fetch(`${BACKEND}/api/v1/book/books/${encodeURIComponent(bookId)}`, {
      cache: 'no-store',
    });
    if (res.status === 404) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, `Book ${bookId} not found`);
    }
    if (!res.ok) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 502, 'Book service error');
    }
    detail = (await res.json()) as BookDetail;
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 502, 'Book service unreachable');
  }

  if (!detail?.book) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, `Book ${bookId} not found`);
  }

  const pdf = generateBookPdf(detail);
  const filename =
    (detail.book.title || 'book')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 60) || 'book';

  return new Response(pdf.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      'Content-Length': String(pdf.byteLength),
    },
  });
}
