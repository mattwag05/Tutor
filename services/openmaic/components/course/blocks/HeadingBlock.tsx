import type { HeadingBlock } from '@/lib/types/course';

interface Props {
  block: HeadingBlock;
}

export function HeadingBlockView({ block }: Props) {
  if (block.level === 2) {
    return (
      <h2 className="mt-10 font-serif text-3xl font-normal text-neutral-900 dark:text-neutral-50">
        {block.text}
      </h2>
    );
  }
  if (block.level === 3) {
    return (
      <h3 className="mt-8 font-serif text-2xl font-normal text-neutral-900 dark:text-neutral-50">
        {block.text}
      </h3>
    );
  }
  return (
    <h4 className="mt-6 font-sans text-lg font-semibold text-neutral-800 dark:text-neutral-100">
      {block.text}
    </h4>
  );
}
