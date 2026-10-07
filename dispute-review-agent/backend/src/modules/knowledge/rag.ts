/**
 * Retrieval-augmented answers: embed the question, find the closest chunks
 * with pgvector, and have the local LLM answer from those chunks only.
 */

import { env } from '../../config/env'
import { chat, embedText } from '../../lib/ollama'
import { searchChunks } from './repository'
import type { AskResult, SearchHit, SearchOptions } from './types'

const SYSTEM_PROMPT = `You are an assistant for a ride-hailing dispute review team.
Answer the question using ONLY the numbered context passages provided.
- Write the answer in full sentences. Put the citation right after the claim it supports, e.g. "The driver arrived at 08:43 [2]."
- Base facts on records and logs (GPS, app events, chat logs) over unverified statements, and say which is which.
- If the context does not contain the answer, say so plainly instead of guessing.
- Point out when sources contradict each other.
- Reply in the same language as the question.`

const MAX_CONTEXT_CHARS = 12_000

export async function semanticSearch(query: string, options: SearchOptions): Promise<SearchHit[]> {
  const embedding = await embedText(query)
  return searchChunks(embedding, options)
}

function describeSource(hit: SearchHit): string {
  const parts = [hit.title, hit.sourceType.replace('_', ' ')]
  if (hit.page) parts.push(`page ${hit.page}`)
  if (hit.caseId) parts.push(`case ${hit.caseId}`)
  return parts.join(' · ')
}

export function buildContext(hits: SearchHit[]): { context: string; used: (SearchHit & { ref: number })[] } {
  const used: (SearchHit & { ref: number })[] = []
  const blocks: string[] = []
  let length = 0

  for (const hit of hits) {
    const ref = used.length + 1
    const block = `[${ref}] (${describeSource(hit)})\n${hit.content}`
    if (length + block.length > MAX_CONTEXT_CHARS && used.length > 0) break
    blocks.push(block)
    used.push({ ...hit, ref })
    length += block.length
  }
  return { context: blocks.join('\n\n---\n\n'), used }
}

export async function askQuestion(question: string, options: SearchOptions): Promise<AskResult> {
  const hits = await semanticSearch(question, options)
  const base = { question, model: env.LLM_MODEL }

  if (hits.length === 0) {
    return {
      ...base,
      answer: 'No relevant documents were found in the knowledge base for this question.',
      sources: [],
    }
  }

  const { context, used } = buildContext(hits)
  try {
    const answer = await chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Context:\n\n${context}\n\nQuestion: ${question}` },
    ])
    return { ...base, answer: answer.trim(), sources: used }
  } catch (err) {
    // Retrieval still worked, so return the evidence even without an answer
    return {
      ...base,
      answer: null,
      sources: used,
      llmError: err instanceof Error ? err.message : String(err),
    }
  }
}
