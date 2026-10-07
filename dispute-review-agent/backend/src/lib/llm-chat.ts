/**
 * Chat client for the dispute-review agents (OpenAI-compatible APIs).
 *
 * Provider order:
 *   1. Google Gemini (free tier) when GEMINI_API_KEY is set — GEMINI_MODEL first,
 *      then each of GEMINI_FALLBACK_MODELS if a call fails (high demand, quota,
 *      retired model, stalled or too slow).
 *   2. Tencent TokenHub (hy3) when TOKENHUB_API_KEY is set, or inside the
 *      Genie sandbox proxy.
 * With neither, calls throw and the agents return their explicit fallback.
 */

import OpenAI from 'openai';
import { env } from '../config/env';
import { createLogger } from '../config/logger';

const logger = createLogger('LLM');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
// Gemini models think before answering and the thinking counts toward the
// output limit, so a small max_tokens can cut the JSON answer short.
const GEMINI_MIN_OUTPUT_TOKENS = 8192;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  max_tokens?: number;
}

interface Provider {
  name: 'gemini' | 'tokenhub';
  client: OpenAI;
  models: string[];
  minOutputTokens: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

function resolveProvider(): Provider | null {
  if (env.GEMINI_API_KEY) {
    return {
      name: 'gemini',
      client: new OpenAI({
        apiKey: env.GEMINI_API_KEY,
        baseURL: GEMINI_BASE_URL,
        timeout: env.LLM_TIMEOUT_MS,
        // One retry for "high demand" 503s and 429s, then the next model is tried
        maxRetries: 1,
      }),
      models: [env.GEMINI_MODEL, ...env.GEMINI_FALLBACK_MODELS.filter((m) => m !== env.GEMINI_MODEL)],
      minOutputTokens: GEMINI_MIN_OUTPUT_TOKENS,
      reasoningEffort: env.GEMINI_REASONING_EFFORT,
    };
  }

  const isSandbox = process.env.X_IDE_AUTH_PROXY !== undefined;
  const apiKey = env.TOKENHUB_API_KEY || (isSandbox ? 'mock_api_key' : '');
  if (!apiKey) return null;
  const useSandbox = isSandbox && apiKey === 'mock_api_key';
  return {
    name: 'tokenhub',
    client: new OpenAI({
      apiKey,
      baseURL: useSandbox ? 'http://tokenhub.openai.auth-proxy.local/v1' : env.TOKENHUB_BASE_URL,
      timeout: env.LLM_TIMEOUT_MS,
      maxRetries: 1,
    }),
    models: [env.TOKENHUB_MODEL],
    minOutputTokens: 0,
  };
}

let provider: Provider | null | undefined;

// A model that answered 429 (free-tier daily or per-minute quota) is skipped for a while
// so every later call does not spend a request finding out again.
const QUOTA_COOLDOWN_MS = 10 * 60_000;
const coolingUntil = new Map<string, number>();

function getProvider(): Provider {
  if (provider === undefined) provider = resolveProvider();
  if (!provider) {
    throw new Error('No LLM API key configured (set GEMINI_API_KEY or TOKENHUB_API_KEY)');
  }
  return provider;
}

/** Which provider and models the agents will use; for health checks and logs. */
export function llmInfo(): { provider: string; models: string[] } | null {
  try {
    const p = getProvider();
    return { provider: p.name, models: p.models };
  } catch {
    return null;
  }
}

/**
 * One streamed completion. Free-tier models can be slow but steady, so instead of
 * a single deadline the call is abandoned when no output arrives for
 * LLM_IDLE_TIMEOUT_MS, or when it runs longer than LLM_TIMEOUT_MS in total.
 */
async function streamCompletion(
  p: Provider,
  model: string,
  messages: ChatMessage[],
  options: ChatOptions
): Promise<string> {
  const controller = new AbortController();
  const total = setTimeout(() => controller.abort(new Error('total time limit reached')), env.LLM_TIMEOUT_MS);
  let idle: NodeJS.Timeout | undefined;
  const resetIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(() => controller.abort(new Error('no output, model stalled')), env.LLM_IDLE_TIMEOUT_MS);
  };

  try {
    resetIdle();
    const stream = await p.client.chat.completions.create(
      {
        model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: options.temperature ?? 0.2,
        max_tokens: Math.max(options.max_tokens ?? 4096, p.minOutputTokens),
        ...(p.reasoningEffort ? { reasoning_effort: p.reasoningEffort } : {}),
        stream: true,
      },
      { signal: controller.signal }
    );

    let content = '';
    let finishReason: string | null = null;
    for await (const chunk of stream) {
      resetIdle();
      const choice = chunk.choices[0];
      content += choice?.delta?.content ?? '';
      finishReason = choice?.finish_reason ?? finishReason;
    }
    if (finishReason === 'length') throw new Error(`${model} hit the output token limit before finishing`);
    if (!content) throw new Error(`${model} returned an empty response`);
    return content;
  } catch (err) {
    // Report why we aborted rather than the SDK's generic "Request was aborted"
    if (controller.signal.aborted) throw new Error(`${model}: ${String(controller.signal.reason?.message)}`);
    throw err;
  } finally {
    clearTimeout(total);
    clearTimeout(idle);
  }
}

/**
 * Chat completion. Returns the assistant's text content.
 * Tries each configured model in turn; throws the last error if all fail.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const p = getProvider();
  let lastError: unknown;

  const now = Date.now();
  const available = p.models.filter((m) => (coolingUntil.get(m) ?? 0) <= now);
  // If every model is cooling down, try them all anyway rather than fail outright
  for (const model of available.length ? available : p.models) {
    try {
      return await streamCompletion(p, model, messages, options);
    } catch (err) {
      lastError = err;
      if (err instanceof OpenAI.APIError && err.status === 429) {
        coolingUntil.set(model, Date.now() + QUOTA_COOLDOWN_MS);
      }
      logger.warn(
        { provider: p.name, model, err: err instanceof Error ? err.message : String(err) },
        'LLM call failed; trying the next model if any'
      );
    }
  }
  throw lastError;
}
