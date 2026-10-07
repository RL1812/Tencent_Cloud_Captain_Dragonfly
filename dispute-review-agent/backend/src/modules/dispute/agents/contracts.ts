import { z } from 'zod';
import type { DisputeCase, AIReview } from '../types';
import type { SampleDataset } from './dataset';

export type AgentInput = DisputeCase | SampleDataset;
export type AdvocateRole = 'rider_advocate' | 'driver_advocate';
export type ExecutionMode = 'llm' | 'fallback';

// Models sometimes answer 72.5 or a probability like 0.85; store a whole 0-100 score
const confidenceScoreSchema = z
  .number()
  .min(0)
  .max(100)
  .transform((n) => Math.round(n > 0 && n < 1 ? n * 100 : n));

export const evidenceArgumentSchema = z.object({
  evidence: z.string().min(1),
  relevance: z.string().min(1),
  sourceRefs: z.array(z.string().min(1)).min(1),
});
export const advocateOutputSchema = z.object({
  positionSummary: z.string().min(1),
  claims: z.array(z.string()).min(1),
  supportingEvidence: z.array(evidenceArgumentSchema),
  adverseEvidence: z.array(evidenceArgumentSchema),
  policyArguments: z.array(z.object({
    argument: z.string().min(1),
    sourceRefs: z.array(z.string().min(1)).min(1),
  })),
  missingEvidence: z.array(z.string()),
  requestedOutcome: z.string().min(1),
  confidenceScore: confidenceScoreSchema,
});
export type EvidenceArgument = z.infer<typeof evidenceArgumentSchema>;
export type AdvocateCase = z.infer<typeof advocateOutputSchema> & {
  agent: AdvocateRole;
  disputeId: string;
  mode: ExecutionMode;
};

export const judgeOutputSchema = z.object({
  summary: z.string().min(1),
  keyIssues: z.array(z.string()).min(1),
  driverPerspective: z.string().min(1),
  passengerPerspective: z.string().min(1),
  evidenceAnalysis: z.string().min(1),
  policyReferences: z.array(z.string()),
  recommendation: z.enum(['driver', 'passenger', 'shared', 'inconclusive']),
  recommendationReasoning: z.string().min(1),
  suggestedActions: z.array(z.string()).min(1),
  confidenceScore: confidenceScoreSchema,
  confidenceReasoning: z.string().min(1),
  sourceRefs: z.array(z.string().min(1)).min(1),
  missingEvidence: z.array(z.string()),
});
export type JudgeOutput = z.infer<typeof judgeOutputSchema>;
export type JudgeReview = AIReview & {
  disputeId: string;
  mode: ExecutionMode;
  sourceRefs: string[];
  missingEvidence: string[];
};
export type MultiAgentReview = JudgeReview & {
  advocateSubmissions: { rider: AdvocateCase; driver: AdvocateCase };
};
