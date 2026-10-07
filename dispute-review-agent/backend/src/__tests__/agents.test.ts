import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createApp } from '../app';
import { env } from '../config/env';
import { disputeStore } from '../modules/dispute/store';
import { chatCompletion } from '../lib/llm-chat';
import { sampleDatasetSchema } from '../modules/dispute/agents/dataset';
import { runRiderAdvocate } from '../modules/dispute/agents/rider-advocate';
import { reviewDispute } from '../modules/dispute/agents/orchestrator';
import { formatCaseContext, parseJsonObject, sourceIndex } from '../modules/dispute/agents/shared';

jest.mock('../lib/llm-chat', () => ({ chatCompletion: jest.fn() }));
const chat = jest.mocked(chatCompletion);
const markdown = fs.readFileSync(path.resolve(__dirname,
  '../../../../RydeResolve Sample Dataset — DISP-002 No-Show Charge Dispute (SG).md'), 'utf8');
const fixture = JSON.parse(markdown.match(/```json\s*([\s\S]*?)```/)![1]);
const dataset = sampleDatasetSchema.parse(fixture);

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
};

beforeEach(() => chat.mockReset());

test('sample JSON preserves all eight sections and excludes expected-ruling prose', () => {
  expect(dataset).toEqual(fixture);
  expect(Object.keys(dataset)).toHaveLength(8);
  const context = JSON.parse(formatCaseContext(dataset));
  expect(context.originalRecord).toEqual(fixture);
  expect(JSON.stringify(context)).not.toContain('Expected ruling');
  expect(sourceIndex(dataset)['/gps_telemetry/4']).toEqual(fixture.gps_telemetry[4]);
  expect(sourceIndex(dataset)['/app_events/5/timestamp']).toBe('2026-09-13T08:43:10+08:00');
});

test('invalid coordinates, IDs and timestamp formats are rejected before model calls', () => {
  expect(sampleDatasetSchema.safeParse({
    ...fixture, trip_data: { ...fixture.trip_data, trip_id: 'WRONG' },
  }).success).toBe(false);
  expect(sampleDatasetSchema.safeParse({
    ...fixture, gps_telemetry: [{ ...fixture.gps_telemetry[0], lat: 100 }],
  }).success).toBe(false);
  expect(sampleDatasetSchema.safeParse({
    ...fixture, trip_data: { ...fixture.trip_data, cancellation_time: 'yesterday' },
  }).success).toBe(false);
});

test('a policy argument may cite the facts it applies the policy to', async () => {
  chat.mockResolvedValue(JSON.stringify({ ...advocate, policyArguments: [{
    argument: 'Wait exceeded the threshold.',
    sourceRefs: ['/cancellation_policy/no_show_threshold_min', '/trip_data/driver_wait_start'],
  }], confidenceScore: 72.6 }));
  expect(await runRiderAdvocate(dataset)).toMatchObject({ mode: 'llm', confidenceScore: 73 });
});

test('valid advocate output has role, dispute ID, provenance and evidence references', async () => {
  chat.mockResolvedValue(JSON.stringify(advocate));
  const result = await runRiderAdvocate(dataset);
  expect(result).toMatchObject({ agent: 'rider_advocate', disputeId: 'DISP-002', mode: 'llm' });
  expect(result.adverseEvidence[0].sourceRefs).toEqual(['/gps_telemetry/4']);
});

test.each([
  { ...advocate, supportingEvidence: [{ ...advocate.supportingEvidence[0], sourceRefs: ['/invented'] }] },
  { ...advocate, confidenceScore: 101 },
  { ...advocate, policyArguments: [{ argument: 'Not a policy', sourceRefs: ['/rider_profile'] }] },
  {},
])('invalid model output yields an explicit fallback', async (output) => {
  chat.mockResolvedValue(JSON.stringify(output));
  expect(await runRiderAdvocate(dataset)).toMatchObject({ mode: 'fallback', confidenceScore: 0 });
});

test('both advocates receive full records and the Judge receives both validated submissions', async () => {
  chat.mockResolvedValueOnce(JSON.stringify(advocate))
    .mockResolvedValueOnce(JSON.stringify(advocate))
    .mockResolvedValueOnce(JSON.stringify(judge));
  const result = await reviewDispute(dataset);
  expect(chat).toHaveBeenCalledTimes(3);
  for (const call of chat.mock.calls.slice(0, 2)) {
    expect(JSON.parse(call[0][1].content).originalRecord).toEqual(dataset);
  }
  const judgeInput = JSON.parse(chat.mock.calls[2][0][1].content);
  expect(judgeInput.riderAdvocateSubmission.agent).toBe('rider_advocate');
  expect(judgeInput.driverAdvocateSubmission.agent).toBe('driver_advocate');
  expect(result.advocateSubmissions.rider.disputeId).toBe('DISP-002');
  expect(result.sourceRefs).toEqual(judge.sourceRefs);
});

test('model failure produces no ratings-based ruling and skips the Judge call', async () => {
  chat.mockRejectedValue(new Error('No API key'));
  const result = await reviewDispute(dataset);
  expect(chat).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({ mode: 'fallback', recommendation: 'inconclusive', confidenceScore: 0 });
});

test('Judge citations absent from the record are rejected', async () => {
  chat.mockResolvedValueOnce(JSON.stringify(advocate))
    .mockResolvedValueOnce(JSON.stringify(advocate))
    .mockResolvedValueOnce(JSON.stringify({ ...judge, sourceRefs: ['/not-in-record'] }));
  expect(await reviewDispute(dataset)).toMatchObject({ mode: 'fallback', recommendation: 'inconclusive' });
});

test('dataset endpoint accepts the raw JSON and returns both submissions', async () => {
  chat.mockResolvedValueOnce(JSON.stringify(advocate))
    .mockResolvedValueOnce(JSON.stringify(advocate))
    .mockResolvedValueOnce(JSON.stringify(judge));
  const response = await request(createApp())
    .post(env.API_PREFIX + '/disputes/dataset-review').send(fixture).expect(200);
  expect(response.body.data.disputeId).toBe('DISP-002');
  expect(response.body.data.advocateSubmissions.driver.agent).toBe('driver_advocate');
});

test('importing the same dataset twice returns the existing case', async () => {
  const app = createApp();
  const first = await request(app).post(env.API_PREFIX + '/disputes/import-dataset').send(fixture).expect(201);
  const again = await request(app).post(env.API_PREFIX + '/disputes/import-dataset').send(fixture).expect(200);
  expect(first.body.existing).toBe(false);
  expect(again.body).toMatchObject({ existing: true, data: { id: first.body.data.id, caseNumber: 'DISP-002' } });
});

test('dataset endpoint rejects invalid records before calling any model', async () => {
  await request(createApp()).post(env.API_PREFIX + '/disputes/dataset-review')
    .send({ ...fixture, gps_telemetry: 'not an array' }).expect(400);
  expect(chat).not.toHaveBeenCalled();
});

test('legacy review remains compatible and failed analysis leaves the case pending', async () => {
  chat.mockRejectedValue(new Error('Unavailable'));
  const response = await request(createApp())
    .post(env.API_PREFIX + '/disputes/case-002/review').send({}).expect(200);
  expect(response.body.data.status).toBe('pending');
  expect(response.body.data.review.mode).toBe('fallback');
  const legacy = disputeStore.getById('case-002')!;
  expect(JSON.parse(formatCaseContext(legacy)).originalRecord.review).toBeUndefined();
});

test('prior rulings, escalations and human decisions are hidden from the agents', () => {
  const decided = {
    ...disputeStore.getById('case-001')!,
    escalation: { needsHuman: false, reason: 'decided' },
    humanOverride: { recommendation: 'driver' as const, reason: 'human', decidedAt: '2024-12-11T00:00:00Z' },
  };
  const context = JSON.parse(formatCaseContext(decided));
  for (const key of ['review', 'escalation', 'humanOverride', 'dataset']) {
    expect(context.originalRecord[key]).toBeUndefined();
    expect(context.allowedSourceRefs.some((ref: string) => ref.startsWith('/' + key))).toBe(false);
  }
  expect(context.originalRecord.driver.name).toBe(decided.driver.name);
});

test('model JSON is parsed from a code fence or surrounding prose', () => {
  expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  expect(parseJsonObject('Here is the ruling:\n```json\n{"a":1}\n```\nDone.')).toEqual({ a: 1 });
  expect(parseJsonObject('Sure. {"a":{"b":2}} Hope this helps.')).toEqual({ a: { b: 2 } });
  expect(() => parseJsonObject('no json here')).toThrow();
});
