"use client";

import { Check } from "lucide-react";

interface PickerListItemProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  checkboxClassName?: string;
}

/**
 * Reusable picker list row with a checkbox indicator + content slot.
 * Used by every multi-select picker dialog to eliminate the duplicated
 * checkmark + label row markup.
 */
export default function PickerListItem({
  selected,
  onClick,
  children,
  className,
  checkboxClassName,
}: PickerListItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
        selected
          ? "bg-[var(--primary)]/8"
          : "hover:bg-[var(--muted)]/40"
      } ${className ?? ""}`}
    >
      <div
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          selected
            ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
            : "border-[var(--border)] text-transparent"
        } ${checkboxClassName ?? ""}`}
      >
        <Check size={12} />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </button>
  );
}
