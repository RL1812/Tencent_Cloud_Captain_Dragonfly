/**
 * Dispute Review — API Client
 */

import { apiClient } from './api-client';
import type {
  DisputeCase,
  CreateDisputeDTO,
  DashboardStats,
  NewEvidence,
} from '../types/dispute';

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

  review: (id: string) =>
    apiClient
      .post<{ data: DisputeCase }>(`/disputes/${id}/review`, {}, { timeout: 120000 })
      .then((r) => r.data.data),
};
