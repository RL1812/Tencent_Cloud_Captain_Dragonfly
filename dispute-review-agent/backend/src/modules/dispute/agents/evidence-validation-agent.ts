import type { AgentInput, EvidenceValidation } from './contracts';
import {
  isFareDisputeDataset,
  isLegacyRouteDeviationDataset,
  isNoShowDataset,
  isRouteDeviationDataset,
} from './dataset';
import { analyzeRoute } from './route-analysis';
import { validateInput } from './shared';

/** Checks structural usability before the advocates run. Limited evidence is surfaced, not hidden. */
export function runEvidenceValidationAgent(input: AgentInput): EvidenceValidation {
  const record = validateInput(input);
  const checks: string[] = ['Record schema and linked party/trip identifiers are valid.'];
  const warnings: string[] = [];
  let evidenceItemCount = 0;

  if ('dispute_ticket' in record) {
    evidenceItemCount = record.gps_telemetry.length + record.chat_logs.length + record.app_events.length;
    if (record.gps_telemetry.length === 0) warnings.push('No GPS telemetry was supplied.');
    if (record.chat_logs.length === 0) warnings.push('No chat or call records were supplied.');
    if (record.app_events.length === 0) warnings.push('No app event records were supplied.');
  }

  if (isRouteDeviationDataset(record)) {
    checks.push('GPS telemetry, recommended route, fare breakdown, chat logs, app events, and fare policy are available to cite.');
    const analysis = analyzeRoute(record);
    checks.push(...analysis.findings);
    if (analysis.exceeds_tolerance) {
      warnings.push(isLegacyRouteDeviationDataset(record)
        ? `Route is ${analysis.deviation_pct}% longer than recommended, above the ${analysis.tolerance_pct}% policy tolerance.`
        : `Route is ${analysis.extra_distance_km} km longer than recommended, above the 1 km Policy v2.1 tolerance.`);
    }
    if (analysis.unexpected_stops.length) warnings.push(`${analysis.unexpected_stops.length} unexplained mid-trip stop(s) in the GPS track.`);
    if (!analysis.breakdown_matches_total || !analysis.total_matches_final_fare) {
      warnings.push('The fare breakdown does not reconcile with the charged fare.');
    }
  } else if (isFareDisputeDataset(record)) {
    checks.push('Upfront quote, final fare, surge-pricing log, chat, GPS, and Policy v2.1 are available to cite.');
    if (record.surge_pricing_log.trip_start_surge > record.surge_pricing_log.quote_time_surge &&
        !record.surge_pricing_log.rider_notified) {
      warnings.push('The surge multiplier increased after quote without a recorded rider notification.');
    }
  } else if (isNoShowDataset(record)) {
    checks.push('GPS telemetry, chat logs, app events, and cancellation policy are available to cite.');
    if (record.trip_data.driver_wait_start !== record.trip_data.driver_arrival_time) {
      warnings.push('Driver arrival and recorded wait-start timestamps differ.');
    }
    const timerStart = record.app_events.find((event) => event.event_type === 'wait_timer_started');
    if (timerStart && timerStart.timestamp !== record.trip_data.driver_wait_start) {
      warnings.push('The app wait-timer event conflicts with the trip wait-start timestamp.');
    }
  } else {
    evidenceItemCount = record.evidence.length;
    checks.push('Case parties, trip information, and evidence entries are structurally available.');
    if (record.evidence.length === 0) warnings.push('No supporting evidence has been uploaded.');
    if (!record.evidence.some((item) => item.party === 'platform')) {
      warnings.push('No independent platform record is present.');
    }
    if (!record.driver.statement.trim()) warnings.push('Driver statement is missing.');
    if (!record.passenger.statement.trim()) warnings.push('Rider statement is missing.');
  }

  return {
    agent: 'evidence_validation_agent',
    status: evidenceItemCount > 0 ? 'ready' : 'limited',
    evidenceItemCount,
    checks,
    warnings,
    validatedAt: new Date().toISOString(),
  };
}
