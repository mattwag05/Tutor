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
        if (data.src) {
          setBlockSrc(block.id, data.src);
          // Don't reset generatingRef — store update lands block.src which the
          // effect's first guard will catch on the next render.
        } else {
          // Server returned 200 with no src (provider misconfiguration, empty
          // response, etc.). Reset so the next render can retry rather than
          // locking the placeholder forever.
          generatingRef.current = false;
        }
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
        // Reserve space matching the placeholder so the image swap doesn't
        // shift surrounding text. Default to 16/9 — that's what the
        // illustration route generates and the prompt example specifies.
        style={{ aspectRatio: (block.aspectRatio || '16:9').replace(':', '/') }}
      />
      {block.alt && (
        <figcaption className="mt-2 text-center text-sm italic text-neutral-500">
          {block.alt}
        </figcaption>
      )}
    </figure>
  );
}
