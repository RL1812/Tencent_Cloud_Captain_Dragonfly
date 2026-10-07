/**
 * Ollama client — local, open-source embedding and chat models.
 *
 * Defaults: bge-m3 (MIT) for embeddings, qwen2.5 (Apache-2.0) for answers.
 * No API key, nothing leaves the machine.
 */

import { env } from '../config/env'

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  /** Base64-encoded images, for vision models */
  images?: string[]
}

const EMBED_BATCH_SIZE = 16

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${env.OLLAMA_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Cannot reach Ollama at ${env.OLLAMA_BASE_URL} (${reason}). Is "ollama serve" running?`)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // Ollama answers 404 with "model ... not found" when the model was never pulled
    throw new Error(`Ollama ${path} failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

/**
 * Embed texts with EMBED_MODEL, batching to keep requests small.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE)
    const { embeddings } = await post<{ embeddings: number[][] }>(
      '/api/embed',
      { model: env.EMBED_MODEL, input: batch, truncate: true },
      300_000
    )
    for (const vec of embeddings) {
      if (vec.length !== env.EMBED_DIM) {
        throw new Error(
          `${env.EMBED_MODEL} returned ${vec.length}-dim vectors but EMBED_DIM=${env.EMBED_DIM}`
        )
      }
      out.push(vec)
    }
  }
  return out
}

export async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text])
  return vec
}

/**
 * Non-streaming chat completion. Returns the assistant's text.
 */
export async function chat(
  messages: OllamaMessage[],
  options: { model?: string; temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const data = await post<{ message?: { content?: string } }>(
    '/api/chat',
    {
      model: options.model ?? env.LLM_MODEL,
      messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.2,
        num_predict: options.maxTokens ?? 1024,
      },
    },
    300_000
  )
  return data.message?.content ?? ''
}

/**
 * Describe an image with VISION_MODEL. Returns null when no vision model is configured.
 */
export async function describeImage(image: Buffer): Promise<string | null> {
  if (!env.VISION_MODEL) return null
  return chat(
    [
      {
        role: 'user',
        content:
          'Describe this image factually for a ride-hailing dispute investigation. ' +
          'Mention visible people, vehicles, license plates, locations, timestamps, app screens and any damage.',
        images: [image.toString('base64')],
      },
    ],
    { model: env.VISION_MODEL, temperature: 0 }
  )
}

/**
 * Names of locally available models, or null if Ollama is unreachable.
 */
export async function listModels(): Promise<string[] | null> {
  try {
    const res = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    const data = (await res.json()) as { models?: { name: string }[] }
    return (data.models ?? []).map((m) => m.name)
  } catch {
    return null
  }
}
