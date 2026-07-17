"use client";

import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SourceAnchor } from "@/lib/book-types";
import { selectWebSources } from "@/lib/book-web-sources";

/**
 * Compact list of external web citations that grounded a block (DeepTutor-4z7).
 * Renders nothing when the block has no surfaceable `kind:'web'` anchors, so it
 * is safe to drop after every block unconditionally.
 */
export default function BlockWebSources({ anchors }: { anchors?: SourceAnchor[] }) {
  const { t } = useTranslation();
  const sources = selectWebSources(anchors);
  if (sources.length === 0) return null;

  return (
    <div className="mt-2 border-t border-[var(--border)] pt-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
        {t("Sources")}
      </div>
      <ul className="flex flex-col gap-1">
        {sources.map((source) => (
          <li key={source.url}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] underline-offset-2 hover:text-[var(--foreground)] hover:underline"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="line-clamp-1">{source.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
