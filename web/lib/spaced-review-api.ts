import { apiUrl } from "@/lib/api";

export type SpacedReviewStatus = "generating" | "ready" | "empty";

export interface VariantQuestion {
  question_id: string;
  source_question_id: string;
  source_id: string;
  question: string;
  question_type: string;
  options: Record<string, string>;
  correct_answer: string;
  explanation: string;
  difficulty: string;
}

export async function recordVariantAttempt(payload: {
  source_id: string;
  question_id: string;
  user_answer: string;
  is_correct: boolean;
}): Promise<void> {
  await fetch(apiUrl("/api/v1/quiz/attempts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "book",
      source_id: payload.source_id,
      question_id: payload.question_id,
      user_answer: payload.user_answer,
      is_correct: payload.is_correct,
      earned: payload.is_correct ? 1.0 : 0.0,
      ts_ms: Date.now(),
    }),
  });
}

export interface SpacedReviewResponse {
  date: string;
  status: SpacedReviewStatus;
  items: VariantQuestion[];
}

export async function getTodaysReview(): Promise<SpacedReviewResponse> {
  const response = await fetch(apiUrl("/api/v1/spaced-review/today"), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as SpacedReviewResponse;
}
