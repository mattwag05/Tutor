/**
 * SSE events:
 *   { type: 'section', data: CourseSection, index: number }
 *   { type: 'retry',   attempt: number, maxAttempts: number }
 *   { type: 'done',    sections: CourseSection[], title: string }
 *   { type: 'error',   error: string }
 */

import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { streamLLM } from '@/lib/ai/llm';
import { buildPrompt, PROMPT_IDS } from '@/lib/generation/prompts';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { getRAGContextForGeneration, isDeepTutorEnabled } from '@/lib/integrations';
import { createLogger } from '@/lib/logger';
import { SSE_HEARTBEAT_INTERVAL_MS, MAX_STREAM_RETRIES } from '@/lib/constants/generation';
import { formatStudentProfile } from '@/lib/generation/format-student-profile';
import type { CourseSection, Language } from '@/lib/types/course';

const log = createLogger('CourseOutlineStream');

export const maxDuration = 300;

interface OutlineShape {
  courseTitle: string;
  sections: Array<{
    id?: string;
    order?: number;
    title: string;
    description?: string;
    goDeeperPrompts?: string[];
  }>;
}

// Incremental JSON-object parser over a partially-streamed outline object.
// The LLM emits `{ "courseTitle": ..., "sections": [ {...}, ... ] }`; we
// find the `sections` array and return each complete object past
// `alreadyParsed`. Same brace-depth/string-aware scanner as
// scene-outlines-stream's extractNewOutlines — a shared helper would be a
// nice extraction if a third caller lands.
function extractNewSections(buffer: string, alreadyParsed: number): CourseSection[] {
  const results: CourseSection[] = [];
  const stripped = buffer.replace(/^[\s\S]*?(?=\{)/, '');

  // Find "sections": [ ...
  const sectionsIdx = stripped.indexOf('"sections"');
  if (sectionsIdx === -1) return results;
  const arrayStart = stripped.indexOf('[', sectionsIdx);
  if (arrayStart === -1) return results;

  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;
  let objectCount = 0;

  for (let i = arrayStart + 1; i < stripped.length; i++) {
    const char = stripped[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && objectStart >= 0) {
        objectCount++;
        if (objectCount > alreadyParsed) {
          try {
            const raw = stripped.substring(objectStart, i + 1);
            const obj = JSON.parse(raw) as OutlineShape['sections'][number];
            results.push(normalizeSection(obj, objectCount));
          } catch {
            // Incomplete or malformed object — skip, try next
          }
        }
        objectStart = -1;
      }
    }
  }

  return results;
}

function normalizeSection(
  raw: OutlineShape['sections'][number],
  orderFallback: number,
): CourseSection {
  return {
    id: raw.id || `sec_${orderFallback}`,
    order: raw.order ?? orderFallback,
    title: raw.title || `Section ${orderFallback}`,
    description: raw.description,
    blocks: [],
    goDeeperPrompts: Array.isArray(raw.goDeeperPrompts) ? raw.goDeeperPrompts : [],
    status: 'pending',
  };
}

function extractCourseTitle(buffer: string): string | undefined {
  const match = buffer.match(/"courseTitle"\s*:\s*"([^"]+)"/);
  return match?.[1];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      topic?: string;
      language?: Language;
      knowledgeBase?: string;
      userNickname?: string;
      userBio?: string;
    };

    if (!body.topic || typeof body.topic !== 'string' || body.topic.trim().length === 0) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'topic is required');
    }

    const { model: languageModel, modelInfo, modelString } = await resolveModelFromHeaders(req);
    const language: Language = body.language || 'en-US';
    const topic = body.topic.trim();

    // Optional RAG enrichment from a DeepTutor knowledge base
    let researchContext = language === 'zh-CN' ? '无' : 'None';
    if (body.knowledgeBase && isDeepTutorEnabled()) {
      try {
        const ragContext = await getRAGContextForGeneration(body.knowledgeBase, topic);
        if (ragContext) {
          researchContext = ragContext;
          log.info(`Enriched course outline with RAG from KB "${body.knowledgeBase}"`);
        }
      } catch (error) {
        log.warn(`DeepTutor RAG enrichment failed, proceeding without: ${error}`);
      }
    }

    const userProfile = formatStudentProfile(body, 'inline');

    const prompts = buildPrompt(PROMPT_IDS.COURSE_OUTLINE, {
      topic,
      language,
      researchContext,
      userProfile,
    });

    if (!prompts) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Course outline prompt template not found');
    }

    log.info(`Generating course outline: "${topic.substring(0, 60)}" [model=${modelString}]`);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
        const startHeartbeat = () => {
          stopHeartbeat();
          heartbeatTimer = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`:heartbeat\n\n`));
            } catch {
              stopHeartbeat();
            }
          }, SSE_HEARTBEAT_INTERVAL_MS);
        };
        const stopHeartbeat = () => {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
        };

        try {
          startHeartbeat();

          let parsedSections: CourseSection[] = [];
          let courseTitle = topic;
          let lastError: string | undefined;

          for (let attempt = 1; attempt <= MAX_STREAM_RETRIES + 1; attempt++) {
            try {
              const result = streamLLM(
                {
                  model: languageModel,
                  system: prompts.system,
                  prompt: prompts.user,
                  maxOutputTokens: modelInfo?.outputWindow,
                },
                'course-outline-stream',
              );

              let fullText = '';
              parsedSections = [];

              for await (const chunk of result.textStream) {
                fullText += chunk;

                const detected = extractCourseTitle(fullText);
                if (detected) courseTitle = detected;

                const newSections = extractNewSections(fullText, parsedSections.length);
                for (const section of newSections) {
                  const enriched = {
                    ...section,
                    id: section.id || nanoid(),
                    order: parsedSections.length + 1,
                  };
                  parsedSections.push(enriched);
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: 'section',
                        data: enriched,
                        index: parsedSections.length - 1,
                      })}\n\n`,
                    ),
                  );
                }
              }

              // One final sweep in case the last section didn't get parsed mid-stream
              const tailSections = extractNewSections(fullText, parsedSections.length);
              for (const section of tailSections) {
                const enriched = {
                  ...section,
                  id: section.id || nanoid(),
                  order: parsedSections.length + 1,
                };
                parsedSections.push(enriched);
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'section',
                      data: enriched,
                      index: parsedSections.length - 1,
                    })}\n\n`,
                  ),
                );
              }

              if (parsedSections.length > 0) break;

              lastError = fullText.trim()
                ? 'LLM response could not be parsed into course sections'
                : 'LLM returned empty response';

              if (attempt <= MAX_STREAM_RETRIES) {
                log.warn(`Empty sections (attempt ${attempt}), retrying...`);
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'retry',
                      attempt,
                      maxAttempts: MAX_STREAM_RETRIES + 1,
                    })}\n\n`,
                  ),
                );
              }
            } catch (error) {
              lastError = error instanceof Error ? error.message : String(error);
              if (attempt <= MAX_STREAM_RETRIES) {
                log.warn(`Stream error (attempt ${attempt}), retrying...`, error);
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'retry',
                      attempt,
                      maxAttempts: MAX_STREAM_RETRIES + 1,
                    })}\n\n`,
                  ),
                );
                continue;
              }
            }
          }

          if (parsedSections.length > 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'done',
                  sections: parsedSections,
                  title: courseTitle,
                })}\n\n`,
              ),
            );
          } else {
            log.error(`Course outline failed after retries: ${lastError}`);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'error',
                  error: lastError || 'Failed to generate course outline',
                })}\n\n`,
              ),
            );
          }
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: error instanceof Error ? error.message : String(error),
              })}\n\n`,
            ),
          );
        } finally {
          stopHeartbeat();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
