import type { SourceAnchor } from "@/lib/book-types";

/**
 * Web citations for a book block (DeepTutor-4z7).
 *
 * When ENABLE_BOOK_WEB_SEARCH grounding is on, SourceExplorer emits
 * `source='web'` chunks that become `SourceAnchor{kind:'web', ref:<url>,
 * snippet:'<title>\n<body>'}` on the grounded block. These helpers select and
 * label those anchors so the reader can surface them as external citations.
 * KB/notebook/chat anchors are internal references and are intentionally
 * excluded.
 */

export interface WebSource {
  url: string;
  label: string;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Human label for a web anchor: the snippet's first line (the title the search
 * provider returned) when present, otherwise the URL's hostname.
 */
export function webSourceLabel(anchor: SourceAnchor): string {
  const firstLine = (anchor.snippet || "").split("\n")[0]?.trim() ?? "";
  if (firstLine) return firstLine;
  return hostname(anchor.ref || "");
}

/**
 * Select the surfaceable web citations from a block's source anchors:
 * kind === 'web', a non-empty http(s) ref, deduped by URL, order preserved.
 */
export function selectWebSources(anchors: SourceAnchor[] | undefined): WebSource[] {
  if (!anchors?.length) return [];
  const seen = new Set<string>();
  const out: WebSource[] = [];
  for (const anchor of anchors) {
    if (anchor.kind !== "web") continue;
    const url = (anchor.ref || "").trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, label: webSourceLabel(anchor) });
  }
  return out;
}
