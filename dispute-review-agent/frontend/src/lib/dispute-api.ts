/**
 * Dispute Review — API Client
 */

import { apiClient } from './api-client';
import type {
  DisputeCase,
  CreateDisputeDTO,
  DashboardStats,
  HumanDecisionInput,
  NewEvidence,
  Precedent,
} from '../types/dispute';

export interface UploadedFile {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
}

export const disputeApi = {
  getAll: () =>
    apiClient
      .get<{ data: DisputeCase[] }>('/disputes')
      .then((r) => r.data.data),

  getById: (id: string) =>
    apiClient
      .get<{ data: DisputeCase }>(`/disputes/${id}`)
      .then((r) => r.data.data),

  getStats: () =>
    apiClient
      .get<{ data: DashboardStats }>('/disputes/stats')
      .then((r) => r.data.data),

  create: (dto: CreateDisputeDTO) =>
    apiClient
      .post<{ data: DisputeCase }>('/disputes', dto)
      .then((r) => r.data.data),

  addEvidence: (id: string, dto: NewEvidence) =>
    apiClient
      .post<{ data: DisputeCase }>(`/disputes/${id}/evidence`, dto)
      .then((r) => r.data.data),

  uploadFile: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient
      .post<{ data: UploadedFile }>('/uploads', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      })
      .then((r) => r.data.data);
  },

  /** existing = the dataset was imported before; its case is returned instead */
  importDataset: (dataset: unknown) =>
    apiClient
      .post<{ data: DisputeCase; existing: boolean }>('/disputes/import-dataset', dataset)
      .then((r) => ({ case: r.data.data, existing: r.data.existing })),

  /** A human decides the case (also to revise an earlier decision) */
  override: (id: string, decision: HumanDecisionInput) =>
    apiClient
      .post<{ data: DisputeCase }>(`/disputes/${id}/override`, decision)
      .then((r) => r.data.data),

  /** Withdraw the human decision; the case goes back to the AI result */
  clearOverride: (id: string) =>
    apiClient
      .delete<{ data: DisputeCase }>(`/disputes/${id}/override`)
      .then((r) => r.data.data),

  getPrecedents: () =>
    apiClient
      .get<{ data: Precedent[] }>('/disputes/precedents')
      .then((r) => r.data.data),

  deletePrecedent: (caseNumber: string) =>
    apiClient.delete(`/disputes/precedents/${encodeURIComponent(caseNumber)}`),

  // Two advocates and a Judge, each possibly retried on another model: allow several minutes
  review: (id: string) =>
    apiClient
      .post<{ data: DisputeCase }>(`/disputes/${id}/review`, {}, { timeout: 600000 })
      .then((r) => r.data.data),
};
