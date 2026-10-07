/**
 * TokenHub (OpenAI-compatible) Chat Client
 *
 * Uses the official openai SDK for proper proxy header handling.
 * Routes through Genie's sandbox proxy when no API key is set (zero-config).
 */

import OpenAI from 'openai';

const DEFAULT_MODEL = 'hy3';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

function getConfig() {
  const isSandbox = process.env.X_IDE_AUTH_PROXY !== undefined;
  const apiKey =
    process.env.TOKENHUB_API_KEY || (isSandbox ? 'mock_api_key' : '');
  const useSandbox = isSandbox && apiKey === 'mock_api_key';
  const baseURL = useSandbox
    ? 'http://tokenhub.openai.auth-proxy.local/v1'
    : process.env.TOKENHUB_BASE_URL || 'https://tokenhub.tencentmaas.com/v1';
  return { apiKey, baseURL };
}

let clientInstance: OpenAI | null = null;

function getClient(): OpenAI {
  if (clientInstance) return clientInstance;
  const { apiKey, baseURL } = getConfig();
  if (!apiKey) {
    throw new Error('TokenHub API key is not configured');
  }
  clientInstance = new OpenAI({
    apiKey,
    baseURL,
    timeout: 120_000,
    maxRetries: 1,
  });
  return clientInstance;
}

/**
 * Non-streaming chat completion. Returns the assistant's text content.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: options.model || DEFAULT_MODEL,
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens ?? 4096,
    stream: false,
  });

  return response.choices[0]?.message?.content ?? '';
}
