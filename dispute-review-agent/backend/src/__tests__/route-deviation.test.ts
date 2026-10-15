import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createApp } from '../app';
import { env } from '../config/env';
import { chatCompletion } from '../lib/llm-chat';
import { routeDeviationDatasetSchema, sampleDatasetSchema } from '../modules/dispute/agents/dataset';
import { analyzeRoute } from '../modules/dispute/agents/route-analysis';
import { judgeChecklist } from '../modules/dispute/agents/checklist';
import { reviewDispute } from '../modules/dispute/agents/orchestrator';
import { runRiderAdvocate } from '../modules/dispute/agents/rider-advocate';
import { runEvidenceValidationAgent } from '../modules/dispute/agents/evidence-validation-agent';
import { runPrioritizationAgent } from '../modules/dispute/agents/prioritization-agent';
import { formatCaseContext, sourceIndex } from '../modules/dispute/agents/shared';

jest.mock('../lib/llm-chat', () => ({ chatCompletion: jest.fn() }));
const chat = jest.mocked(chatCompletion);
const fixture = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../../frontend/public/samples/disp-003.json'), 'utf8'
));
const dataset = routeDeviationDatasetSchema.parse(fixture);

const advocate = {
  positionSummary: 'The driver left the recommended route.',
  claims: ['The rider says the driver ignored a request to return to the CTE.'],
  supportingEvidence: [{
    evidence: 'Deviation detected with no incident on the CTE', relevance: 'No exemption applies.',
    sourceRefs: ['/app_events/3'],
  }],
  adverseEvidence: [{
    evidence: 'Driver says the CTE was jammed', relevance: 'Possible exemption.',
    sourceRefs: ['/chat_logs/1'],
  }],
  policyArguments: [{
    argument: 'The deviation exceeds the 15% tolerance.',
    sourceRefs: ['/fare_policy/deviation_tolerance_pct', '/computed_route_analysis/deviation_pct'],
  }],
  missingEvidence: [],
  requestedOutcome: 'Refund S$12.40.', confidenceScore: 80,
};
const judge = {
  summary: 'Unjustified deviation; the rider is refunded the overcharge.',
  keyIssues: ['Route deviation without exemption'],
  driverPerspective: 'Claimed congestion is not supported by app records.',
  passengerPerspective: 'Asked to return to the CTE; supported by chat.',
  evidenceAnalysis: 'Metered distance is 79.6% above the recommended route.',
  policyReferences: ['Deviation tolerance 15%'],
  recommendation: 'passenger',
  recommendationReasoning: 'No exemption applies, so the refund basis applies.',
  suggestedActions: ['Refund S$12.40 to the rider.'],
  confidenceScore: 85, confidenceReasoning: 'Records agree.',
  sourceRefs: ['/computed_route_analysis/deviation_pct', '/app_events/3', '/chat_logs/2'],
  missingEvidence: [],
  checklist: judgeChecklist(dataset).map(({ id }) => ({
    id, finding: 'Recorded.', conflict: false, sourceRefs: ['/computed_route_analysis/deviation_pct'],
  })),
  resolution: {
    action: 'partial_refund', amount: '12.40', recipient: 'rider',
    basis: 'Final fare 31.40 minus upfront estimate 19.00.',
  },
  partyNotices: {
    rider: 'You will receive a S$12.40 refund because the trip went well beyond the recommended route.',
    driver: 'S$12.40 of this fare is being refunded to the rider because the route exceeded our tolerance.',
  },
};

function mockReview(judgeOutput: object = judge) {
  chat.mockResolvedValueOnce(JSON.stringify(advocate))
    .mockResolvedValueOnce(JSON.stringify(advocate))
    .mockResolvedValueOnce(JSON.stringify(judgeOutput));
}

beforeEach(() => chat.mockReset());

test('the DISP-003 sample validates as a route-deviation dataset without losing data', () => {
  expect(sampleDatasetSchema.parse(fixture)).toEqual(fixture);
  expect(Object.keys(dataset)).toEqual(expect.arrayContaining(['recommended_route', 'fare_policy']));
  expect(sampleDatasetSchema.safeParse({
    ...fixture, trip_data: { ...fixture.trip_data, rider_id: 'WRONG' },
  }).success).toBe(false);
});

test('route analysis measures deviation, stops, duration and fare from the record', () => {
  const a = analyzeRoute(dataset);
  expect(a).toMatchObject({
    deviation_pct: 79.6, extra_distance_km: 7.8, exceeds_tolerance: true,
    actual_duration_min: 39, extra_duration_min: 21,
    fare_difference: 12.4, breakdown_matches_total: true, total_matches_final_fare: true,
  });
  expect(a.unexpected_stops).toEqual([{
    from: '2026-09-20T21:31:00+08:00', to: '2026-09-20T21:34:00+08:00', minutes: 3,
    points: ['/gps_telemetry/8', '/gps_telemetry/9'],
  }]);
  expect(a.off_route_points).toBeGreaterThan(5);
  expect(a.first_off_route_point).toMatch(/^\/gps_telemetry\/\d+$/);
});

test('a fare breakdown that does not add up is reported', () => {
  const tampered = routeDeviationDatasetSchema.parse({
    ...fixture, trip_data: { ...fixture.trip_data, final_fare: 35 },
  });
  expect(analyzeRoute(tampered).total_matches_final_fare).toBe(false);
  expect(runEvidenceValidationAgent(tampered).warnings)
    .toContain('The fare breakdown does not reconcile with the charged fare.');
});

test('computed measurements are citable but kept apart from the original record', () => {
  const context = JSON.parse(formatCaseContext(dataset));
  expect(context.originalRecord).toEqual(fixture);
  expect(context.computed_route_analysis.deviation_pct).toBe(79.6);
  expect(sourceIndex(dataset)['/computed_route_analysis/deviation_pct']).toBe(79.6);
  expect(context.allowedSourceRefs).toContain('/fare_policy/deviation_tolerance_pct');
});

test('route policy arguments must cite the fare policy', async () => {
  chat.mockResolvedValue(JSON.stringify({ ...advocate, policyArguments: [
    { argument: 'Only facts', sourceRefs: ['/computed_route_analysis/deviation_pct'] },
    ...advocate.policyArguments,
  ] }));
  const result = await runRiderAdvocate(dataset);
  expect(result.mode).toBe('llm');
  expect(result.policyArguments).toEqual(advocate.policyArguments);
});

test('validation and prioritization describe the route case', () => {
  const v = runEvidenceValidationAgent(dataset);
  expect(v.checks.join(' ')).toContain('Metered distance 17.6 km vs recommended 9.8 km');
  expect(v.warnings).toEqual(expect.arrayContaining([
    expect.stringContaining('above the 15% policy tolerance'),
    expect.stringContaining('mid-trip stop'),
  ]));
  expect(runPrioritizationAgent(dataset).reasons).toContain('Standard route-deviation fare dispute queue.');
});

test('a full review returns a structured SGD resolution and a notice for each party', async () => {
  mockReview();
  const result = await reviewDispute(dataset);
  expect(result.mode).toBe('llm');
  expect(result.resolution).toEqual({
    action: 'partial_refund', amount: 12.4, currency: 'SGD', recipient: 'rider',
    basis: judge.resolution.basis,
  });
  expect(result.partyNotices).toEqual(judge.partyNotices);
  expect(result.checklist).toHaveLength(judgeChecklist(dataset).length);
  expect(result.workflowStatus).toBe('human_intervention_required');
  const judgePrompt = chat.mock.calls[2][0][0].content;
  expect(judgePrompt).toContain('31.4 SGD');
});

test.each([
  ['a refund above the disputed fare', { action: 'full_refund', amount: 50, recipient: 'rider', basis: 'x' }],
  ['no_action that moves money', { action: 'no_action', amount: 5, recipient: 'none', basis: 'x' }],
  ['a refund without a recipient', { action: 'partial_refund', amount: 5, recipient: 'none', basis: 'x' }],
])('the Judge is rejected for %s', async (_label, resolution) => {
  mockReview({ ...judge, resolution });
  expect(await reviewDispute(dataset)).toMatchObject({
    mode: 'fallback', recommendation: 'inconclusive', resolution: { action: 'no_action', amount: 0 },
  });
});

test('an inconclusive ruling cannot order a refund', async () => {
  mockReview({ ...judge, recommendation: 'inconclusive' });
  expect(await reviewDispute(dataset)).toMatchObject({ mode: 'fallback' });
});

test('missing party notices fail validation', async () => {
  mockReview({ ...judge, partyNotices: { rider: 'Only the rider.' } });
  expect(await reviewDispute(dataset)).toMatchObject({ mode: 'fallback' });
});

test('importing DISP-003 creates an SGD route-deviation case with computed evidence', async () => {
  const res = await request(createApp())
    .post(env.API_PREFIX + '/disputes/import-dataset').send(fixture).expect(201);
  expect(res.body.data).toMatchObject({
    caseNumber: 'DISP-003', type: 'route_deviation',
    trip: { fare: 31.4, distance: 17.6, currency: 'SGD', plateNumber: 'SKD 8812 T' },
  });
  const titles = res.body.data.evidence.map((e: { title: string }) => e.title);
  expect(titles).toEqual(expect.arrayContaining([
    'Fare breakdown', 'Fare policy', 'Route analysis (computed from GPS and fare records)',
  ]));
});
