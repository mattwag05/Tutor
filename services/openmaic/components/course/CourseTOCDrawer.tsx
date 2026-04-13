'use client';

import type { Course } from '@/lib/types/course';
import { cn } from '@/lib/utils/cn';

interface Props {
  course: Course;
  open: boolean;
  activeSectionId?: string;
  onClose: () => void;
  onSelectSection: (sectionId: string) => void;
  onOpenArtifact: (kind: 'podcast' | 'flashcards' | 'studyGuide' | 'finalExam') => void;
}

export function CourseTOCDrawer({
  course,
  open,
  activeSectionId,
  onClose,
  onSelectSection,
  onOpenArtifact,
}: Props) {
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/20 transition-opacity"
          aria-hidden
        />
      )}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-full w-80 transform overflow-y-auto border-r border-neutral-200 bg-white shadow-xl transition-transform dark:border-neutral-800 dark:bg-neutral-950',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
          <div className="font-serif text-lg text-neutral-900 dark:text-neutral-50">
            {course.title}
          </div>
        </div>

        <nav className="p-2">
          <ul className="space-y-1">
            {course.sections.map((section) => {
              const active = section.id === activeSectionId;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSection(section.id);
                      onClose();
                    }}
                    className={cn(
                      'w-full rounded-md px-3 py-2 text-left text-sm transition',
                      active
                        ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50'
                        : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-900',
                    )}
                  >
                    {section.title}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-2 border-t border-neutral-200 p-2 dark:border-neutral-800">
          <ArtifactButton
            label="Podcast"
            icon="🎧"
            onClick={() => onOpenArtifact('podcast')}
          />
          <ArtifactButton
            label="Flash Cards"
            icon="🃏"
            onClick={() => onOpenArtifact('flashcards')}
          />
          <ArtifactButton
            label="Study Guide"
            icon="📖"
            onClick={() => onOpenArtifact('studyGuide')}
          />
          <ArtifactButton
            label="Final Exam"
            icon="✓"
            onClick={() => onOpenArtifact('finalExam')}
          />
        </div>
      </aside>
    </>
  );
}

function ArtifactButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-neutral-700 transition hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-900"
    >
      <span className="w-5 text-center opacity-70" aria-hidden>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
