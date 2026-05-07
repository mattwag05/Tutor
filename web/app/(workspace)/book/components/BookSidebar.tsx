"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Compass,
  Loader2,
  Menu,
  RotateCcw,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Book, Page } from "@/lib/book-types";

const STATUS_LABEL: Record<string, string> = {
  pending: "Queued",
  planning: "Planning",
  generating: "Compiling",
  ready: "Ready",
  partial: "Partial",
  error: "Failed",
};

export interface BookSidebarProps {
  book: Book | null;
  onBackToLibrary: () => void;
  pages?: Page[];
  selectedPageId?: string | null;
  onSelectPage?: (id: string) => void;
  onRebuild?: () => void;
  rebuilding?: boolean;
}

interface InnerProps extends BookSidebarProps {
  onAfterSelect?: () => void;
}

function SidebarContent({
  book,
  onBackToLibrary,
  pages = [],
  selectedPageId = null,
  onSelectPage,
  onRebuild,
  rebuilding = false,
  onAfterSelect,
}: InnerProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onBackToLibrary}
          className="inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]/40 hover:text-[var(--foreground)]"
          aria-label="Back">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("All books")}
        </button>
      </div>

      {book && (
        <div className="px-1">
          <div
            className="line-clamp-2 text-sm font-semibold text-[var(--foreground)]"
            title={book.title || t("Untitled book")}
          >
            {book.title || t("Untitled book")}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
            {t(book.status)} ·{" "}
            {t("{{count}} chapters", { count: book.chapter_count || 0 })}
          </div>
        </div>
      )}

      {onRebuild && (
        <button
          type="button"
          onClick={onRebuild}
          disabled={rebuilding}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:border-[var(--primary)]/40 hover:text-[var(--primary)] disabled:opacity-60"
        >
          {rebuilding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          {t("Rebuild book")}
        </button>
      )}

      <section className="flex-1 overflow-y-auto">
        {pages.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--border)] px-2 py-3 text-xs text-[var(--muted-foreground)]">
            {t("Pages will appear here once the spine is confirmed.")}
          </div>
        ) : (
          <>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              {t("Chapters")}
            </div>
            <ul className="space-y-1">
              {pages.map((page) => {
                const active = page.id === selectedPageId;
                const isOverview = page.content_type === "overview";
                return (
                  <li key={page.id}>
                    <button
                      onClick={() => {
                        onSelectPage?.(page.id);
                        onAfterSelect?.();
                      }}
                      className={`flex min-h-[44px] w-full touch-manipulation items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                        active
                          ? "bg-[var(--primary)]/15 text-[var(--foreground)]"
                          : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]/40 hover:text-[var(--foreground)]"
                      } ${
                        isOverview
                          ? "border border-dashed border-[var(--border)]"
                          : ""
                      }`}
                    >
                      <span className="flex min-w-0 items-start gap-1.5">
                        {isOverview && (
                          <Compass className="mt-[1px] h-3 w-3 shrink-0 text-[var(--primary)]" />
                        )}
                        <span className="line-clamp-2">
                          {page.title || t("Untitled")}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--muted-foreground)]">
                        {t(STATUS_LABEL[page.status] || page.status)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

export default function BookSidebar(props: BookSidebarProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const desktopAside = collapsed ? (
    <aside className="hidden h-full w-14 flex-col items-center gap-3 border-r border-[var(--border)] bg-[var(--card)]/40 px-2 py-4 sm:flex">
      <button
        onClick={props.onBackToLibrary}
        title={t("All books")}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]/40 hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <button
        onClick={() => setCollapsed(false)}
        title={t("Expand chapters")}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]/40 hover:text-[var(--foreground)]"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <div className="mt-1 h-px w-8 bg-[var(--border)]" />
      <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
        {(props.pages || []).map((page, index) => {
          const active = page.id === props.selectedPageId;
          return (
            <button
              key={page.id}
              onClick={() => props.onSelectPage?.(page.id)}
              title={page.title || t("Untitled")}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-[11px] font-semibold ${
                active
                  ? "bg-[var(--primary)]/15 text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]/40 hover:text-[var(--foreground)]"
              }`}
            >
              {page.content_type === "overview" ? (
                <Compass className="h-3.5 w-3.5" />
              ) : (
                index + 1
              )}
            </button>
          );
        })}
      </div>
    </aside>
  ) : (
    <aside className="hidden h-full w-[232px] flex-col gap-3 border-r border-[var(--border)] bg-[var(--card)]/40 px-3 py-4 sm:flex">
      <div className="flex justify-end">
        <button
          onClick={() => setCollapsed(true)}
          title={t("Collapse chapters")}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]/40 hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </div>
      <SidebarContent {...props} />
    </aside>
  );

  return (
    <>
      {desktopAside}

      {/* Mobile hamburger — fixed top-left, only below sm: */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label={t("Open chapters")}
        className="fixed left-3 top-3 z-30 flex h-11 w-11 touch-manipulation items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] shadow-sm hover:text-[var(--foreground)] sm:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile drawer + backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 sm:hidden"
          aria-hidden
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-[85%] max-w-xs transform flex-col gap-3 border-r border-[var(--border)] bg-[var(--card)] px-3 py-4 shadow-xl transition-transform sm:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            {t("Chapters")}
          </span>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label={t("Close chapters")}
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)]/40 hover:text-[var(--foreground)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarContent {...props} onAfterSelect={() => setMobileOpen(false)} />
      </aside>
    </>
  );
}
