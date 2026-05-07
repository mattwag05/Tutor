"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  getTodaysReview,
  recordVariantAttempt,
  type SpacedReviewResponse,
  type VariantQuestion,
} from "@/lib/spaced-review-api";

const MarkdownRenderer = dynamic(
  () => import("@/components/common/MarkdownRenderer"),
  { ssr: false },
);

const POLL_MS = 2000;
const POLL_MAX_ATTEMPTS = 30; // ~60s ceiling

type AttemptState = {
  selected?: string;
  text?: string;
  submitted?: boolean;
  isCorrect?: boolean;
};

function collapsedKey(date: string): string {
  return `spaced-review-collapsed:${date}`;
}

function isAnswerCorrect(question: VariantQuestion, answer: string): boolean {
  if (!answer.trim()) return false;
  const expected = question.correct_answer.trim();
  if (!expected) return false;
  if (question.question_type === "choice") {
    return answer.trim().toUpperCase() === expected.toUpperCase();
  }
  return answer.trim().toLowerCase() === expected.toLowerCase();
}

export default function TodaysReviewPanel() {
  const { t } = useTranslation();
  const [response, setResponse] = useState<SpacedReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [attempts, setAttempts] = useState<Record<string, AttemptState>>({});

  useEffect(() => {
    let cancelled = false;
    let pollCount = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const next = await getTodaysReview();
        if (cancelled) return;
        setResponse(next);
        if (next.status === "generating" && pollCount < POLL_MAX_ATTEMPTS) {
          pollCount += 1;
          timer = setTimeout(() => void tick(), POLL_MS);
        } else {
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!response?.date) return;
    try {
      const stored = window.localStorage.getItem(collapsedKey(response.date));
      if (stored === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, [response?.date]);

  const persistCollapsed = useCallback(
    (next: boolean) => {
      setCollapsed(next);
      if (!response?.date) return;
      try {
        window.localStorage.setItem(
          collapsedKey(response.date),
          next ? "1" : "0",
        );
      } catch {
        /* ignore */
      }
    },
    [response?.date],
  );

  const handleSubmit = useCallback(
    async (question: VariantQuestion) => {
      const state = attempts[question.question_id] ?? {};
      const answer =
        question.question_type === "choice"
          ? (state.selected ?? "")
          : (state.text ?? "");
      if (!answer.trim()) return;

      const correct = isAnswerCorrect(question, answer);
      setAttempts((prev) => ({
        ...prev,
        [question.question_id]: {
          ...state,
          submitted: true,
          isCorrect: correct,
        },
      }));

      if (question.source_id) {
        try {
          await recordVariantAttempt({
            source_id: question.source_id,
            question_id: question.question_id,
            user_answer: answer,
            is_correct: correct,
          });
        } catch {
          /* swallow — UI already shows correctness; persist is best-effort */
        }
      }
    },
    [attempts],
  );

  const items = useMemo(() => response?.items ?? [], [response]);

  if (!loading && (!response || response.status === "empty")) {
    return null;
  }

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <button
        onClick={() => persistCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]/40"
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
          {t("Today's Review")}
          {response?.status === "ready" && items.length > 0 && (
            <span className="rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
              {items.length}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-[var(--muted-foreground)] transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
        />
      </button>

      {!collapsed && (
        <div className="border-t border-[var(--border)] px-4 py-3">
          {response?.status === "generating" ? (
            <div className="flex items-center gap-2 py-3 text-[13px] text-[var(--muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("Generating today's review…")}
            </div>
          ) : (
            <>
              <p className="mb-3 text-[12px] text-[var(--muted-foreground)]">
                {t("Generated from your past mistakes")}
              </p>
              <ul className="flex flex-col gap-3">
                {items.map((q) => {
                  const state = attempts[q.question_id] ?? {};
                  const submitted = state.submitted === true;
                  const correct = state.isCorrect === true;
                  const hasAnswer =
                    q.question_type === "choice"
                      ? Boolean(state.selected)
                      : Boolean((state.text ?? "").trim());

                  return (
                    <li
                      key={q.question_id}
                      className="rounded-xl border border-[var(--border)]/60 bg-[var(--background)] px-4 py-3"
                    >
                      <div className="prose prose-sm max-w-none text-[var(--foreground)] dark:prose-invert">
                        <MarkdownRenderer content={q.question} />
                      </div>

                      {q.question_type === "choice" &&
                      q.options &&
                      Object.keys(q.options).length > 0 ? (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {Object.entries(q.options).map(([key, value]) => {
                            const isSelected = state.selected === key;
                            return (
                              <label
                                key={key}
                                className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors ${
                                  isSelected
                                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
                                    : "border-[var(--border)] hover:bg-[var(--muted)]/40"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`sr-${q.question_id}`}
                                  value={key}
                                  checked={isSelected}
                                  disabled={submitted}
                                  onChange={() =>
                                    setAttempts((prev) => ({
                                      ...prev,
                                      [q.question_id]: {
                                        ...prev[q.question_id],
                                        selected: key,
                                      },
                                    }))
                                  }
                                  className="mt-0.5"
                                />
                                <span>
                                  <strong>{key}.</strong> {value}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <textarea
                          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[16px] text-[var(--foreground)] outline-none focus:border-[var(--primary)] sm:text-[13px]"
                          rows={3}
                          value={state.text ?? ""}
                          disabled={submitted}
                          onChange={(e) =>
                            setAttempts((prev) => ({
                              ...prev,
                              [q.question_id]: {
                                ...prev[q.question_id],
                                text: e.target.value,
                              },
                            }))
                          }
                          placeholder={t("Type your answer…")}
                        />
                      )}

                      {submitted ? (
                        <div className="mt-3 rounded-lg bg-[var(--muted)]/40 px-3 py-2 text-[12px]">
                          <p
                            className={`mb-1 font-medium ${correct ? "text-emerald-600" : "text-red-500"}`}
                          >
                            {correct ? t("Correct") : t("Incorrect")}
                          </p>
                          {q.correct_answer && (
                            <p className="text-[var(--muted-foreground)]">
                              <span className="font-medium text-[var(--foreground)]">
                                {t("Reference Answer")}:
                              </span>{" "}
                              {q.correct_answer}
                            </p>
                          )}
                          {q.explanation && (
                            <p className="mt-1 text-[var(--muted-foreground)]">
                              {q.explanation}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={() => void handleSubmit(q)}
                            disabled={!hasAnswer}
                            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
                          >
                            {t("Submit answer")}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
