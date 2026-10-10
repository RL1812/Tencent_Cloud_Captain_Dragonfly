import type { DisputePriority } from '../types';
import type { AgentInput, PriorityAssessment } from './contracts';
import { validateInput } from './shared';

const responseMinutes: Record<DisputePriority, number> = {
  urgent: 15,
  high: 60,
  medium: 240,
  low: 1440,
};

const rank: Record<DisputePriority, number> = { low: 0, medium: 1, high: 2, urgent: 3 };

function higher(a: DisputePriority, b: DisputePriority): DisputePriority {
  return rank[a] >= rank[b] ? a : b;
}

/**
 * Deterministic intake agent. It deliberately avoids an LLM call so queue order
 * remains explainable and available when a model provider is down.
 */
export function runPrioritizationAgent(input: AgentInput): PriorityAssessment {
  const record = validateInput(input);
  const text = JSON.stringify(record).toLowerCase();
  const reasons: string[] = [];
  let priority: DisputePriority = 'medium';

  if (!('dispute_ticket' in record)) {
    priority = record.priority;
    reasons.push(`Submitted priority is ${record.priority}.`);
    if (record.type === 'safety_accident') {
      priority = higher(priority, 'urgent');
      reasons.push('Safety incidents receive immediate review.');
    } else if (record.type === 'property_damage') {
      priority = higher(priority, 'high');
      reasons.push('Property-damage claims require accelerated evidence preservation.');
    }
  } else {
    reasons.push('Standard no-show fee dispute queue.');
    if (record.rider_profile.fraud_flags > 0 || record.driver_profile.fraud_flags > 0) {
      priority = 'high';
      reasons.push('An account risk flag requires additional review.');
    }
  }

  if (/injur|assault|threat|unsafe|danger|emergency|accident|weapon/.test(text)) {
    priority = 'urgent';
    reasons.push('Potential immediate safety risk detected in the case record.');
  }

  const score = { low: 20, medium: 50, high: 75, urgent: 100 }[priority];
  return {
    agent: 'prioritization_agent',
    priority,
    score,
    reasons: [...new Set(reasons)],
    targetResponseMinutes: responseMinutes[priority],
    assessedAt: new Date().toISOString(),
  };
}
