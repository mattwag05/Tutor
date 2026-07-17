'use client';

import { useEffect } from 'react';
import {
  CircleHelp,
  FileText,
  GitBranch,
  Headphones,
  Layers,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Course } from '@/lib/types/course';
import { cn } from '@/lib/utils/cn';

type ArtifactKind = 'podcast' | 'flashcards' | 'studyGuide' | 'finalExam' | 'diagram';

interface Props {
  course: Course;
  open: boolean;
  activeSectionId?: string;
  onClose: () => void;
  onSelectSection: (sectionId: string) => void;
  onOpenArtifact: (kind: ArtifactKind) => void;
}

export function CourseTOCDrawer({
  course,
  open,
  activeSectionId,
  onClose,
  onSelectSection,
  onOpenArtifact,
}: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/20 transition-opacity"
        aria-hidden
      />
      <aside
        className="fixed left-0 top-0 z-50 h-full w-80 max-w-[85vw] overflow-y-auto border-r border-neutral-200 bg-[#fbfaf7] shadow-[0_24px_80px_rgba(40,32,24,0.16)] dark:border-neutral-800 dark:bg-neutral-950"
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-toc-title"
        aria-describedby="course-toc-description"
      >
        <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="course-toc-title" className="font-serif text-lg text-neutral-900 dark:text-neutral-50">
                {t('course.contents')}
              </h2>
              <p id="course-toc-description" className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                {t('course.contentsSummary', {
                  count: course.sections.length,
                  title: course.title,
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition hover:bg-white/70 hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-neutral-50"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <nav className="p-2">
          <ul className="space-y-1">
            {course.sections.map((section, index) => {
              const active = section.id === activeSectionId;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    aria-label={t('course.openSectionAria', {
                      index: index + 1,
                      title: section.title,
                    })}
                    onClick={() => {
                      onSelectSection(section.id);
                      onClose();
                    }}
                    className={cn(
                      'w-full rounded-md px-3 py-2 text-left text-sm transition',
                      active
                        ? 'bg-white font-medium text-neutral-900 shadow-[0_1px_0_rgba(120,92,60,0.08)] dark:bg-neutral-900 dark:text-neutral-50'
                        : 'text-neutral-700 hover:bg-white/70 dark:text-neutral-300 dark:hover:bg-neutral-900',
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
            label={t('course.podcast')}
            icon={Headphones}
            onClick={() => {
              onOpenArtifact('podcast');
              onClose();
            }}
          />
          <ArtifactButton
            label={t('course.flashcards')}
            icon={Layers}
            onClick={() => {
              onOpenArtifact('flashcards');
              onClose();
            }}
          />
          <ArtifactButton
            label={t('course.studyGuide')}
            icon={FileText}
            onClick={() => {
              onOpenArtifact('studyGuide');
              onClose();
            }}
          />
          <ArtifactButton
            label={t('course.quiz')}
            icon={CircleHelp}
            onClick={() => {
              onOpenArtifact('finalExam');
              onClose();
            }}
          />
          <ArtifactButton
            label={t('course.diagram')}
            icon={GitBranch}
            onClick={() => {
              onOpenArtifact('diagram');
              onClose();
            }}
          />
        </div>
      </aside>
    </>
  );
}

function ArtifactButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-neutral-700 transition hover:bg-white/70 dark:text-neutral-300 dark:hover:bg-neutral-900"
    >
      <Icon size={15} strokeWidth={1.8} className="w-5 opacity-70" aria-hidden />
      <span>{label}</span>
    </button>
  );
}
