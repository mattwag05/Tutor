'use client';

import { use } from 'react';
import Link from 'next/link';
import { useCourseStore } from '@/lib/course/store';
import { WordQuest } from '@/components/course/games/WordQuest';

interface Params {
  params: Promise<{ id: string }>;
}

export default function WordQuestPage({ params }: Params) {
  const { id } = use(params);
  const course = useCourseStore.use.course();

  if (!course || course.id !== id) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 overflow-y-auto">
        <p className="text-neutral-500">Course not loaded.</p>
        <Link href={`/course/${id}`} className="text-blue-600 hover:underline">
          Open course reader first
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-white dark:bg-neutral-950">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <Link
          href={`/course/${id}`}
          className="flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-3 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-900"
        >
          ← Course
        </Link>
        <span className="min-w-0 flex-1 truncate font-serif text-lg text-neutral-900 dark:text-neutral-50">
          {course.title}
        </span>
      </header>
      <main className="py-8">
        <WordQuest course={course} />
      </main>
    </div>
  );
}
