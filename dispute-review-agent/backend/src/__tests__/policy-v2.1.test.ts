import fs from 'fs';
import path from 'path';
import {
  fareDisputeDatasetSchema,
  noShowDatasetSchema,
  sampleDatasetSchema,
  structuredRouteDeviationDatasetSchema,
} from '../modules/dispute/agents/dataset';
import { runEscalationAgent } from '../modules/dispute/agents/escalation-agent';
import { assessStructuredPolicy, RYDE_POLICY_V2_1 } from '../modules/dispute/agents/policy';
import { formatCaseContext } from '../modules/dispute/agents/shared';
import { datasetToCreateDTO } from '../modules/dispute/import-dataset';
import { disputeStore } from '../modules/dispute/store';

const root = path.resolve(__dirname, '../../../../reference');

function jsonFromMarkdown(file: string): unknown {
  const markdown = fs.readFileSync(path.join(root, file), 'utf8');
  const match = markdown.match(/```json\s*([\s\S]*?)```/i);
  if (!match) throw new Error(`${file} has no fenced JSON block`);
  return JSON.parse(match[1]);
}

const noShowRaw = jsonFromMarkdown('RydeResolve Sample Dataset — DISP-002 No-Show Charge Dispute (SG).md');
const routeRaw = jsonFromMarkdown('RydeResolve Route Deviation Dataset — DISP-001.md');
const fareRaw = jsonFromMarkdown('Document 1 — Fare Dispute Sample Data (JSON).md');

const noShow = noShowDatasetSchema.parse(noShowRaw);
const route = structuredRouteDeviationDatasetSchema.parse(routeRaw);
const fare = fareDisputeDatasetSchema.parse(fareRaw);

const completedReview = {
  mode: 'llm' as const,
  recommendation: 'passenger' as const,
  confidenceScore: 99,
};

test('the machine-readable policy matches the controlling v2.1 document', () => {
  const markdown = fs.readFileSync(
    path.join(root, 'Document 2 — Ryde Dispute Resolution Policy v2.1 (Markdown).md'),
    'utf8'
  );
  expect(RYDE_POLICY_V2_1).toMatchObject({
    version: '2.1', effective_date: '2026-01-01',
    no_show: { free_wait_time_min: 5, cancellation_fee: 5 },
    route_deviation: { distance_tolerance_km: 1, human_review_above_km: 2 },
    ruling_thresholds: { fraud_flag_confidence_required: 95 },
  });
  expect(markdown).toContain('**Effective Date:** 1 January 2026');
  expect(markdown).toContain('At least 1 in-app chat message');
  expect(markdown).toContain('At least 1 phone call');
});

test('all three supplied sample datasets validate under the revised schema', () => {
  expect(sampleDatasetSchema.parse(noShowRaw).dispute_ticket.dispute_id).toBe('DISP-002');
  expect(sampleDatasetSchema.parse(routeRaw).dispute_ticket.dispute_id).toBe('DISP-001');
  expect(sampleDatasetSchema.parse(fareRaw).dispute_ticket.dispute_id).toBe('DISP-003');
});

test('the route document answer key is never included in agent context', () => {
  expect('recommended_ruling' in route).toBe(false);
  const context = JSON.parse(formatCaseContext(route));
  expect(context.originalRecord.recommended_ruling).toBeUndefined();
  expect(context.applicable_policy.version).toBe('2.1');
  expect(context.allowedSourceRefs).toContain('/applicable_policy/route_deviation/distance_tolerance_km');
});

test('Policy v2.1 produces the expected structured outcomes from evidence, not answer prose', () => {
  expect(assessStructuredPolicy(noShow)).toMatchObject({
    action: 'no_action', amount: 0, recipient: 'none',
  });
  expect(assessStructuredPolicy(route)).toMatchObject({
    action: 'partial_refund', amount: 3.44, recipient: 'rider',
  });
  expect(assessStructuredPolicy(fare)).toMatchObject({
    action: 'full_refund', amount: 4.5, recipient: 'rider',
  });
});

test('Policy v2.1 escalation thresholds are applied to the supplied samples', () => {
  expect(runEscalationAgent(completedReview, route)).toMatchObject({
    needsHuman: true, confidenceThreshold: 80,
  });
  expect(runEscalationAgent({ ...completedReview, confidenceScore: 10 }, fare)).toMatchObject({
    needsHuman: false, confidenceThreshold: 0,
  });
  expect(runEscalationAgent({ ...completedReview, confidenceScore: 94 }, noShow)).toMatchObject({
    needsHuman: true, confidenceThreshold: 95,
  });
  const propertyDamage = runEscalationAgent(completedReview, {
    ...disputeStore.getById('case-003')!, type: 'property_damage',
  });
  expect(propertyDamage).toMatchObject({ needsHuman: true, confidenceThreshold: 100 });
  expect(propertyDamage.triggers).toEqual(expect.arrayContaining([
    expect.stringContaining('property-damage'),
  ]));
});

test('the new route and fare samples can be imported into dashboard cases', () => {
  expect(datasetToCreateDTO(route)).toMatchObject({
    type: 'route_deviation',
    trip: { fare: 35, distance: 24.8, currency: 'SGD' },
  });
  expect(datasetToCreateDTO(fare)).toMatchObject({
    type: 'fare_dispute',
    trip: { fare: 16.5, currency: 'SGD' },
  });
});
