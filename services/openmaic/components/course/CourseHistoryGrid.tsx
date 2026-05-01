'use client';

import { useRouter } from 'next/navigation';
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
}

export function CourseHistoryGrid({ courses, loading }: Props) {
  const router = useRouter();

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

  return (
    <div className="mt-12">
      <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Your courses
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {courses.map((course) => (
          <button
            key={course.id}
            type="button"
            onClick={() => router.push(`/course/${course.id}`)}
            className="group flex flex-col rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-neutral-400 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-600"
          >
            <div className="line-clamp-2 font-serif text-base text-neutral-900 group-hover:text-neutral-700 dark:text-neutral-50 dark:group-hover:text-neutral-200">
              {course.title}
            </div>
            {course.topic !== course.title && (
              <div className="mt-0.5 line-clamp-1 text-xs text-neutral-500 dark:text-neutral-400">
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
          </button>
        ))}
      </div>
    </div>
  );
}
