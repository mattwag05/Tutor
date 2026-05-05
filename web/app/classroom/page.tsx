'use client';

import { useRouter } from 'next/navigation';
import { Presentation } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ClassroomLandingPage() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 bg-[var(--background)]">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--secondary)]">
        <Presentation className="h-8 w-8 text-[var(--muted-foreground)]" />
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Classroom</h1>
        <p className="max-w-sm text-sm text-[var(--muted-foreground)]">
          Generate a new classroom from a topic or PDF on the home page, or open an existing course as a classroom.
        </p>
      </div>
      <Button onClick={() => router.push('/')}>Go to Home</Button>
    </main>
  );
}
