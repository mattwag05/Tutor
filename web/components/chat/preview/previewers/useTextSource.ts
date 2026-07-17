"use client";

import { useEffect, useRef, useState } from "react";

const MAX_TEXT_BYTES = 8 * 1024 * 1024; // 8 MB — preview, not a download

export type TextSourceState =
  | { kind: "loading" }
  | { kind: "ready"; text: string }
  | { kind: "error"; message: string };

/**
 * Fetch the text content at *url* (HEAD-checked for size to avoid pulling
 * a 50 MB log into memory). Aborts on unmount.
 *
 * If *fallbackText* is provided and the URL is empty/missing, we render
 * that text instead of fetching. This handles the office-doc case where
 * the backend already extracted plain text.
 */
export function useTextSource(
  url: string | null,
  fallbackText?: string,
): TextSourceState {
  const [state, setState] = useState<{
    url: string;
    source: TextSourceState;
  } | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!url) return;

    const reqId = ++reqIdRef.current;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const lengthHeader = res.headers.get("content-length");
        if (lengthHeader && Number(lengthHeader) > MAX_TEXT_BYTES) {
          throw new Error(
            "File is too large to preview as text. Use the Download button.",
          );
        }
        const text = await res.text();
        if (reqIdRef.current !== reqId) return; // superseded
        setState({ url, source: { kind: "ready", text } });
      } catch (err) {
        if (controller.signal.aborted) return;
        if (reqIdRef.current !== reqId) return;
        const message =
          err instanceof Error ? err.message : "Failed to load preview";
        setState({ url, source: { kind: "error", message } });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [url, fallbackText]);

  if (!url) {
    return fallbackText !== undefined
      ? { kind: "ready", text: fallbackText }
      : {
          kind: "error",
          message: "Preview source is not available.",
        };
  }

  return state?.url === url ? state.source : { kind: "loading" };
}
