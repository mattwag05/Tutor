'use client';

import { useEffect, useRef } from 'react';
import type { IllustrationBlock } from '@/lib/types/course';
import { useCourseStore } from '@/lib/course/store';

interface Props {
  block: IllustrationBlock;
}

export function IllustrationBlockView({ block }: Props) {
  const courseId = useCourseStore.use.course()?.id;
  const setBlockSrc = useCourseStore.use.setBlockSrc();
  const generatingRef = useRef(false);

  useEffect(() => {
    if (block.src || !block.pending || !block.prompt || !courseId) return;
    if (generatingRef.current) return;
    generatingRef.current = true;

    void fetch('/api/generate/course-illustration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, blockId: block.id, prompt: block.prompt }),
    })
      .then(async (res) => {
        if (!res.ok) { generatingRef.current = false; return; }
        const data = (await res.json()) as { src?: string };
        if (data.src) setBlockSrc(block.id, data.src);
        // On success: leave generatingRef true so re-renders don't re-trigger.
        // The store update sets block.src, which the effect's guard will catch anyway.
      })
      .catch(() => { generatingRef.current = false; });
  }, [block.id, block.pending, block.prompt, block.src, courseId, setBlockSrc]);

  if (!block.src || block.pending) {
    return (
      <div className="my-8 aspect-[16/9] w-full overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900">
        <div className="flex h-full items-center justify-center text-sm text-neutral-500">
          {block.prompt ? 'Generating illustration…' : 'Illustration placeholder'}
        </div>
      </div>
    );
  }
  return (
    <figure className="my-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={block.src}
        alt={block.alt || block.prompt}
        className="w-full rounded-lg"
        style={block.aspectRatio ? { aspectRatio: block.aspectRatio.replace(':', '/') } : undefined}
      />
      {block.alt && (
        <figcaption className="mt-2 text-center text-sm italic text-neutral-500">
          {block.alt}
        </figcaption>
      )}
    </figure>
  );
}
