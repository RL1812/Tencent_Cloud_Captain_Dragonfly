/**
 * Dispute Review — Type Definitions
 */

import type { SampleDataset } from './agents/dataset';

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
  /** Fare currency; defaults to CNY when absent */
  currency?: 'CNY' | 'SGD';
}

/** platform = system records (GPS, app events, policy), not uploaded by a party */
export type EvidenceParty = 'driver' | 'rider' | 'platform';
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
  mimeType?: string;
  uploadedAt: string;
}

/** Evidence as submitted by a client (server adds id and uploadedAt). */
export type NewEvidence = Pick<EvidenceItem, 'party' | 'kind' | 'title' | 'content'> &
  Partial<Pick<EvidenceItem, 'fileName' | 'fileUrl' | 'mimeType'>>;

/** One advocate's case, produced by the Rider / Driver Advocate agent. */
export interface AdvocateSubmission {
  agent: 'rider_advocate' | 'driver_advocate';
  disputeId: string;
  mode: 'llm' | 'fallback';
  positionSummary: string;
  claims: string[];
  supportingEvidence: { evidence: string; relevance: string; sourceRefs: string[] }[];
  adverseEvidence: { evidence: string; relevance: string; sourceRefs: string[] }[];
  policyArguments: { argument: string; sourceRefs: string[] }[];
  missingEvidence: string[];
  requestedOutcome: string;
  confidenceScore: number;
}

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
  /** Multi-agent fields (absent on reviews from the old single-agent flow) */
  disputeId?: string;
  mode?: 'llm' | 'fallback';
  sourceRefs?: string[];
  missingEvidence?: string[];
  advocateSubmissions?: { rider: AdvocateSubmission; driver: AdvocateSubmission };
  /** The Judge's answer to each required check (see agents/checklist.ts) */
  checklist?: ChecklistAnswer[];
  /** Case numbers of the human precedents shown to the Judge */
  precedentsUsed?: string[];
  priorityAssessment?: PriorityAssessment;
  evidenceValidation?: EvidenceValidation;
  escalation?: Escalation;
  workflowStatus?: 'auto_resolved' | 'human_intervention_required';
}

export interface ChecklistAnswer {
  id: string;
  item: string;
  finding: string;
  /** True when the sources disagree on this point */
  conflict: boolean;
  sourceRefs: string[];
}

export interface PriorityAssessment {
  agent: 'prioritization_agent';
  priority: DisputePriority;
  score: number;
  reasons: string[];
  targetResponseMinutes: number;
  assessedAt: string;
}

export interface EvidenceValidation {
  agent: 'evidence_validation_agent';
  status: 'ready' | 'limited';
  evidenceItemCount: number;
  checks: string[];
  warnings: string[];
  validatedAt: string;
}

/** Set when the Judge is not confident enough and a human should decide. */
export interface Escalation {
  agent?: 'escalation_agent';
  needsHuman: boolean;
  reason: string;
  triggers?: string[];
  confidenceThreshold?: number;
  evaluatedAt?: string;
}

/** A human reviewer's decision, overriding the Judge. */
export interface HumanOverride {
  recommendation: Recommendation;
  reason: string;
  decidedAt: string;
  decidedBy?: string;
  /** Kept as a precedent the AI Judge learns from */
  useAsPrecedent: boolean;
}

export interface LearningFeedback {
  agent: 'learning_feedback_agent';
  status: 'indexed' | 'skipped' | 'failed';
  message: string;
  documentId?: string;
  recordedAt: string;
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
  escalation?: Escalation;
  humanOverride?: HumanOverride;
  priorityAssessment?: PriorityAssessment;
  learningFeedback?: LearningFeedback;
  /** Original sample dataset, when the case was imported from one */
  dataset?: SampleDataset;
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
