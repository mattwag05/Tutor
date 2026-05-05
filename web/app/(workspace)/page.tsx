"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, MessageSquare, GraduationCap, Upload, ArrowRight, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { classifyIntent, buildIntentUrl } from "@/lib/intent/classify";

export default function HomePage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleContinue = () => {
    router.push(buildIntentUrl(classifyIntent({ text: text || undefined })));
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleContinue();
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    if (!file.name.toLowerCase().endsWith(".pdf")) return;
    const result = classifyIntent({ fileName: file.name });
    router.push(buildIntentUrl(result));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 pb-16 pt-12 bg-[var(--background)]">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-[var(--foreground)] tracking-tight">
          What would you like to learn?
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Enter a topic or paste a passage — or drop a PDF below.
        </p>
      </div>

      <div className="w-full max-w-xl space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a topic (e.g. 'photosynthesis') or paste a paragraph…"
          rows={4}
          className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 transition"
        />

        <Button
          variant="default"
          onClick={handleContinue}
          className="w-full gap-2"
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(buildIntentUrl({ target: 'chat', params: text.trim() ? { q: text.trim() } : {} }))}
            className="flex-1 gap-1.5 text-xs text-[var(--muted-foreground)]"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(buildIntentUrl({ target: 'course', params: text.trim() ? { topic: text.trim() } : {} }))}
            className="flex-1 gap-1.5 text-xs text-[var(--muted-foreground)]"
          >
            <GraduationCap className="h-3.5 w-3.5" />
            Course
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/book')}
            className="flex-1 gap-1.5 text-xs text-[var(--muted-foreground)]"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Library
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/notebook')}
            className="flex-1 gap-1.5 text-xs text-[var(--muted-foreground)]"
          >
            <NotebookPen className="h-3.5 w-3.5" />
            Notebook
          </Button>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-5 text-center transition
            ${dragging
              ? "border-[var(--primary)] bg-[var(--primary)]/5"
              : "border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--muted)]/30"
            }`}
        >
          <Upload className="h-5 w-5 text-[var(--muted-foreground)]" />
          <span className="text-sm text-[var(--muted-foreground)]">
            Drop a PDF to study it, or{" "}
            <span className="text-[var(--primary)]">browse</span>
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>
    </div>
  );
}
