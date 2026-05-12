"use client";

import { useEffect, useCallback } from "react";
import { X } from "lucide-react";

interface PickerModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  label?: string;
  icon?: React.ReactNode;
  width?: "xl" | "2xl" | "3xl" | "4xl" | "5xl";
  flexCol?: boolean;
  cardClassName?: string;
  zIndex?: number;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const maxWidthClasses: Record<string, string> = {
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
};

/**
 * Shared picker modal shell used by every multi-select dialog in the app.
 * Unifies the backdrop, card framing, header, and Escape-key behaviour so
 * individual pickers only need to render their unique content + footer.
 */
export default function PickerModalShell({
  open,
  onClose,
  title,
  subtitle,
  label,
  icon,
  width = "xl",
  flexCol = false,
  cardClassName,
  zIndex = 85,
  footer,
  children,
}: PickerModalShellProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, handleEscape]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const sizeClass = maxWidthClasses[width] ?? maxWidthClasses.xl;
  const flexClass = flexCol ? "flex flex-col" : "";

  return (
    <div
      className={`fixed inset-0 z-[${zIndex}] flex items-center justify-center bg-[var(--background)]/65 p-4 backdrop-blur-md`}
      onClick={handleBackdropClick}
    >
      <div
        className={`surface-card w-full ${sizeClass} ${flexClass} overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-[0_22px_70px_rgba(0,0,0,0.18)] ${cardClassName ?? ""}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            {label && (
              <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
                {icon}
                {label}
              </div>
            )}
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        {flexCol ? (
          <div className="flex flex-1 min-h-0 overflow-hidden">{children}</div>
        ) : (
          <div className="overflow-y-auto">{children}</div>
        )}

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
