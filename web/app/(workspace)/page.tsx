"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, MessageSquare, GraduationCap, Upload } from "lucide-react";
import Button from "@/components/ui/Button";

export default function HomePage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const goChat = () => {
    if (!text.trim()) {
      router.push("/chat");
      return;
    }
    router.push(`/chat?q=${encodeURIComponent(text.trim())}`);
  };

  const goCourse = () => {
    const topic = text.trim();
    router.push(topic ? `/course?topic=${encodeURIComponent(topic)}` : "/course");
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      goChat();
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    if (!file.name.toLowerCase().endsWith(".pdf")) return;
    router.push(`/book?upload=1&name=${encodeURIComponent(file.name)}`);
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

        <div className="flex gap-2">
          <Button
            variant="primary"
            size="md"
            icon={<MessageSquare className="h-4 w-4" />}
            onClick={goChat}
            className="flex-1"
          >
            Chat
          </Button>
          <Button
            variant="secondary"
            size="md"
            icon={<GraduationCap className="h-4 w-4" />}
            onClick={goCourse}
            className="flex-1"
          >
            Course
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

      <div className="flex gap-4 text-xs text-[var(--muted-foreground)]">
        <button onClick={() => router.push("/book")} className="flex items-center gap-1.5 hover:text-[var(--foreground)] transition">
          <BookOpen className="h-3.5 w-3.5" />
          Library
        </button>
        <span className="opacity-30">·</span>
        <button onClick={() => router.push("/knowledge")} className="hover:text-[var(--foreground)] transition">
          Knowledge Base
        </button>
      </div>
    </div>
  );
}
