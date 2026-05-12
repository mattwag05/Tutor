"use client";

import { useEffect, useMemo, useState } from "react";
import {
  History as HistoryIcon,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import PickerModalShell from "@/components/common/PickerModalShell";
import PickerListItem from "@/components/common/PickerListItem";
import SearchInput from "@/components/common/SearchInput";
import { listSessions, type SessionSummary } from "@/lib/session-api";
import { normalizeMessageContent, truncateText } from "@/lib/message-content";

export interface SelectedHistorySession {
  sessionId: string;
  title: string;
}

interface HistorySessionPickerProps {
  open: boolean;
  onClose: () => void;
  onApply: (sessions: SelectedHistorySession[]) => void;
}

function formatSessionTimestamp(value?: number): string {
  if (!value || value <= 0) return "";
  return new Date(value * 1000).toLocaleString();
}

export default function HistorySessionPicker({
  open,
  onClose,
  onApply,
}: HistorySessionPickerProps) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await listSessions(200, 0, { force: true });
        if (!mounted) return;
        setSessions(data);
      } catch {
        if (!mounted) return;
        setSessions([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [open]);

  const filteredSessions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return sessions;
    return sessions.filter((session) => {
      const title = String(session.title || "").toLowerCase();
      const lastMessage = normalizeMessageContent(
        session.last_message,
      ).toLowerCase();
      return title.includes(keyword) || lastMessage.includes(keyword);
    });
  }, [query, sessions]);

  const toggleSession = (session: SessionSummary) => {
    const id = session.session_id || session.id;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleApply = () => {
    const selected = sessions
      .filter((session) =>
        selectedIds.includes(session.session_id || session.id),
      )
      .map((session) => ({
        sessionId: session.session_id || session.id,
        title: session.title || "Untitled session",
      }));
    onApply(selected);
    onClose();
  };

  const footer = (
    <>
      <div className="text-[12px] text-[var(--muted-foreground)]">
        {selectedIds.length === 1
          ? t("1 session selected")
          : t("{{n}} sessions selected", { n: selectedIds.length })}
      </div>
      <button
        onClick={handleApply}
        disabled={!selectedIds.length}
        className="btn-primary rounded-xl bg-[var(--primary)] px-4 py-2.5 text-[13px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("Use Selected Sessions ({{n}})", { n: selectedIds.length })}
      </button>
    </>
  );

  return (
    <PickerModalShell
      open={open}
      onClose={onClose}
      title={t("Select History Sessions")}
      subtitle={t("Choose one or more past conversations to analyze before this turn.")}
      label={t("Chat History Reference")}
      icon={<HistoryIcon className="h-3 w-3" />}
      width="4xl"
      footer={footer}
    >
      <div className="bg-[var(--background)]/40 p-5">
        <div className="mb-4 flex items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t("Search sessions by title or last message")}
          />
          <button
            onClick={() => setSelectedIds([])}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[12px] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            {t("Clear")}
          </button>
        </div>

        <div className="max-h-[56vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          {loading ? (
            <div className="flex min-h-[280px] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : filteredSessions.length ? (
            <div className="divide-y divide-[var(--border)]">
              {filteredSessions.map((session) => {
                const id = session.session_id || session.id;
                const selected = selectedIds.includes(id);
                const timestamp = formatSessionTimestamp(
                  session.updated_at || session.created_at,
                );
                return (
                  <PickerListItem
                    key={id}
                    selected={selected}
                    onClick={() => toggleSession(session)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-[var(--muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">
                        <MessageSquare size={11} />
                        {t("History")}
                      </span>
                      <span className="truncate text-[14px] font-medium text-[var(--foreground)]">
                        {session.title || t("Untitled session")}
                      </span>
                    </div>
                    {session.last_message ? (
                      <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--muted-foreground)]">
                        {truncateText(
                          normalizeMessageContent(session.last_message),
                          200,
                        )}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--muted-foreground)]/85">
                      <span>
                        {session.message_count ?? 0} {t("messages")}
                      </span>
                      {timestamp && <span>{timestamp}</span>}
                    </div>
                  </PickerListItem>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-14 text-center text-[13px] text-[var(--muted-foreground)]">
              {t("No matching sessions found.")}
            </div>
          )}
        </div>
      </div>
    </PickerModalShell>
  );
}
