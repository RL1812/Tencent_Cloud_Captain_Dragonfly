/**
 * Dispute Review — UI Helper Functions
 */

import type {
  DisputeStatus,
  DisputePriority,
  DisputeType,
  EvidenceKind,
  EvidenceParty,
  Recommendation,
} from '../types/dispute';

export const typeLabels: Record<DisputeType, string> = {
  route_deviation: '绕路',
  no_show_charge: '爽约收费',
  property_damage: '财物损坏',
  safety_accident: '安全事故',
};

export const evidencePartyLabels: Record<EvidenceParty, string> = {
  driver: '司机',
  rider: '乘客',
};

export const evidenceKindLabels: Record<EvidenceKind, string> = {
  text: '文字说明',
  chat: '聊天记录',
  gps: 'GPS数据',
  payment: '付款记录',
  photo: '照片',
};

export const priorityLabels: Record<DisputePriority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
};

export const statusLabels: Record<DisputeStatus, string> = {
  pending: '待审查',
  under_review: '审查中',
  resolved: '已裁决',
};

export const recommendationLabels: Record<Recommendation, string> = {
  driver: '支持司机',
  passenger: '支持乘客',
  shared: '双方共担',
  inconclusive: '无法判定',
};

export function statusBadgeClass(status: DisputeStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'under_review':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'resolved':
      return 'bg-green-50 text-green-700 border-green-200';
    default:
      return '';
  }
}

export function priorityBadgeClass(priority: DisputePriority): string {
  switch (priority) {
    case 'low':
      return 'bg-gray-50 text-gray-600 border-gray-200';
    case 'medium':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'high':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'urgent':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return '';
  }
}

export interface RecColor {
  bg: string;
  text: string;
}

export function recommendationColor(rec: Recommendation): RecColor {
  switch (rec) {
    case 'driver':
      return { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' };
    case 'passenger':
      return { bg: 'bg-green-50 border-green-200', text: 'text-green-700' };
    case 'shared':
      return { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' };
    case 'inconclusive':
      return { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-600' };
    default:
      return { bg: '', text: '' };
  }
}

export function confidenceColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-600';
}

export function confidenceBarColor(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

export function formatDateTime(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}
