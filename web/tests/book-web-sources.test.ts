import { describe, expect, it } from "vitest";
import type { SourceAnchor } from "@/lib/book-types";
import { selectWebSources, webSourceLabel } from "@/lib/book-web-sources";

function anchor(partial: Partial<SourceAnchor>): SourceAnchor {
  return { kind: "web", ref: "https://example.com", snippet: "", ...partial };
}

describe("webSourceLabel", () => {
  it("uses the snippet's first line (the search title) when present", () => {
    expect(
      webSourceLabel(anchor({ snippet: "How photosynthesis works\nLong body text…" })),
    ).toBe("How photosynthesis works");
  });

  it("falls back to the URL hostname (sans www) when snippet is empty", () => {
    expect(webSourceLabel(anchor({ ref: "https://www.nature.com/articles/x", snippet: "" }))).toBe(
      "nature.com",
    );
  });

  it("falls back to the raw ref when it is not a parseable URL", () => {
    expect(webSourceLabel(anchor({ ref: "not a url", snippet: "" }))).toBe("not a url");
  });
});

describe("selectWebSources", () => {
  it("returns [] for empty/undefined", () => {
    expect(selectWebSources(undefined)).toEqual([]);
    expect(selectWebSources([])).toEqual([]);
  });

  it("keeps only kind='web' anchors with http(s) refs", () => {
    const sources = selectWebSources([
      anchor({ kind: "kb", ref: "doc-123", snippet: "internal" }),
      anchor({ kind: "web", ref: "https://a.com", snippet: "A title\nbody" }),
      anchor({ kind: "web", ref: "doc-no-scheme", snippet: "skip me" }),
      anchor({ kind: "web", ref: "ftp://x.com", snippet: "skip me too" }),
    ]);
    expect(sources).toEqual([{ url: "https://a.com", label: "A title" }]);
  });

  it("dedupes by URL, preserving first-seen order", () => {
    const sources = selectWebSources([
      anchor({ kind: "web", ref: "https://a.com", snippet: "first" }),
      anchor({ kind: "web", ref: "https://b.com", snippet: "second" }),
      anchor({ kind: "web", ref: "https://a.com", snippet: "dupe" }),
    ]);
    expect(sources.map((s) => s.url)).toEqual(["https://a.com", "https://b.com"]);
  });
});
