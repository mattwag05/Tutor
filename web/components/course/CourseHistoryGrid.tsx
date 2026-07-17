'use client';

import { memo, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CourseSummary } from '@/lib/server/course-storage';


function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 10);
  }
}

type ConfirmAction = 'delete' | 'regenerate';

interface CourseCardProps {
  course: CourseSummary;
  // null when this card isn't the one being confirmed. Only the affected
  // card's props change on confirm, so memo skips re-rendering the rest.
  confirmAction: ConfirmAction | null;
  isPending: boolean;
  locale: string;
  canRegenerate: boolean;
  canDelete: boolean;
  onNavigate: (courseId: string) => void;
  onStartConfirm: (courseId: string, action: ConfirmAction) => void;
  onConfirm: (courseId: string, action: ConfirmAction) => void;
  onCancel: () => void;
}

const CourseCard = memo(function CourseCard({
  course,
  confirmAction,
  isPending,
  locale,
  canRegenerate,
  canDelete,
  onNavigate,
  onStartConfirm,
  onConfirm,
  onCancel,
}: CourseCardProps) {
  const { t } = useTranslation();
  const isConfirming = confirmAction !== null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !isConfirming && onNavigate(course.id)}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isConfirming) {
          e.preventDefault();
          onNavigate(course.id);
        }
      }}
      className="group relative flex cursor-pointer flex-col rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-neutral-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-600"
    >
      <div className="line-clamp-2 pr-20 font-serif text-base text-neutral-900 group-hover:text-neutral-700 dark:text-neutral-50 dark:group-hover:text-neutral-200">
        {course.title}
      </div>
      {course.topic !== course.title && (
        <div className="mt-0.5 line-clamp-1 pr-20 text-xs text-neutral-500 dark:text-neutral-400">
          {course.topic}
        </div>
      )}
      <div className="mt-auto flex items-center gap-3 pt-2">
        <span className="text-xs text-neutral-400">{formatDate(course.createdAt, locale)}</span>
        {course.sectionCount > 0 && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
            {t('course.sectionsCount', { count: course.sectionCount })}
          </span>
        )}
      </div>

      {!isConfirming && (
        <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
          {canRegenerate && (
            <button
              type="button"
              aria-label={t('course.regenerateCourseAria', { title: course.title })}
              title={t('course.regenerateCourse')}
              onClick={(e) => {
                e.stopPropagation();
                onStartConfirm(course.id, 'regenerate');
              }}
              className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <RotateCcw size={16} strokeWidth={1.8} />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              aria-label={t('course.deleteCourseAria', { title: course.title })}
              onClick={(e) => {
                e.stopPropagation();
                onStartConfirm(course.id, 'delete');
              }}
              className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-rose-600 dark:hover:bg-neutral-800"
            >
              <Trash2 size={16} strokeWidth={1.8} />
            </button>
          )}
        </div>
      )}

      {confirmAction !== null && (
        <div
          className="absolute right-1 top-1 flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-1.5 py-1 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={isPending}
            onClick={() => onConfirm(course.id, confirmAction)}
            className={`relative rounded-md px-2.5 py-1 text-xs font-medium text-white touch-manipulation disabled:opacity-60 before:absolute before:-inset-2 before:content-[''] ${
              confirmAction === 'delete'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white'
            }`}
          >
            {confirmAction === 'delete'
              ? isPending
                ? t('course.deleting')
                : t('Delete')
              : isPending
                ? t('Starting...')
                : t('Regenerate')}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onCancel}
            className="relative rounded-md px-2 py-1 text-xs text-neutral-600 touch-manipulation hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 before:absolute before:-inset-2 before:content-['']"
          >
            {t('Cancel')}
          </button>
        </div>
      )}
    </div>
  );
});

interface Props {
  courses: CourseSummary[];
  loading?: boolean;
  onDelete?: (courseId: string) => Promise<void> | void;
  onRegenerate?: (courseId: string) => Promise<void> | void;
}

export function CourseHistoryGrid({ courses, loading, onDelete, onRegenerate }: Props) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [confirming, setConfirming] = useState<{ id: string; action: ConfirmAction } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleNavigate = useCallback(
    (courseId: string) => router.push(`/course/${courseId}`),
    [router],
  );
  const handleStartConfirm = useCallback(
    (id: string, action: ConfirmAction) => setConfirming({ id, action }),
    [],
  );
  const handleCancel = useCallback(() => setConfirming(null), []);
  const handleConfirm = useCallback(
    async (courseId: string, action: ConfirmAction) => {
      const handler = action === 'delete' ? onDelete : onRegenerate;
      if (!handler) return;
      setPendingId(courseId);
      try {
        await handler(courseId);
      } finally {
        setPendingId(null);
        setConfirming(null);
      }
    },
    [onDelete, onRegenerate],
  );

  if (loading) {
    return (
      <div className="mt-12">
        <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          {t('course.yourCourses')}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900"
            />
          ))}
        </div>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="mt-12 rounded-xl border border-dashed border-neutral-300 px-6 py-10 text-center dark:border-neutral-700">
        <div className="font-serif text-lg text-neutral-500 dark:text-neutral-400">
          {t('course.createFirstCourse')}
        </div>
        <p className="mt-1 text-sm text-neutral-400 dark:text-neutral-500">
          {t('course.emptyHistoryHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-12">
      <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        {t('course.yourCourses')}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {courses.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            confirmAction={confirming?.id === course.id ? confirming.action : null}
            isPending={pendingId === course.id}
            locale={i18n.language}
            canRegenerate={Boolean(onRegenerate)}
            canDelete={Boolean(onDelete)}
            onNavigate={handleNavigate}
            onStartConfirm={handleStartConfirm}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        ))}
      </div>
    </div>
  );
}
