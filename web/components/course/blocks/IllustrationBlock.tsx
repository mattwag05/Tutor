import type { IllustrationBlock } from '@/lib/types/course';

interface Props {
  block: IllustrationBlock;
}

export function IllustrationBlockView({ block }: Props) {
  if (!block.src || block.pending) {
    return (
      <div className="my-8 aspect-[16/9] w-full overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900">
        <div className="flex h-full items-center justify-center text-sm text-neutral-500">
          Generating illustration…
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
