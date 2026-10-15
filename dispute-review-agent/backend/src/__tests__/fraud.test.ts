import fs from 'fs';
import path from 'path';
import { disputeStore } from '../modules/dispute/store';
import { chatCompletion } from '../lib/llm-chat';
import { sampleDatasetSchema } from '../modules/dispute/agents/dataset';
import { runFraudAgent } from '../modules/dispute/agents/fraud-agent';
import { reviewDispute } from '../modules/dispute/agents/orchestrator';
import { sourceIndex } from '../modules/dispute/agents/shared';
import { judgeChecklist } from '../modules/dispute/agents/checklist';

jest.mock('../lib/llm-chat', () => ({ chatCompletion: jest.fn() }));
const chat = jest.mocked(chatCompletion);

const disp002 = JSON.parse(
  fs.readFileSync(path.resolve(__dirname,
    '../../../../RydeResolve Sample Dataset — DISP-002 No-Show Charge Dispute (SG).md'),
    'utf8').match(/```json\s*([\s\S]*?)```/)![1]
);
const dataset002 = sampleDatasetSchema.parse(disp002);

const disp003 = JSON.parse(
  fs.readFileSync(path.resolve(__dirname,
    '../../../frontend/public/samples/disp-003.json'), 'utf8')
);
const dataset003 = sampleDatasetSchema.parse(disp003);

const advocate = {
  positionSummary: 'The evidence requires review.',
  claims: ['The rider alleges that the driver did not arrive.'],
  supportingEvidence: [{
    evidence: 'Rider allegation', relevance: 'Explains the requested refund.',
    sourceRefs: ['/dispute_ticket/description'],
  }],
  adverseEvidence: [{
    evidence: 'Arrival record', relevance: 'Challenges the allegation.',
    sourceRefs: ['/gps_telemetry/4'],
  }],
  policyArguments: [{
    argument: 'Compare elapsed wait with eight-minute threshold.',
    sourceRefs: ['/cancellation_policy/no_show_threshold_min'],
  }],
  missingEvidence: ['Exact basis for wait start.'],
  requestedOutcome: 'Decide using the supplied policy.', confidenceScore: 60,
};

const judge = {
  summary: 'Mock judge response.',
  keyIssues: ['Wait-start ambiguity'],
  driverPerspective: 'Driver has arrival records.',
  passengerPerspective: 'Rider disputes arrival.',
  evidenceAnalysis: 'Compare timestamps.',
  policyReferences: ['Eight-minute no-show threshold'],
  recommendation: 'inconclusive',
  recommendationReasoning: 'Wait-start basis needs clarification.',
  suggestedActions: ['No adjustment pending clarification.'],
  confidenceScore: 50, confidenceReasoning: 'Timer records differ.',
  sourceRefs: ['/app_events/5', '/trip_data/driver_wait_start'],
  missingEvidence: ['Authoritative wait-start basis.'],
  checklist: judgeChecklist(dataset002).map(({ id }) => ({
    id, finding: 'Recorded.', conflict: id === 'C2', sourceRefs: ['/trip_data/driver_wait_start'],
  })),
  resolution: { action: 'no_action', amount: 0, recipient: 'none', basis: 'Pending clarification of the wait-start basis.' },
  partyNotices: { rider: 'We are reviewing your dispute.', driver: 'We are reviewing this trip.' },
};

beforeEach(() => chat.mockReset());

describe('runFraudAgent', () => {
  test('DISP-002 rider is high risk (flagged, high frequency, high rejection ratio)', () => {
    const result = runFraudAgent(dataset002);
    expect(result.agent).toBe('fraud_detection_agent');
    expect(result.contextOnly).toBe(true);
    expect(result.riskLevel).toBe('high');

    const riderSignals = result.signals.filter((s) => s.party === 'rider');
    expect(riderSignals.map((s) => s.code)).toContain('account_risk_flag');
    expect(riderSignals.map((s) => s.code)).toContain('dispute_frequency');
    expect(riderSignals.map((s) => s.code)).toContain('adverse_outcome_ratio');

    const freq = riderSignals.find((s) => s.code === 'dispute_frequency')!;
    expect(freq.severity).toBe('high');
    expect(freq.detail).toContain('11.8');

    const adv = riderSignals.find((s) => s.code === 'adverse_outcome_ratio')!;
    expect(adv.severity).toBe('high');
    expect(adv.detail).toContain('75%');
  });

  test('DISP-003 driver is high risk (flagged, adverse ratio, thin account)', () => {
    const result = runFraudAgent(dataset003);
    expect(result.riskLevel).toBe('high');

    const driverSignals = result.signals.filter((s) => s.party === 'driver');
    expect(driverSignals.map((s) => s.code)).toContain('account_risk_flag');
    expect(driverSignals.map((s) => s.code)).toContain('adverse_outcome_ratio');
    expect(driverSignals.map((s) => s.code)).toContain('thin_account_history');

    const adv = driverSignals.find((s) => s.code === 'adverse_outcome_ratio')!;
    expect(adv.severity).toBe('high');
    expect(adv.detail).toContain('66.7');

    const thin = driverSignals.find((s) => s.code === 'thin_account_history')!;
    expect(thin.severity).toBe('medium');
    expect(thin.detail).toContain('160');
  });

  test('DISP-003 rider is low risk', () => {
    const result = runFraudAgent(dataset003);
    const riderSignals = result.signals.filter((s) => s.party === 'rider');
    expect(riderSignals).toHaveLength(0);
  });

  test('every signal citation exists in the source index (no invented refs)', () => {
    for (const dataset of [dataset002, dataset003]) {
      const result = runFraudAgent(dataset);
      const index = sourceIndex(dataset);
      for (const signal of result.signals) {
        for (const ref of signal.sourceRefs) {
          expect(index).toHaveProperty(ref);
        }
      }
    }
  });

  test('stored case without profile history returns low risk', () => {
    const stored = disputeStore.getById('case-001')!;
    const result = runFraudAgent(stored);
    expect(result.riskLevel).toBe('low');
    expect(result.signals).toHaveLength(0);
    expect(result.note).toContain('No party dispute history');
    expect(result.contextOnly).toBe(true);
  });
});

describe('integration: reviewDispute includes fraud assessment', () => {
  test('fraud assessment is part of the workflow output', async () => {
    chat.mockResolvedValueOnce(JSON.stringify(advocate))
      .mockResolvedValueOnce(JSON.stringify(advocate))
      .mockResolvedValueOnce(JSON.stringify(judge));
    const result = await reviewDispute(dataset002);
    expect(result.fraudAssessment).toBeDefined();
    expect(result.fraudAssessment.agent).toBe('fraud_detection_agent');
    expect(result.fraudAssessment.riskLevel).toBe('high');
    expect(result.fraudAssessment.contextOnly).toBe(true);
  });

  test('the Judge prompt includes fraud signals but without sourceRefs', async () => {
    chat.mockResolvedValueOnce(JSON.stringify(advocate))
      .mockResolvedValueOnce(JSON.stringify(advocate))
      .mockResolvedValueOnce(JSON.stringify(judge));
    await reviewDispute(dataset002);
    const judgeInput = JSON.parse(chat.mock.calls[2][0][1].content);
    expect(judgeInput.fraudRiskSignals).toBeDefined();
    expect(judgeInput.fraudRiskSignals.riskLevel).toBe('high');
    expect(judgeInput.fraudRiskSignals.signals.length).toBeGreaterThan(0);
    for (const s of judgeInput.fraudRiskSignals.signals) {
      expect(s.sourceRefs).toBeUndefined();
      expect(s.detail).toBeDefined();
    }
  });
});
