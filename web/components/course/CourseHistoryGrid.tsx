'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import type { CourseSummary } from '@/lib/server/course-storage';


function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 10);
  }
}

interface Props {
  courses: CourseSummary[];
  loading?: boolean;
  onDelete?: (courseId: string) => Promise<void> | void;
}

export function CourseHistoryGrid({ courses, loading, onDelete }: Props) {
  const router = useRouter();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="mt-12">
        <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Your courses
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
          Create your first course
        </div>
        <p className="mt-1 text-sm text-neutral-400 dark:text-neutral-500">
          Type a topic above and hit Generate course.
        </p>
      </div>
    );
  }

  const handleDeleteClick = async (courseId: string) => {
    if (!onDelete) return;
    setPendingId(courseId);
    try {
      await onDelete(courseId);
    } finally {
      setPendingId(null);
      setConfirmingId(null);
    }
  };

  return (
    <div className="mt-12">
      <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Your courses
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {courses.map((course) => {
          const isConfirming = confirmingId === course.id;
          const isPending = pendingId === course.id;
          return (
            <div
              key={course.id}
              role="button"
              tabIndex={0}
              onClick={() => !isConfirming && router.push(`/course/${course.id}`)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !isConfirming) {
                  e.preventDefault();
                  router.push(`/course/${course.id}`);
                }
              }}
              className="group relative flex cursor-pointer flex-col rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-neutral-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-600"
            >
              <div className="line-clamp-2 pr-12 font-serif text-base text-neutral-900 group-hover:text-neutral-700 dark:text-neutral-50 dark:group-hover:text-neutral-200">
                {course.title}
              </div>
              {course.topic !== course.title && (
                <div className="mt-0.5 line-clamp-1 pr-12 text-xs text-neutral-500 dark:text-neutral-400">
                  {course.topic}
                </div>
              )}
              <div className="mt-auto flex items-center gap-3 pt-2">
                <span className="text-xs text-neutral-400">{formatDate(course.createdAt)}</span>
                {course.sectionCount > 0 && (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                    {course.sectionCount} sections
                  </span>
                )}
              </div>

              {onDelete && !isConfirming && (
                <button
                  type="button"
                  aria-label={`Delete ${course.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmingId(course.id);
                  }}
                  className="absolute right-1 top-1 flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg text-neutral-400 opacity-100 transition hover:bg-neutral-100 hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100 dark:hover:bg-neutral-800"
                >
                  <Trash2 size={16} strokeWidth={1.8} />
                </button>
              )}

              {onDelete && isConfirming && (
                <div
                  className="absolute right-1 top-1 flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-1.5 py-1 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => void handleDeleteClick(course.id)}
                    className="relative rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white touch-manipulation hover:bg-rose-700 disabled:opacity-60 before:absolute before:-inset-2 before:content-['']"
                  >
                    {isPending ? 'Deleting…' : 'Delete'}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setConfirmingId(null)}
                    className="relative rounded-md px-2 py-1 text-xs text-neutral-600 touch-manipulation hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 before:absolute before:-inset-2 before:content-['']"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
