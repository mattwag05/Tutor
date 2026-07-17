/**
 * ComfyUI Image Generation Adapter
 *
 * Talks to a local ComfyUI HTTP server. The flow:
 *   1. POST /prompt   — submit a workflow JSON, returns prompt_id
 *   2. GET /history/{id} (poll) — wait for outputs to populate
 *   3. GET /view?filename=...&type=output — fetch the image bytes
 *
 * Workflow template is a minimal text-to-image graph using
 * CheckpointLoaderSimple + KSampler. The model field selects the checkpoint;
 * the user is expected to refresh the model list (see /api/v1/settings/image/refresh-models)
 * after adding new models on the ComfyUI side.
 *
 * Reachability: the ComfyUI base URL is configurable; it defaults to a
 * local server at http://127.0.0.1:8000.
 */

import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';
import { normalizeBaseUrl } from '@/lib/ai/openrouter';

const DEFAULT_MODEL = 'flux1-dev.safetensors';
const DEFAULT_BASE = 'http://127.0.0.1:8000';
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 180_000;
const PROBE_TIMEOUT_MS = 10_000;

function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function buildWorkflow(model: string, options: ImageGenerationOptions): Record<string, unknown> {
  const width = options.width || 1024;
  const height = options.height || 1024;
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const prompt = options.prompt + (options.style ? `, ${options.style}` : '');
  const negative = options.negativePrompt || '';

  return {
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: 20,
        cfg: 7,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model } },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width, height, batch_size: 1 },
    },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: ['4', 1] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'tutor', images: ['8', 0] },
    },
  };
}

export async function testComfyUIConnectivity(
  config: ImageGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const base = normalizeBaseUrl(config.baseUrl, DEFAULT_BASE);
  try {
    const response = await fetchWithTimeout(`${base}/system_stats`, PROBE_TIMEOUT_MS);
    if (response.ok) {
      return { success: true, message: `Connected to ComfyUI at ${base}` };
    }
    return {
      success: false,
      message: `ComfyUI returned ${response.status} from ${base}/system_stats`,
    };
  } catch (err) {
    return {
      success: false,
      message: `ComfyUI connectivity error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

interface ComfyHistoryEntry {
  outputs?: Record<string, { images?: Array<{ filename: string; type?: string; subfolder?: string }> }>;
}

export async function generateWithComfyUI(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const base = normalizeBaseUrl(config.baseUrl, DEFAULT_BASE);
  const model = config.model || DEFAULT_MODEL;
  const workflow = buildWorkflow(model, options);

  const submit = await fetchWithTimeout(`${base}/prompt`, PROBE_TIMEOUT_MS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: `tutor-${Date.now()}` }),
  });
  if (!submit.ok) {
    const text = await submit.text().catch(() => submit.statusText);
    throw new Error(`ComfyUI /prompt failed (${submit.status}): ${text}`);
  }
  const { prompt_id: promptId } = (await submit.json()) as { prompt_id?: string };
  if (!promptId) throw new Error('ComfyUI /prompt returned no prompt_id');

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let firstPoll = true;
  while (Date.now() < deadline) {
    if (!firstPoll) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    firstPoll = false;
    const histResp = await fetchWithTimeout(
      `${base}/history/${promptId}`,
      PROBE_TIMEOUT_MS,
    ).catch(() => null);
    if (!histResp?.ok) continue;
    const hist = (await histResp.json()) as Record<string, ComfyHistoryEntry>;
    const entry = hist[promptId];
    const outputs = entry?.outputs;
    if (!outputs) continue;
    // Empty outputs object means the run finished but produced no image — fail
    // fast rather than poll until POLL_TIMEOUT_MS with a cryptic timeout error.
    if (Object.keys(outputs).length === 0) {
      throw new Error(`ComfyUI prompt ${promptId} completed with no output nodes`);
    }
    for (const node of Object.values(outputs)) {
      const img = node.images?.[0];
      if (!img) continue;
      const params = new URLSearchParams({
        filename: img.filename,
        type: img.type || 'output',
        subfolder: img.subfolder || '',
      });
      const viewResp = await fetchWithTimeout(`${base}/view?${params}`, PROBE_TIMEOUT_MS);
      if (!viewResp.ok) {
        throw new Error(`ComfyUI /view failed (${viewResp.status}) for ${img.filename}`);
      }
      const buf = await viewResp.arrayBuffer();
      const b64 = Buffer.from(buf).toString('base64');
      return {
        base64: b64,
        width: options.width || 1024,
        height: options.height || 1024,
      };
    }
  }
  throw new Error(`ComfyUI generation timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

export async function fetchComfyUIModels(baseUrl?: string): Promise<string[]> {
  const base = normalizeBaseUrl(baseUrl, DEFAULT_BASE);
  const response = await fetchWithTimeout(
    `${base}/object_info/CheckpointLoaderSimple`,
    PROBE_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new Error(`ComfyUI /object_info returned ${response.status}`);
  }
  const data = (await response.json()) as Record<
    string,
    { input?: { required?: { ckpt_name?: [unknown[]] } } }
  >;
  const node = data['CheckpointLoaderSimple'];
  const list = node?.input?.required?.ckpt_name?.[0];
  if (!Array.isArray(list)) return [];
  return list.filter((m): m is string => typeof m === 'string');
}
