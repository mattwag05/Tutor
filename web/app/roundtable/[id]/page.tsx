import { notFound } from 'next/navigation';
import { readRoundtableSession } from '@/lib/server/roundtable-storage';
import { RoundtableStandalone } from '@/components/roundtable/RoundtableStandalone';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RoundtablePage({ params }: Props) {
  const { id } = await params;
  const session = await readRoundtableSession(id);
  if (!session) notFound();

  return (
    <RoundtableStandalone
      sessionId={session.id}
      topic={session.topic}
      prompt={session.prompt}
    />
  );
}
