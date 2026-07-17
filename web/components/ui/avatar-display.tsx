'use client';

import Image from 'next/image';

import { cn } from '@/lib/utils';

interface AvatarDisplayProps {
  readonly src: string;
  readonly alt?: string;
  readonly className?: string;
}

export function AvatarDisplay({ src, alt, className }: AvatarDisplayProps) {
  const isUrl = src.startsWith('http') || src.startsWith('data:') || src.startsWith('/');

  if (isUrl) {
    return (
      <span className={cn('relative block h-full w-full overflow-hidden', className)}>
        <Image
          src={src}
          alt={alt || ''}
          fill
          sizes="100vw"
          unoptimized
          className="object-cover"
        />
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={alt || ''}
      className={cn('flex items-center justify-center w-full h-full select-none', className)}
    >
      {src}
    </span>
  );
}
