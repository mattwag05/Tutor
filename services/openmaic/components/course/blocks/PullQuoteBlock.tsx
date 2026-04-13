import type { PullQuoteBlock, CourseCitation } from '@/lib/types/course';
import { CitationPill } from './CitationPill';

interface Props {
  block: PullQuoteBlock;
  citations: Record<string, CourseCitation>;
}

export function PullQuoteBlockView({ block, citations }: Props) {
  const citation = block.citationId ? citations[block.citationId] : undefined;
  return (
    <figure className="my-10 border-y border-neutral-200 py-8 text-center dark:border-neutral-800">
      <blockquote className="mx-auto max-w-xl font-serif text-xl italic leading-relaxed text-neutral-800 dark:text-neutral-100">
        &ldquo;{block.text}&rdquo;
      </blockquote>
      {(block.attribution || block.source || citation) && (
        <figcaption className="mt-4 flex flex-col items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
          {block.attribution && <span>— {block.attribution}</span>}
          {citation ? (
            <CitationPill citation={citation} variant="source" />
          ) : (
            block.source && (
              <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {block.source}
              </span>
            )
          )}
        </figcaption>
      )}
    </figure>
  );
}
