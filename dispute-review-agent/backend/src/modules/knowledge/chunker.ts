/**
 * Split extracted text into overlapping chunks for embedding.
 *
 * Prefers paragraph, then sentence boundaries (English and Chinese punctuation),
 * and only hard-cuts text that has no natural break.
 */

import type { Chunk, TextSection } from './types'

export interface ChunkOptions {
  maxChars?: number
  overlapChars?: number
}

const DEFAULT_MAX_CHARS = 1000
const DEFAULT_OVERLAP_CHARS = 150

export function normalizeText(text: string): string {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Break text into pieces no longer than maxChars, on the best boundary available */
function splitIntoUnits(text: string, maxChars: number): string[] {
  const units: string[] = []
  for (const para of text.split(/\n{2,}/)) {
    if (para.length <= maxChars) {
      if (para.trim()) units.push(para.trim())
      continue
    }
    const sentences = para.match(/[^.!?。！？\n]+(?:[.!?。！？]+|\n|$)/g) ?? [para]
    for (const raw of sentences) {
      const sentence = raw.trim()
      if (!sentence) continue
      for (let i = 0; i < sentence.length; i += maxChars) {
        units.push(sentence.slice(i, i + maxChars))
      }
    }
  }
  return units
}

function chunkSection(text: string, maxChars: number, overlapChars: number): string[] {
  const units = splitIntoUnits(normalizeText(text), maxChars)
  const chunks: string[] = []
  let current = ''

  for (const unit of units) {
    const candidate = current ? `${current}\n${unit}` : unit
    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }
    chunks.push(current)
    // Carry the tail of the previous chunk so context spanning the cut is not lost
    const tail = overlapChars > 0 ? current.slice(-overlapChars) : ''
    const withOverlap = tail ? `${tail}\n${unit}` : unit
    current = withOverlap.length <= maxChars ? withOverlap : unit
  }
  if (current) chunks.push(current)
  return chunks
}

export function chunkSections(sections: TextSection[], options: ChunkOptions = {}): Chunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS
  const overlapChars = Math.min(options.overlapChars ?? DEFAULT_OVERLAP_CHARS, Math.floor(maxChars / 2))

  const chunks: Chunk[] = []
  for (const section of sections) {
    for (const content of chunkSection(section.text, maxChars, overlapChars)) {
      chunks.push({ content, chunkIndex: chunks.length, page: section.page })
    }
  }
  return chunks
}
