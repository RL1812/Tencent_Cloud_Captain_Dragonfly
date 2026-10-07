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

export interface Evidence {
  description: string;
  items: string[];
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
  evidence: Evidence;
  review?: AIReview;
}

export interface CreateDisputeDTO {
  title: string;
  priority: DisputePriority;
  type: DisputeType;
  driver: Party;
  passenger: Party;
  trip: TripInfo;
  evidence: Evidence;
}

export interface DashboardStats {
  total: number;
  pending: number;
  underReview: number;
  resolved: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
}
