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
import { judgeChecklist } from '../modules/dispute/agents/checklist';
import { precedentStore } from '../modules/dispute/precedents';

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
  checklist: judgeChecklist(dataset).map(({ id }) => ({
    id, finding: 'Recorded.', conflict: id === 'C2', sourceRefs: ['/trip_data/driver_wait_start'],
  })),
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

test('a policy argument citing no supplied policy is dropped, not fatal', async () => {
  chat.mockResolvedValue(JSON.stringify({ ...advocate, policyArguments: [
    { argument: 'Not a policy', sourceRefs: ['/rider_profile'] }, ...advocate.policyArguments,
  ] }));
  const result = await runRiderAdvocate(dataset);
  expect(result.mode).toBe('llm');
  expect(result.policyArguments).toEqual(advocate.policyArguments);
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
    humanOverride: { recommendation: 'driver' as const, reason: 'human', decidedAt: '2024-12-11T00:00:00Z', useAsPrecedent: true },
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

test('the Judge must answer every checklist item; its answers carry the item text', async () => {
  chat.mockResolvedValueOnce(JSON.stringify(advocate))
    .mockResolvedValueOnce(JSON.stringify(advocate))
    .mockResolvedValueOnce(JSON.stringify(judge));
  const ok = await reviewDispute(dataset);
  expect(ok.mode).toBe('llm');
  expect(ok.checklist).toHaveLength(judgeChecklist(dataset).length);
  expect(ok.checklist![1]).toMatchObject({ id: 'C2', conflict: true, item: judgeChecklist(dataset)[1].item });
  const judgeInput = JSON.parse(chat.mock.calls[2][0][1].content);
  expect(judgeInput.requiredChecklist.map((c: { id: string }) => c.id)).toEqual(judge.checklist.map((c) => c.id));

  chat.mockReset();
  chat.mockResolvedValueOnce(JSON.stringify(advocate))
    .mockResolvedValueOnce(JSON.stringify(advocate))
    .mockResolvedValueOnce(JSON.stringify({ ...judge, checklist: judge.checklist.slice(1) }));
  expect(await reviewDispute(dataset)).toMatchObject({ mode: 'fallback', recommendation: 'inconclusive' });
});

test('a flagged conflict must be listed as unresolved', async () => {
  chat.mockResolvedValueOnce(JSON.stringify(advocate))
    .mockResolvedValueOnce(JSON.stringify(advocate))
    .mockResolvedValueOnce(JSON.stringify({ ...judge, missingEvidence: [] }));
  expect(await reviewDispute(dataset)).toMatchObject({ mode: 'fallback' });
});

describe('human decisions and precedents', () => {
  const api = () => request(createApp());
  const decide = (id: string, body: object) => api().post(`${env.API_PREFIX}/disputes/${id}/override`).send(body);
  beforeEach(() => precedentStore.list().forEach((p) => precedentStore.remove(p.caseNumber)));

  test('a human can decide any case, and the decision becomes a precedent on disk', async () => {
    // case-002 has no AI review and is not escalated
    const res = await decide('case-002', { recommendation: 'passenger', reason: 'GPS shows a 5 km detour.', decidedBy: 'Lee' }).expect(200);
    expect(res.body.data).toMatchObject({ status: 'resolved', humanOverride: { recommendation: 'passenger', decidedBy: 'Lee', useAsPrecedent: true } });
    expect(precedentStore.list()).toEqual([expect.objectContaining({
      caseNumber: 'DR-2024-002', type: 'route_deviation', humanRecommendation: 'passenger', reason: 'GPS shows a 5 km detour.',
    })]);
    expect(JSON.parse(fs.readFileSync(process.env.PRECEDENTS_FILE!, 'utf8'))).toHaveLength(1);
    const listed = await api().get(env.API_PREFIX + '/disputes/precedents').expect(200);
    expect(listed.body.data[0].caseNumber).toBe('DR-2024-002');
  });

  test('a reason is required, and opting out of precedent removes it', async () => {
    await decide('case-002', { recommendation: 'driver', reason: '  ' }).expect(400);
    await decide('case-002', { recommendation: 'driver', reason: 'Navigation record supports the driver.' }).expect(200);
    expect(precedentStore.list()).toHaveLength(1);
    await decide('case-002', { recommendation: 'driver', reason: 'Revised.', useAsPrecedent: false }).expect(200);
    expect(precedentStore.list()).toHaveLength(0);
  });

  test('the Judge sees same-type precedents but never the case under review', async () => {
    const imported = await api().post(env.API_PREFIX + '/disputes/import-dataset').send(fixture);
    await decide(imported.body.data.id, { recommendation: 'driver', reason: 'Driver waited past the threshold.' }).expect(200);
    precedentStore.upsert({ ...precedentStore.list()[0], caseNumber: 'DISP-OLD', reason: 'Earlier no-show ruling.' });
    precedentStore.upsert({ ...precedentStore.list()[0], caseNumber: 'ROUTE-1', type: 'route_deviation', reason: 'Other type.' });

    chat.mockResolvedValueOnce(JSON.stringify(advocate))
      .mockResolvedValueOnce(JSON.stringify(advocate))
      .mockResolvedValueOnce(JSON.stringify(judge));
    const result = await reviewDispute(dataset);
    const judgeInput = JSON.parse(chat.mock.calls[2][0][1].content);
    expect(judgeInput.humanPrecedents.map((p: { caseNumber: string }) => p.caseNumber)).toEqual(['DISP-OLD']);
    expect(result.precedentsUsed).toEqual(['DISP-OLD']);
    // Advocates get no precedents
    expect(JSON.parse(chat.mock.calls[0][0][1].content).humanPrecedents).toBeUndefined();
  });

  test('a new AI review does not overturn a human decision; withdrawing it reopens the case', async () => {
    await decide('case-003', { recommendation: 'shared', reason: 'Both parties contributed.' }).expect(200);
    chat.mockRejectedValue(new Error('Unavailable'));
    const reviewed = await api().post(`${env.API_PREFIX}/disputes/case-003/review`).send({}).expect(200);
    expect(reviewed.body.data).toMatchObject({ status: 'resolved', humanOverride: { recommendation: 'shared' } });

    const withdrawn = await api().delete(`${env.API_PREFIX}/disputes/case-003/override`).expect(200);
    expect(withdrawn.body.data.humanOverride).toBeUndefined();
    expect(withdrawn.body.data.status).toBe('pending');
    expect(precedentStore.list()).toHaveLength(0);
  });

  test('deleting a precedent unmarks the case decision', async () => {
    await decide('case-002', { recommendation: 'passenger', reason: 'Detour.' }).expect(200);
    await api().delete(env.API_PREFIX + '/disputes/precedents/DR-2024-002').expect(204);
    await api().delete(env.API_PREFIX + '/disputes/precedents/DR-2024-002').expect(404);
    expect(disputeStore.getById('case-002')!.humanOverride!.useAsPrecedent).toBe(false);
  });
});
