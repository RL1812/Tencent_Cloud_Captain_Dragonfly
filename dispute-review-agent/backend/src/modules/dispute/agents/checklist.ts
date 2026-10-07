import type { DisputeType } from '../types';
import type { AgentInput } from './contracts';

/**
 * Points the Judge must address, by ID, before ruling. Each answer says what the
 * record shows and whether sources conflict, so known weak spots (such as the
 * DISP-002 wait-start ambiguity) are covered on every review, not by chance.
 */
export interface ChecklistItem {
  id: string;
  item: string;
}

const COMMON = [
  'Conflicts between party statements and system records (GPS, app events, logs)',
  'Timestamp conflicts between any two sources',
];

const BY_TYPE: Record<DisputeType, string[]> = {
  no_show_charge: [
    'Driver arrival time compared with the scheduled pickup time',
    'Wait start under each possible basis (driver arrival, scheduled pickup, app timer start), and whether the supplied policy says which applies',
    'Elapsed wait at cancellation computed from each of those start times, compared with the policy thresholds; conflict = true if the bases lead to different outcomes',
    'Contact attempts by the driver and responses by the rider',
    'Evidence of where the rider actually was',
  ],
  route_deviation: [
    'Actual route compared with the recommended route',
    'Fare and distance compared with what the trip normally costs',
    'Whether the rider agreed to any route change',
  ],
  property_damage: [
    'Evidence that the damage happened during this trip',
    'Extent and cost of the damage, and what supports the amount',
  ],
  safety_accident: [
    'Sequence of events according to the records',
    'Which safety rule was breached, and by whom',
    'Whether ending the trip or other action taken was proportionate',
  ],
};

export function disputeType(input: AgentInput): DisputeType {
  return 'dispute_ticket' in input ? input.dispute_ticket.dispute_type : input.type;
}

export function judgeChecklist(input: AgentInput): ChecklistItem[] {
  return [...BY_TYPE[disputeType(input)], ...COMMON].map((item, i) => ({ id: `C${i + 1}`, item }));
}
