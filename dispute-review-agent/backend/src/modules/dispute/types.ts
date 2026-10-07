/**
 * Dispute Review — Type Definitions
 */

export type DisputeStatus = 'pending' | 'under_review' | 'resolved';
export type DisputePriority = 'low' | 'medium' | 'high' | 'urgent';
export type DisputeType =
  | 'route_deviation'
  | 'no_show_charge'
  | 'property_damage'
  | 'safety_accident';
export type Recommendation = 'driver' | 'passenger' | 'shared' | 'inconclusive';

export interface Party {
  name: string;
  id: string;
  rating: number;
  statement: string;
}

export interface TripInfo {
  pickupLocation: string;
  dropoffLocation: string;
  pickupTime: string;
  dropoffTime: string;
  fare: number;
  distance: number;
  vehicleModel: string;
  plateNumber: string;
}

export type EvidenceParty = 'driver' | 'rider';
export type EvidenceKind = 'text' | 'chat' | 'gps' | 'payment' | 'photo';

/** A single piece of evidence, uploaded by one party. */
export interface EvidenceItem {
  id: string;
  party: EvidenceParty;
  kind: EvidenceKind;
  title: string;
  /** Text content (chat log, GPS points as JSON/CSV text, payment details, description). */
  content: string;
  /** Reserved for uploaded files (photos / PDFs); parsed by the parsing module. */
  fileName?: string;
  fileUrl?: string;
  uploadedAt: string;
}

/** Evidence as submitted by a client (server adds id and uploadedAt). */
export type NewEvidence = Pick<EvidenceItem, 'party' | 'kind' | 'title' | 'content'>;

export interface AIReview {
  summary: string;
  keyIssues: string[];
  driverPerspective: string;
  passengerPerspective: string;
  evidenceAnalysis: string;
  policyReferences: string[];
  recommendation: Recommendation;
  recommendationReasoning: string;
  suggestedActions: string[];
  confidenceScore: number;
  confidenceReasoning: string;
  reviewedAt: string;
}

export interface DisputeCase {
  id: string;
  caseNumber: string;
  status: DisputeStatus;
  priority: DisputePriority;
  type: DisputeType;
  title: string;
  createdAt: string;
  updatedAt: string;
  driver: Party;
  passenger: Party;
  trip: TripInfo;
  evidence: EvidenceItem[];
  review?: AIReview;
}

export interface CreateDisputeDTO {
  title: string;
  priority: DisputePriority;
  type: DisputeType;
  driver: Party;
  passenger: Party;
  trip: TripInfo;
  evidence: NewEvidence[];
}

export interface DashboardStats {
  total: number;
  pending: number;
  underReview: number;
  resolved: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
}
