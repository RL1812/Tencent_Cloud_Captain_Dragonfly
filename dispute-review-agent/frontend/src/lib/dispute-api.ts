/**
 * Dispute Review — API Client
 */

import { apiClient } from './api-client';
import type {
  DisputeCase,
  CreateDisputeDTO,
  DashboardStats,
  NewEvidence,
  Recommendation,
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

  override: (id: string, recommendation: Recommendation, reason: string) =>
    apiClient
      .post<{ data: DisputeCase }>(`/disputes/${id}/override`, { recommendation, reason })
      .then((r) => r.data.data),

  // Two advocates and a Judge, each possibly retried on another model: allow several minutes
  review: (id: string) =>
    apiClient
      .post<{ data: DisputeCase }>(`/disputes/${id}/review`, {}, { timeout: 600000 })
      .then((r) => r.data.data),
};
