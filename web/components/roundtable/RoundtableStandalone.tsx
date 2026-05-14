'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAgentRegistry, agentsToParticipants } from '@/lib/orchestration/registry/store';
import { useSettingsStore } from '@/lib/store/settings';
import { ChatArea, type ChatAreaRef } from '@/components/chat/chat-area';
import { AvatarDisplay } from '@/components/ui/avatar-display';
import { Loader2, ArrowLeft } from 'lucide-react';

interface Props {
  sessionId: string;
  topic: string;
  prompt?: string;
  ragContext?: string;
}

export function RoundtableStandalone({ sessionId, topic, prompt, ragContext }: Props) {
  const router = useRouter();
  const chatRef = useRef<ChatAreaRef>(null);
  const registry = useAgentRegistry();
  const selectedAgentIds = useSettingsStore((s) => s.selectedAgentIds);
  const [started, setStarted] = useState(false);
  const [thinking, setThinking] = useState<{ stage: string; agentId?: string } | null>(null);
  const [currentSpeech, setCurrentSpeech] = useState<string | null>(null);

  const participants = selectedAgentIds
    ? agentsToParticipants(registry, selectedAgentIds)
    : [];

  const handleStart = useCallback(async () => {
    if (started || !chatRef.current) return;
    setStarted(true);
    await chatRef.current.startDiscussion({ topic, prompt, agentId: participants[0]?.id, ragContext });
  }, [started, topic, prompt, ragContext, participants]);

  useEffect(() => {
    const timer = setTimeout(handleStart, 500);
    return () => clearTimeout(timer);
  }, [handleStart]);

  return (
    <div className="flex h-dvh flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1 className="truncate font-serif text-lg font-medium text-neutral-900 dark:text-neutral-50">
            {topic}
          </h1>
          {thinking && (
            <span className="shrink-0 animate-pulse text-xs text-amber-600 dark:text-amber-400">
              {thinking.stage === 'director' ? 'Director thinking…' : 'Agent thinking…'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {participants.map((p) => (
            <div key={p.id} className="relative">
              <AvatarDisplay
                src={p.avatar}
                name={p.name}
                className="h-8 w-8 rounded-full ring-2 ring-white dark:ring-neutral-800"
                fallbackClassName="text-[10px]"
              />
              {p.isSpeaking && (
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500 dark:border-neutral-800" />
              )}
            </div>
          ))}
          {!started && (
            <button
              type="button"
              onClick={handleStart}
              disabled={started}
              className="ml-2 flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              {started ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                'Start discussion'
              )}
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col">
          <ChatArea
            ref={chatRef}
            className="flex-1"
            collapsed={false}
            onLiveSpeech={(text, _agentId) => setCurrentSpeech(text)}
            onThinking={(state) => setThinking(state)}
          />
        </div>
      </div>
    </div>
  );
}
