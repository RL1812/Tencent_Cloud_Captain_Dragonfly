import type { AgentInput, EvidenceValidation } from './contracts';
import { validateInput } from './shared';

/** Checks structural usability before the advocates run. Limited evidence is surfaced, not hidden. */
export function runEvidenceValidationAgent(input: AgentInput): EvidenceValidation {
  const record = validateInput(input);
  const checks: string[] = ['Record schema and linked party/trip identifiers are valid.'];
  const warnings: string[] = [];
  let evidenceItemCount = 0;

  if ('dispute_ticket' in record) {
    evidenceItemCount = record.gps_telemetry.length + record.chat_logs.length + record.app_events.length;
    checks.push('GPS telemetry, chat logs, app events, and cancellation policy are available to cite.');
    if (record.gps_telemetry.length === 0) warnings.push('No GPS telemetry was supplied.');
    if (record.chat_logs.length === 0) warnings.push('No chat or call records were supplied.');
    if (record.app_events.length === 0) warnings.push('No app event records were supplied.');
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
