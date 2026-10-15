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
    'Whether the driver waited at least five minutes from the scheduled pickup time before cancelling',
    'Whether the driver made both required contact attempts: at least one in-app message and one in-app call',
    'Evidence that the driver waited at the booked pickup location',
    'Whether the fixed SGD 5 fee was applied and assigned to the correct recipient',
  ],
  route_deviation: [
    'Actual route compared with the recommended route, including the excess distance in kilometres',
    'Whether traffic or a road closure justifies the deviation using contemporaneous traffic evidence',
    'Whether the driver informed the rider before or at the deviation, and whether the rider acknowledged it',
    'Whether the deviation exceeds the one-kilometre refund tolerance or two-kilometre human-review threshold',
    'Excess distance fare refundable under Policy v2.1, with the calculation',
  ],
  fare_dispute: [
    'Upfront quote compared with the actual fare and the exact disputed difference',
    'Surge multiplier at quote time compared with the multiplier at trip start',
    'Whether the rider received the required surge-change notification before or at pickup',
    'Whether the booking fee remained surge-exempt',
    'Refundable surge differential under Policy v2.1, with the calculation',
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
