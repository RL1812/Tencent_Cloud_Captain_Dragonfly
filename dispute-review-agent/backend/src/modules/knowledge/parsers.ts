/**
 * Extract text from uploaded files.
 *
 * - PDF: unpdf (MIT), page by page
 * - Text / Markdown / CSV / JSON: read as UTF-8
 * - Screenshots & photos: tesseract.js OCR (Apache-2.0), plus an optional
 *   description from a local vision model when VISION_MODEL is set
 */

import path from 'path'
import { extractText, getDocumentProxy } from 'unpdf'
import { createWorker, type Worker } from 'tesseract.js'
import { env } from '../../config/env'
import { createLogger } from '../../config/logger'
import { describeImage } from '../../lib/ollama'
import type { ParsedContent, SourceType } from './types'

const logger = createLogger('Parsers')

const PDF_MIME = ['application/pdf']
const TEXT_MIME = ['text/plain', 'text/markdown', 'text/x-markdown', 'text/csv', 'application/json']
const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/gif']

const EXTENSION_TYPES: Record<string, SourceType> = {
  '.pdf': 'pdf',
  '.txt': 'text',
  '.md': 'text',
  '.markdown': 'text',
  '.csv': 'text',
  '.json': 'text',
  '.log': 'text',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.bmp': 'image',
  '.gif': 'image',
}

export const ACCEPTED_EXTENSIONS = Object.keys(EXTENSION_TYPES)

/**
 * Work out what kind of file this is. Browsers often send octet-stream for
 * .md and similar files, so fall back to the extension.
 */
export function detectSourceType(mimeType: string, filename: string): SourceType | null {
  if (PDF_MIME.includes(mimeType)) return 'pdf'
  if (IMAGE_MIME.includes(mimeType)) return 'image'
  if (TEXT_MIME.includes(mimeType)) return 'text'
  return EXTENSION_TYPES[path.extname(filename).toLowerCase()] ?? null
}

async function parsePdf(buffer: Buffer): Promise<ParsedContent> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { totalPages, text } = await extractText(pdf, { mergePages: false })
  const sections = text
    .map((pageText, i) => ({ text: pageText, page: i + 1 }))
    .filter((s) => s.text.trim().length > 0)

  const metadata: Record<string, unknown> = { totalPages }
  if (sections.length === 0) {
    metadata.warning = 'PDF has no text layer (probably scanned). Upload page screenshots to OCR them.'
  }
  return { sections, metadata }
}

function parseText(buffer: Buffer): ParsedContent {
  return { sections: [{ text: buffer.toString('utf8') }], metadata: {} }
}

// One shared OCR worker; language data is downloaded once and cached
let ocrWorker: Promise<Worker> | null = null

function getOcrWorker(): Promise<Worker> {
  if (!ocrWorker) {
    ocrWorker = createWorker(env.OCR_LANGS.split('+')).catch((err) => {
      ocrWorker = null
      throw err
    })
  }
  return ocrWorker
}

export async function terminateOcr(): Promise<void> {
  if (ocrWorker) {
    const worker = await ocrWorker.catch(() => null)
    ocrWorker = null
    await worker?.terminate()
  }
}

async function parseImage(buffer: Buffer): Promise<ParsedContent> {
  const worker = await getOcrWorker()
  const { data } = await worker.recognize(buffer)
  const ocrText = data.text.trim()

  let description: string | null = null
  try {
    description = await describeImage(buffer)
  } catch (err) {
    logger.warn({ err }, 'Vision model failed; continuing with OCR text only')
  }

  const sections = []
  if (ocrText) sections.push({ text: `Text found in image (OCR):\n${ocrText}` })
  if (description) sections.push({ text: `Image description:\n${description}` })

  const metadata: Record<string, unknown> = { ocrConfidence: Math.round(data.confidence) }
  if (description) metadata.visionModel = env.VISION_MODEL
  if (sections.length === 0) {
    metadata.warning = env.VISION_MODEL
      ? 'No text or description could be extracted from this image.'
      : 'No text found in this image. Set VISION_MODEL to also describe photos.'
  }
  return { sections, metadata }
}

export async function parseFile(buffer: Buffer, sourceType: SourceType): Promise<ParsedContent> {
  switch (sourceType) {
    case 'pdf':
      return parsePdf(buffer)
    case 'image':
      return parseImage(buffer)
    case 'text':
    case 'company_record':
      return parseText(buffer)
    default:
      throw new Error(`Unsupported file type: ${sourceType}`)
  }
}
