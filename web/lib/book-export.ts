import { triggerBlobDownload } from "@/lib/utils/blob-download";

/**
 * Export a book to PDF via the same-origin `/api/export/book-pdf` Next.js route
 * and trigger a browser download. Augments (does not replace) the course PDF
 * export. Throws on failure so callers can surface a toast/error state.
 */
export async function exportBookPdf(bookId: string, title?: string): Promise<void> {
  const res = await fetch("/api/export/book-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId }),
  });

  if (!res.ok) {
    let detail = String(res.status);
    try {
      const data = (await res.json()) as { error?: string; detail?: string };
      detail = data.error ?? data.detail ?? detail;
    } catch {
      // non-JSON error body; keep the status code
    }
    throw new Error(`Book PDF export failed: ${detail}`);
  }

  const blob = await res.blob();
  const name =
    (title || "book").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) || "book";
  triggerBlobDownload(blob, `${name}.pdf`);
}
