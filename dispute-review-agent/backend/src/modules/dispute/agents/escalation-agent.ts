import type { AgentInput, EscalationDecision, JudgeReview } from './contracts';
import {
  isFareDisputeDataset,
  isLegacyRouteDeviationDataset,
  isNoShowDataset,
  isStructuredRouteDeviationDataset,
} from './dataset';
import { RYDE_POLICY_V2_1 } from './policy';

/** Below this Judge confidence, the case must be decided by a human reviewer. */
export const ESCALATION_THRESHOLD = 60;

export function runEscalationAgent<T extends Pick<JudgeReview, 'mode' | 'recommendation' | 'confidenceScore'>>(
  review: T,
  input?: AgentInput,
  defaultThreshold = ESCALATION_THRESHOLD
): EscalationDecision {
  const triggers: string[] = [];
  let threshold = defaultThreshold;

  // A provider/validation failure is retryable and is not treated as a merits escalation.
  if (review.mode !== 'fallback') {
    if (review.recommendation === 'inconclusive') triggers.push('Judge recommendation is inconclusive.');

    if (input) {
      const type = 'dispute_ticket' in input ? input.dispute_ticket.dispute_type : input.type;
      const fraudFlags = 'dispute_ticket' in input
        ? input.rider_profile.fraud_flags + input.driver_profile.fraud_flags
        : 0;

      if (type === 'safety_accident') {
        triggers.push('Safety incidents always require human review under Policy v2.1 §5.');
      } else if (isLegacyRouteDeviationDataset(input)) {
        const deviationKm = input.trip_data.actual_distance_km - input.recommended_route.distance_km;
        threshold = 80;
        if (deviationKm > RYDE_POLICY_V2_1.route_deviation.human_review_above_km) {
          triggers.push(`Route deviation ${deviationKm.toFixed(1)} km exceeds the 2 km human-review threshold.`);
        }
      } else if (isStructuredRouteDeviationDataset(input)) {
        const deviationKm = input.trip_data.actual_distance_km - input.trip_data.estimated_distance_km;
        threshold = 80;
        if (deviationKm > RYDE_POLICY_V2_1.route_deviation.human_review_above_km) {
          triggers.push(`Route deviation ${deviationKm.toFixed(1)} km exceeds the 2 km human-review threshold.`);
        }
      } else {
        const value = isNoShowDataset(input)
          ? input.trip_data.cancellation_fee
          : isFareDisputeDataset(input)
            ? Math.abs(input.trip_data.fare_difference)
            : input.trip.fare;
        threshold = value < 10 ? 0 : value <= 50 ? 80 : 100;
        if (value > 50) triggers.push(`Dispute value SGD ${value.toFixed(2)} exceeds the SGD 50 automatic-ruling limit.`);
      }

      if (fraudFlags > 0) {
        threshold = Math.max(threshold, RYDE_POLICY_V2_1.ruling_thresholds.fraud_flag_confidence_required);
      }
    }

    if (review.confidenceScore < threshold) {
      triggers.push(`Judge confidence ${review.confidenceScore}% is below the ${threshold}% threshold.`);
    }
  }

  return {
    agent: 'escalation_agent',
    needsHuman: triggers.length > 0,
    reason:
      review.mode === 'fallback'
        ? 'AI review did not complete. Retry the review before escalating on the merits.'
        : triggers.join(' ') || 'Judge confidence meets the automated-resolution threshold.',
    triggers,
    confidenceThreshold: threshold,
    evaluatedAt: new Date().toISOString(),
  };
}
