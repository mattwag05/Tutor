'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';

interface Props {
  sourceType: 'course' | 'kb' | 'classroom';
  sourceId: string;
  topic: string;
  className?: string;
}

export function DiscussButton({ sourceType, sourceId, topic, className = '' }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/roundtable/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, sourceType, sourceId }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { url: string };
      router.push(data.url);
    } finally {
      setLoading(false);
    }
  }, [loading, topic, sourceType, sourceId, router]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={className}
    >
      <MessageSquare size={14} strokeWidth={1.8} />
      {loading ? 'Starting…' : 'Discuss'}
    </button>
  );
}
