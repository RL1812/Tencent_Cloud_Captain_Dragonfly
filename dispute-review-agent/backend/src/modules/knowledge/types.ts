/**
 * Knowledge Base — Type Definitions
 */

export type SourceType = 'pdf' | 'text' | 'image' | 'company_record'
export type DocumentStatus = 'processing' | 'ready' | 'failed'
export type CompanyRecordType = 'dispute' | 'rider' | 'driver' | 'trip'

export interface KnowledgeDocument {
  id: string
  caseId: string | null
  sourceType: SourceType
  title: string
  originalFilename: string | null
  mimeType: string | null
  sizeBytes: number | null
  status: DocumentStatus
  error: string | null
  chunkCount: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  /** Only included when fetching a single document */
  extractedText?: string
}

/** A section of extracted text; page is set for PDFs */
export interface TextSection {
  text: string
  page?: number
}

export interface ParsedContent {
  sections: TextSection[]
  metadata: Record<string, unknown>
}

export interface Chunk {
  content: string
  chunkIndex: number
  page?: number
}

export interface SearchOptions {
  caseId?: string
  /** When filtering by case, also search documents not tied to any case (e.g. policies) */
  includeGlobal?: boolean
  sourceTypes?: SourceType[]
  topK?: number
  minScore?: number
}

export interface SearchHit {
  chunkId: number
  documentId: string
  caseId: string | null
  title: string
  sourceType: SourceType
  originalFilename: string | null
  page: number | null
  chunkIndex: number
  content: string
  /** Cosine similarity, 1 = identical */
  score: number
}

export interface AskResult {
  question: string
  answer: string | null
  model: string
  sources: (SearchHit & { ref: number })[]
  /** Set when retrieval worked but the LLM call failed */
  llmError?: string
}
