/**
 * Dispute Review — In-memory data store with sample cases
 */

import type {
  DisputeCase,
  CreateDisputeDTO,
  DashboardStats,
  EvidenceItem,
  NewEvidence,
  Recommendation,
  PriorityAssessment,
  LearningFeedback,
} from './types';
import type { SampleDataset } from './agents/dataset';
import { precedentFromCase, precedentStore } from './precedents';

let counter = 1000;
let evidenceCounter = 0;

function makeEvidence(
  input: NewEvidence,
  uploadedAt: string = new Date().toISOString()
): EvidenceItem {
  evidenceCounter++;
  return { id: `ev-${String(evidenceCounter).padStart(3, '0')}`, ...input, uploadedAt };
}

const cases: DisputeCase[] = [
  {
    id: 'case-001',
    caseNumber: 'DR-2024-001',
    status: 'resolved',
    priority: 'high',
    type: 'safety_accident',
    title: 'Driver reports seatbelt refusal and a verbal threat',
    createdAt: '2024-12-10T09:30:00Z',
    updatedAt: '2024-12-10T14:20:00Z',
    driver: {
      name: 'Tan Wei Ming',
      id: 'DRV-8821',
      rating: 4.9,
      statement:
        'The passenger refused to put on his seatbelt after I reminded him three times. He swore at me and said "mind your own business." I pulled over and asked him to cooperate, and he threatened me saying "you want me to punch you?" Given the safety risk, I dropped him off at the roadside and ended the trip. In-cabin audio recording was on the whole time.',
    },
    passenger: {
      name: 'Zhao Wei',
      id: 'PAS-3372',
      rating: 3.8,
      statement:
        'I just did not wear a seatbelt, so why did the driver kick me out? He stopped at a place I did not recognise and was very aggressive, saying "get out or I will call the police." I admit I said a few unpleasant things, but only because he provoked me first. I want a refund and compensation.',
    },
    trip: {
      pickupLocation: 'Clarke Quay',
      dropoffLocation: 'Ang Mo Kio Central',
      pickupTime: '2024-12-10T01:15:00Z',
      dropoffTime: '2024-12-10T01:35:00Z',
      fare: 45,
      distance: 10.2,
      vehicleModel: 'Hyundai Elantra',
      plateNumber: 'SKD 8812 T',
      currency: 'SGD',
    },
    evidence: [
      makeEvidence({ party: 'driver', kind: 'text', title: 'In-cabin audio recording (full trip)', content: 'Audio recording was on, capturing the driver reminding the passenger to wear a seatbelt three times and the passenger making verbal threats.' }, '2024-12-10T09:30:00Z'),
      makeEvidence({ party: 'driver', kind: 'text', title: 'Dashcam video', content: 'Trip footage has been retrieved.' }, '2024-12-10T09:30:00Z'),
      makeEvidence({ party: 'driver', kind: 'gps', title: 'GPS trace', content: 'Trip 01:15–01:35, distance 10.2 km. The driver stopped at the roadside mid-trip and terminated the order.' }, '2024-12-10T09:30:00Z'),
      makeEvidence({ party: 'rider', kind: 'text', title: 'Passenger statement', content: 'The passenger states the driver dropped him at an unfamiliar location and was aggressive, and demands a refund and compensation.' }, '2024-12-10T10:00:00Z'),
    ],
    review: {
      summary: 'The passenger refused to wear a seatbelt and verbally threatened the driver. The driver terminated the trip for safety reasons, which was reasonable.',
      keyIssues: [
        'The passenger refused to wear a seatbelt, violating ride safety rules',
        'The passenger made a verbal threat ("you want me to punch you?")',
        'Whether the driver terminating the trip at a non-destination location was justified',
        'Whether the refund and compensation claim is valid',
      ],
      driverPerspective:
        'Driver Tan Wei Ming (rating 4.9) acted on clear safety grounds. Under platform rules, passengers must wear a seatbelt and the driver is entitled to remind them. After repeated reminders were ignored and a verbal threat was made, terminating the trip was a reasonable safety precaution. The in-cabin audio supports his account. His statement is consistent with the trip timeline and is highly credible.',
      passengerPerspective:
        'Passenger Zhao Wei (rating 3.8, below platform average) admits he did not wear a seatbelt and used inappropriate language, but blames the driver for "provoking him first." However, his statement provides no specific detail to support the claim that the driver provoked him. His rating and history suggest a possible pattern of similar behaviour. His refund and compensation claim lacks merit.',
      evidenceAnalysis:
        'The in-cabin audio is the key evidence and can verify both parties\' accounts. Per the driver\'s description, the audio should contain the phrase "you want me to punch you?" The GPS trace shows the trip ended at 01:35, consistent with the driver\'s timeline. The dashcam provides supplementary visual evidence. The evidence overall supports the driver.',
      policyReferences: [
        'Ride Safety Regulations, Clause 3: Passengers must wear a seatbelt',
        'Driver Code of Conduct, Clause 7: The driver may terminate a trip when facing a safety threat',
        'Passenger Code of Conduct, Clause 5: Verbal threats or abuse towards the driver are prohibited',
        'Refund Policy, Clause 4: No refund is due when a trip is terminated due to passenger misconduct',
      ],
      recommendation: 'driver',
      recommendationReasoning:
        'The passenger violated the seatbelt rule and verbally threatened the driver. The driver\'s decision to terminate the trip complies with platform safety regulations. The passenger\'s refund and compensation claim is not valid. It is recommended that the platform uphold the original fare, issue a safety warning to the passenger, and reserve the right to restrict the passenger account. The driver should be commended for handling the safety incident appropriately.',
      suggestedActions: [
        'Uphold the original fare of SGD 45 and reject the passenger refund claim',
        'Issue a conduct warning notice to passenger Zhao Wei',
        'Require the passenger to complete a safety education course',
        'Commend driver Tan Wei Ming for his handling of the safety incident',
        'Archive the audio evidence for any future appeal',
      ],
      confidenceScore: 88,
      confidenceReasoning:
        'The in-cabin audio can directly verify the key factual claims, GPS data supports the timeline, the rating gap is significant, and the driver\'s statement is internally consistent. 12 points deducted because the possibility that the passenger was "provoked first" cannot be fully ruled out without final audio verification.',
      reviewedAt: '2024-12-10T14:20:00Z',
    },
  },
  {
    id: 'case-002',
    caseNumber: 'DR-2024-002',
    status: 'pending',
    priority: 'urgent',
    type: 'route_deviation',
    title: 'Rider disputes a fare increase caused by route deviation',
    createdAt: '2024-12-15T08:00:00Z',
    updatedAt: '2024-12-15T08:00:00Z',
    driver: {
      name: 'Lee Hock Seng',
      id: 'DRV-5567',
      rating: 4.7,
      statement:
        'I followed the navigation the entire way. The app recommended two routes and I picked the one with the shortest time. The distance was a bit longer, but I avoided a congested stretch and we actually arrived faster. There was absolutely no detour — the system can check my navigation log.',
    },
    passenger: {
      name: 'Lim Cheng Hui',
      id: 'PAS-1024',
      rating: 4.5,
      statement:
        'I take this route regularly and a normal ride costs about SGD 22, but I was charged SGD 38 this time. I checked the map and the driver clearly took a longer way, adding at least 5 km. He says the navigation told him to, but how would navigation pick a longer route? I want the overcharge refunded.',
    },
    trip: {
      pickupLocation: 'One-North',
      dropoffLocation: 'Changi Airport',
      pickupTime: '2024-12-15T06:30:00Z',
      dropoffTime: '2024-12-15T07:15:00Z',
      fare: 38,
      distance: 28.5,
      vehicleModel: 'Toyota Camry',
      plateNumber: 'SGP 4521 M',
      currency: 'SGD',
    },
    evidence: [
      makeEvidence({ party: 'driver', kind: 'text', title: 'Platform navigation log', content: 'Navigation recommended two routes; the driver selected the one with the shortest estimated time.' }, '2024-12-15T16:00:00Z'),
      makeEvidence({ party: 'driver', kind: 'gps', title: 'Actual GPS trace', content: 'Actual driving trace to be compared against the recommended route.' }, '2024-12-15T16:00:00Z'),
      makeEvidence({ party: 'rider', kind: 'payment', title: 'Historical fare records for the same route', content: 'Previous fares for the same route were noticeably lower than this trip.' }, '2024-12-15T16:30:00Z'),
    ],
  },
  {
    id: 'case-003',
    caseNumber: 'DR-2024-003',
    status: 'pending',
    priority: 'medium',
    type: 'no_show_charge',
    title: 'Rider reports rude conduct and refusal to continue the trip',
    createdAt: '2024-12-16T14:00:00Z',
    updatedAt: '2024-12-16T14:00:00Z',
    driver: {
      name: 'Wong Kah Lok',
      id: 'DRV-4490',
      rating: 4.2,
      statement:
        'The passenger was almost 10 minutes late and I waited a long time. After she got in she wanted to change the destination, which was in a completely different direction and would have badly affected my next pickup. I explained the situation — I may have sounded a bit impatient, but I did not insult her. She then said she did not want the ride, and there was nothing I could do.',
    },
    passenger: {
      name: 'Chen Mei Ling',
      id: 'PAS-7783',
      rating: 4.8,
      statement:
        'The driver had a terrible attitude right from the start. I just said I wanted to change the destination and he raised his voice saying "why did you not do that earlier?" Then he said he would not drive me and told me to get out. It was raining and I waited 20 minutes by the road before I got another ride. I want to complain about him refusing the trip.',
    },
    trip: {
      pickupLocation: 'Jurong Point',
      dropoffLocation: 'Buona Vista (original destination)',
      pickupTime: '2024-12-16T13:45:00Z',
      dropoffTime: '2024-12-16T14:00:00Z',
      fare: 0,
      distance: 0,
      vehicleModel: 'BYD Qin',
      plateNumber: 'SKB 3344 Z',
      currency: 'SGD',
    },
    evidence: [
      makeEvidence({ party: 'driver', kind: 'text', title: 'Order wait-time record', content: 'Record of the wait time after the driver arrived at the pickup point.' }, '2024-12-16T14:00:00Z'),
      makeEvidence({ party: 'driver', kind: 'text', title: 'Driver acceptance and arrival record', content: 'Record of the driver accepting the order and arriving at the pickup point.' }, '2024-12-16T14:00:00Z'),
      makeEvidence({ party: 'rider', kind: 'text', title: 'In-cabin audio', content: 'Trip audio is available, covering the conversation about the mid-trip destination change and cancellation.' }, '2024-12-16T14:10:00Z'),
    ],
  },
];

function generateId(): string {
  counter++;
  return `case-${String(counter).padStart(3, '0')}`;
}

function generateCaseNumber(): string {
  const year = new Date().getFullYear();
  const num = String(cases.length + 1).padStart(3, '0');
  return `DR-${year}-${num}`;
}

export const disputeStore = {
  getAll(): DisputeCase[] {
    const priorityRank = { urgent: 4, high: 3, medium: 2, low: 1 };
    return [...cases].sort(
      (a, b) =>
        priorityRank[b.priority] - priorityRank[a.priority] ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  getById(id: string): DisputeCase | undefined {
    return cases.find((c) => c.id === id);
  },

  create(
    dto: CreateDisputeDTO,
    opts: { caseNumber?: string; dataset?: SampleDataset; createdAt?: string } = {}
  ): DisputeCase {
    const now = new Date().toISOString();
    const newCase: DisputeCase = {
      id: generateId(),
      caseNumber: opts.caseNumber ?? generateCaseNumber(),
      status: 'pending',
      priority: dto.priority,
      type: dto.type,
      title: dto.title,
      createdAt: opts.createdAt ?? now,
      updatedAt: now,
      driver: dto.driver,
      passenger: dto.passenger,
      trip: dto.trip,
      evidence: dto.evidence.map((e) => makeEvidence(e)),
      dataset: opts.dataset,
    };
    cases.push(newCase);
    return newCase;
  },

  addEvidence(id: string, input: NewEvidence): DisputeCase | undefined {
    const c = cases.find((c) => c.id === id);
    if (!c) return undefined;
    c.evidence.push(makeEvidence(input));
    c.updatedAt = new Date().toISOString();
    return c;
  },

  updateReview(id: string, review: DisputeCase['review']): DisputeCase | undefined {
    const c = cases.find((c) => c.id === id);
    if (!c || !review) return undefined;
    c.review = review;
    if (review.priorityAssessment) {
      c.priorityAssessment = review.priorityAssessment;
      c.priority = review.priorityAssessment.priority;
    }
    // A human decision stands: retain the new AI result for reference without
    // reopening the case or discarding either feedback mechanism.
    if (c.humanOverride) {
      c.status = 'resolved';
      c.updatedAt = new Date().toISOString();
      return c;
    }
    c.learningFeedback = undefined;
    const failed = review.mode === 'fallback';
    if (failed) {
      // Review could not run: stay open for a retry, nothing to escalate
      c.escalation = review.escalation ?? {
        needsHuman: false,
        reason: 'AI review did not complete. Retry the review.',
      };
      c.status = 'pending';
    } else if (review.escalation?.needsHuman) {
      c.escalation = review.escalation;
      c.status = 'under_review';
    } else {
      c.escalation = review.escalation ?? { needsHuman: false, reason: '' };
      c.status = 'resolved';
    }
    c.updatedAt = new Date().toISOString();
    return c;
  },

  /** A human reviewer's decision; closes the case and records it for later learning. */
  override(
    id: string,
    decision: {
      recommendation: Recommendation;
      reason: string;
      decidedBy?: string;
      useAsPrecedent: boolean;
    }
  ): DisputeCase | undefined {
    const c = cases.find((c) => c.id === id);
    if (!c) return undefined;
    const now = new Date().toISOString();
    c.humanOverride = { ...decision, decidedAt: now };
    c.escalation = { needsHuman: false, reason: 'Resolved by a human reviewer.' };
    c.status = 'resolved';
    c.updatedAt = now;
    if (decision.useAsPrecedent) precedentStore.upsert(precedentFromCase(c, c.humanOverride));
    else precedentStore.remove(c.caseNumber);
    return c;
  },

  /** Withdraws a human decision and restores the status implied by the AI result. */
  clearOverride(id: string): DisputeCase | undefined {
    const c = cases.find((item) => item.id === id);
    if (!c) return undefined;
    if (!c.humanOverride) return c;
    c.humanOverride = undefined;
    c.learningFeedback = undefined;
    precedentStore.remove(c.caseNumber);
    if (c.review) return this.updateReview(id, c.review);
    c.escalation = undefined;
    c.status = 'pending';
    c.updatedAt = new Date().toISOString();
    return c;
  },

  /** A deleted precedent remains a decision, but no longer teaches the Judge. */
  unmarkPrecedent(caseNumber: string): void {
    const c = cases.find((item) => item.caseNumber === caseNumber);
    if (c?.humanOverride) c.humanOverride.useAsPrecedent = false;
  },

  setPriorityAssessment(id: string, assessment: PriorityAssessment): DisputeCase | undefined {
    const c = cases.find((item) => item.id === id);
    if (!c) return undefined;
    c.priorityAssessment = assessment;
    c.priority = assessment.priority;
    c.updatedAt = new Date().toISOString();
    return c;
  },

  setLearningFeedback(id: string, feedback: LearningFeedback): DisputeCase | undefined {
    const c = cases.find((item) => item.id === id);
    if (!c) return undefined;
    c.learningFeedback = feedback;
    c.updatedAt = new Date().toISOString();
    return c;
  },

  setStatus(id: string, status: DisputeCase['status']): DisputeCase | undefined {
    const c = cases.find((c) => c.id === id);
    if (!c) return undefined;
    c.status = status;
    c.updatedAt = new Date().toISOString();
    return c;
  },

  getStats(): DashboardStats {
    const stats: DashboardStats = {
      total: cases.length,
      pending: 0,
      underReview: 0,
      resolved: 0,
      byType: {},
      byPriority: {},
    };
    for (const c of cases) {
      if (c.status === 'pending') stats.pending++;
      else if (c.status === 'under_review') stats.underReview++;
      else if (c.status === 'resolved') stats.resolved++;
      stats.byType[c.type] = (stats.byType[c.type] || 0) + 1;
      stats.byPriority[c.priority] = (stats.byPriority[c.priority] || 0) + 1;
    }
    return stats;
  },
};
