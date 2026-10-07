import fs from 'fs';
import path from 'path';
import { sampleDatasetSchema, type SampleDataset } from '../modules/dispute/agents/dataset';
import { assertSourceRefs, formatCaseContext } from '../modules/dispute/agents/shared';

const folder = path.join(__dirname, 'fixtures/no-show');
const manifest: {
  cases: Array<{
    dispute_id: string; file: string; expected_outcome: string;
    expected_refund_amount: number | null; evidence_refs: string[];
  }>;
} = JSON.parse(fs.readFileSync(path.join(folder, 'expected-results.json'), 'utf8'));
const load = (id: string): SampleDataset => JSON.parse(
  fs.readFileSync(path.join(folder, id + '.json'), 'utf8')
);
const seconds = (end: string, start: string) => (Date.parse(end) - Date.parse(start)) / 1000;

test('exactly ten unique complete input records with separate answer keys', () => {
  const files = fs.readdirSync(folder).filter((name) => /^DISP-\d{3}\.json$/.test(name));
  expect(files.sort()).toEqual(manifest.cases.map((c) => c.file).sort());
  expect(files).toHaveLength(10);
  for (const select of [
    (d: SampleDataset) => d.dispute_ticket.dispute_id,
    (d: SampleDataset) => d.trip_data.trip_id,
    (d: SampleDataset) => d.rider_profile.rider_id,
    (d: SampleDataset) => d.driver_profile.driver_id,
  ]) {
    expect(new Set(manifest.cases.map((c) => select(load(c.dispute_id)))).size).toBe(10);
  }
});

test.each(manifest.cases)('$dispute_id validates, keeps all input data, and resolves rubric references', (entry) => {
  const raw = load(entry.dispute_id);
  const parsed = sampleDatasetSchema.parse(raw);
  // No unknown answer-key fields silently stripped by the schema.
  expect(parsed).toEqual(raw);
  expect(Object.keys(parsed)).toHaveLength(8);
  expect(parsed.dispute_ticket.dispute_id).toBe(entry.dispute_id);
  expect(() => assertSourceRefs(entry.evidence_refs, parsed)).not.toThrow();
  const context = JSON.parse(formatCaseContext(parsed));
  expect(context.originalRecord).toEqual(raw);
  expect(context.originalRecord).not.toHaveProperty('expected_outcome');
  expect(context.originalRecord).not.toHaveProperty('expected_recommendation');
  for (const records of [parsed.gps_telemetry, parsed.chat_logs, parsed.app_events]) {
    const times = records.map((r) => Date.parse(r.timestamp));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  }
  expect(Date.parse(parsed.dispute_ticket.filed_at)).toBeGreaterThan(
    Date.parse(parsed.trip_data.cancellation_time)
  );
  if (entry.expected_refund_amount !== null) {
    expect(entry.expected_refund_amount).toBeGreaterThanOrEqual(0);
    expect(entry.expected_refund_amount).toBeLessThanOrEqual(parsed.trip_data.cancellation_fee);
  }
});

test('clear wait and exact boundary scenarios have the intended elapsed seconds', () => {
  for (const [id, elapsed] of [
    ['DISP-003', 480], ['DISP-004', 240], ['DISP-010', 480], ['DISP-012', 479],
  ] as const) {
    const { trip_data: trip } = load(id);
    expect(seconds(trip.cancellation_time, trip.driver_wait_start)).toBe(elapsed);
  }
  expect(load('DISP-003').driver_profile.avg_rating)
    .toBeLessThan(load('DISP-003').rider_profile.avg_rating);
});

test('wrong-location and early-departure evidence remains distinguishable', () => {
  const wrong = load('DISP-005');
  expect(wrong.gps_telemetry.every((g) =>
    g.lat === wrong.trip_data.dropoff_location.lat &&
    g.lng === wrong.trip_data.dropoff_location.lng)).toBe(true);
  expect(wrong.trip_data.pickup_location.lat).not.toBe(wrong.trip_data.dropoff_location.lat);
  const left = load('DISP-011');
  expect(left.gps_telemetry.some((g) => g.status === 'waiting' && g.speed_kmh === 0)).toBe(true);
  expect(left.gps_telemetry.at(-1)!.speed_kmh).toBeGreaterThan(0);
  expect(left.chat_logs.some((c) => c.content.includes('have left'))).toBe(true);
});

test('ambiguous timer fixtures retain the evidence conflicts', () => {
  const early = load('DISP-006').trip_data;
  expect(seconds(early.cancellation_time, early.driver_wait_start)).toBe(480);
  expect(seconds(early.cancellation_time, early.scheduled_time)).toBe(360);
  const conflicting = load('DISP-009');
  const timer = conflicting.app_events.find((e) => e.event_type === 'wait_timer_started')!;
  expect(seconds(conflicting.trip_data.cancellation_time, timer.timestamp)).toBe(360);
  expect(seconds(conflicting.trip_data.cancellation_time, conflicting.trip_data.driver_wait_start)).toBe(480);
});

test('excess fee, missing evidence and rider admission match their scenarios', () => {
  const excess = load('DISP-007');
  expect(excess.trip_data.cancellation_fee - excess.cancellation_policy.cancellation_fee_after_wait).toBe(5);
  const missing = load('DISP-008');
  expect(missing.gps_telemetry).toEqual([]);
  expect(missing.chat_logs).toEqual([]);
  expect(missing.app_events.some((e) => e.event_type === 'driver_arrived')).toBe(false);
  expect(load('DISP-010').chat_logs.some(
    (c) => c.sender === 'rider' && c.content.includes('still at home')
  )).toBe(true);
});
