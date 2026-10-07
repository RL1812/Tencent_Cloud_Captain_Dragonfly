/**
 * Knowledge Base — API Client (uploads, company records, search, Q&A)
 */

import { apiClient } from './api-client';

export type SourceType = 'pdf' | 'text' | 'image' | 'company_record';
export type DocumentStatus = 'processing' | 'ready' | 'failed';

export interface KnowledgeDocument {
  id: string;
  caseId: string | null;
  sourceType: SourceType;
  title: string;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  status: DocumentStatus;
  error: string | null;
  chunkCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  extractedText?: string;
  duplicate?: boolean;
}

export interface SearchOptions {
  caseId?: string;
  includeGlobal?: boolean;
  sourceTypes?: SourceType[];
  topK?: number;
  minScore?: number;
}

export interface SearchHit {
  chunkId: number;
  documentId: string;
  caseId: string | null;
  title: string;
  sourceType: SourceType;
  originalFilename: string | null;
  page: number | null;
  chunkIndex: number;
  content: string;
  score: number;
}

export interface AskResult {
  question: string;
  answer: string | null;
  model: string;
  sources: (SearchHit & { ref: number })[];
  llmError?: string;
}

// Local models on CPU can take a minute or more
const SLOW_TIMEOUT = 300_000;

export const knowledgeApi = {
  /** Upload PDFs, text files, screenshots or photos. Returns immediately with status "processing". */
  upload: (files: File[], options: { caseId?: string; title?: string } = {}) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    if (options.caseId) form.append('caseId', options.caseId);
    if (options.title) form.append('title', options.title);
    return apiClient
      .post<{ data: KnowledgeDocument[] }>('/knowledge/documents', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: SLOW_TIMEOUT,
      })
      .then((r) => r.data.data);
  },

  addText: (input: { text: string; title: string; caseId?: string }) =>
    apiClient
      .post<{ data: KnowledgeDocument[] }>('/knowledge/documents/text', input)
      .then((r) => r.data.data[0]),

  list: (filter: { caseId?: string; sourceType?: SourceType; status?: DocumentStatus } = {}) =>
    apiClient
      .get<{ data: KnowledgeDocument[] }>('/knowledge/documents', { params: filter })
      .then((r) => r.data.data),

  get: (id: string) =>
    apiClient
      .get<{ data: KnowledgeDocument }>(`/knowledge/documents/${id}`)
      .then((r) => r.data.data),

  fileUrl: (id: string) => `/api/knowledge/documents/${id}/file`,

  reprocess: (id: string) =>
    apiClient
      .post<{ data: KnowledgeDocument[] }>(`/knowledge/documents/${id}/reprocess`)
      .then((r) => r.data.data[0]),

  remove: (id: string) => apiClient.delete(`/knowledge/documents/${id}`),

  /** Pull a dispute and its trip, rider and driver from the company API (mock for now) */
  importDispute: (disputeId: string, caseId?: string) =>
    apiClient
      .post<{ data: KnowledgeDocument[] }>('/knowledge/company-records/import', { disputeId, caseId })
      .then((r) => r.data.data),

  search: (query: string, options: SearchOptions = {}) =>
    apiClient
      .post<{ data: SearchHit[] }>('/knowledge/search', { query, ...options }, { timeout: SLOW_TIMEOUT })
      .then((r) => r.data.data),

  /** Ask a question; the answer cites sources as [n] matching sources[].ref */
  ask: (question: string, options: SearchOptions = {}) =>
    apiClient
      .post<{ data: AskResult }>('/knowledge/ask', { question, ...options }, { timeout: SLOW_TIMEOUT })
      .then((r) => r.data.data),
};
