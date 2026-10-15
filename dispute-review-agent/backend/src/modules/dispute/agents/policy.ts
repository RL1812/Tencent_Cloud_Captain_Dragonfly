import type { AgentInput } from './contracts';
import {
  isFareDisputeDataset,
  isNoShowDataset,
  isRouteDeviationDataset,
  isStructuredRouteDeviationDataset,
  type SampleDataset,
} from './dataset';

/** Machine-readable subset of Ryde Dispute Resolution Policy v2.1 (effective 2026-01-01). */
export const RYDE_POLICY_V2_1 = {
  version: '2.1',
  effective_date: '2026-01-01',
  currency: 'SGD',
  route_deviation: {
    notification_required: true,
    notification_timing: 'before_or_at_deviation',
    accepted_notification_methods: ['in_app_chat', 'recorded_verbal_notice'],
    distance_tolerance_km: 1,
    human_review_above_km: 2,
    justified_but_unnotified_refund: 'excess_distance_fare',
    unjustified_over_tolerance_refund: 'excess_distance_fare',
  },
  no_show: {
    free_wait_time_min: 5,
    cancellation_fee: 5,
    fee_recipient: 'driver',
    required_contact_attempts: { in_app_messages: 1, in_app_calls: 1 },
    driver_arrival_grace_min: 5,
    driver_no_show_goodwill_credit: 5,
    repeat_no_show_review_count: 3,
    repeat_no_show_window_days: 30,
  },
  fare_and_surge: {
    upfront_quote_binding: true,
    surge_increase_notification_required: true,
    notification_must_include: ['new_multiplier', 'revised_estimated_fare', 'free_cancellation_option'],
    unnotified_surge_refund: 'actual_fare_minus_upfront_quote',
    surge_exempt_components: ['booking_fee'],
  },
  property_damage: {
    photo_deadline_hours: 24,
    photos_must_use_in_app_camera: true,
    cleaning_fee_cap: 50,
    repair_quote_deadline_days: 7,
    disputed_claim_requires_human_review: true,
  },
  safety: {
    always_human_review: true,
    ai_may_prepare_case_only: true,
    ai_may_issue_ruling: false,
  },
  ruling_thresholds: {
    under_10: { confidence_required: 0 },
    from_10_through_50: { confidence_required: 80 },
    above_50: { always_human_review: true },
    fraud_flag_confidence_required: 95,
  },
} as const;

export type PolicyAssessment = {
  action: 'full_refund' | 'partial_refund' | 'no_action';
  amount: number;
  recipient: 'rider' | 'none';
  basis: string;
  sourceRefs: string[];
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** Policy supplied to the agents, separate from untrusted case data. */
export function applicablePolicy(_input: AgentInput): typeof RYDE_POLICY_V2_1 {
  return RYDE_POLICY_V2_1;
}

/** Deterministic checks for cases whose v2.1 outcome is fully specified by structured fields. */
export function assessStructuredPolicy(input: SampleDataset): PolicyAssessment | null {
  if (isNoShowDataset(input)) {
    const scheduled = Date.parse(input.trip_data.scheduled_time);
    const arrived = Date.parse(input.trip_data.driver_arrival_time);
    const cancelled = Date.parse(input.trip_data.cancellation_time);
    const fiveMinutes = RYDE_POLICY_V2_1.no_show.free_wait_time_min * 60_000;
    const arrivedInTime = arrived <= scheduled + fiveMinutes;
    const waitedLongEnough = cancelled >= scheduled + fiveMinutes;
    const arrivalConfirmedAtPickup = input.app_events.some((event) =>
      event.event_type === 'driver_arrived' && /pickup|within\s+\d+\s*m/i.test(event.details)
    );
    const sentMessage = input.chat_logs.some((entry) => entry.sender === 'driver' && entry.type === 'message');
    const madeCall = input.chat_logs.some((entry) => entry.sender === 'driver' && entry.type === 'call');
    const fee = roundMoney(input.trip_data.cancellation_fee);
    if (!arrivedInTime || !arrivalConfirmedAtPickup || !waitedLongEnough || !sentMessage || !madeCall) {
      return {
        action: 'full_refund', amount: fee, recipient: 'rider',
        basis: 'The no-show fee is void because the driver did not satisfy every arrival, wait, and contact condition in Policy v2.1 §2.',
        sourceRefs: [
          '/trip_data/scheduled_time', '/trip_data/driver_arrival_time',
          '/trip_data/cancellation_time', '/app_events', '/chat_logs', '/applicable_policy/no_show',
        ],
      };
    }
    if (fee > RYDE_POLICY_V2_1.no_show.cancellation_fee) {
      return {
        action: 'partial_refund',
        amount: roundMoney(fee - RYDE_POLICY_V2_1.no_show.cancellation_fee),
        recipient: 'rider',
        basis: 'The no-show conditions were met, but the charge exceeded the fixed SGD 5 fee in Policy v2.1 §2.2.',
        sourceRefs: ['/trip_data/cancellation_fee', '/applicable_policy/no_show/cancellation_fee'],
      };
    }
    return {
      action: 'no_action', amount: 0, recipient: 'none',
      basis: 'The driver arrived on time, waited at least five minutes from the scheduled pickup, and attempted both chat and phone contact.',
      sourceRefs: [
        '/trip_data/scheduled_time', '/trip_data/driver_arrival_time',
        '/trip_data/cancellation_time', '/app_events', '/chat_logs', '/applicable_policy/no_show',
      ],
    };
  }

  if (isFareDisputeDataset(input)) {
    const surgeIncreased = input.surge_pricing_log.trip_start_surge > input.surge_pricing_log.quote_time_surge;
    if (surgeIncreased && !input.surge_pricing_log.rider_notified) {
      const amount = roundMoney(input.trip_data.actual_fare - input.trip_data.upfront_quote);
      return {
        action: 'full_refund', amount, recipient: 'rider',
        basis: 'Refund the full disputed surge differential because the multiplier increased after quote and the rider was not notified (Policy v2.1 §3.3).',
        sourceRefs: [
          '/trip_data/upfront_quote', '/trip_data/actual_fare',
          '/surge_pricing_log/quote_time_surge', '/surge_pricing_log/trip_start_surge',
          '/surge_pricing_log/rider_notified', '/applicable_policy/fare_and_surge',
        ],
      };
    }
    return {
      action: 'no_action', amount: 0, recipient: 'none',
      basis: 'The structured record does not establish an unnotified increase in the surge multiplier.',
      sourceRefs: ['/surge_pricing_log', '/applicable_policy/fare_and_surge'],
    };
  }

  if (isRouteDeviationDataset(input) && isStructuredRouteDeviationDataset(input)) {
    const extraKm = input.trip_data.actual_distance_km - input.trip_data.estimated_distance_km;
    const overTolerance = extraKm > RYDE_POLICY_V2_1.route_deviation.distance_tolerance_km;
    const notified = input.chat_log_analysis.route_notification_sent;
    if (overTolerance && !notified) {
      const amount = roundMoney(input.fare_breakdown.excess_distance_fare);
      return {
        action: 'partial_refund', amount, recipient: 'rider',
        basis: input.traffic_analysis.reroute_justified
          ? 'The reroute was justified, but the rider was not informed; refund the excess distance fare under Policy v2.1 §1.3.'
          : 'The route exceeded the tolerance without a supported justification; refund the excess distance fare under Policy v2.1 §1.3.',
        sourceRefs: [
          '/trip_data/estimated_distance_km', '/trip_data/actual_distance_km',
          '/fare_breakdown/excess_distance_fare', '/chat_log_analysis/route_notification_sent',
          '/traffic_analysis/reroute_justified', '/applicable_policy/route_deviation',
        ],
      };
    }
    return {
      action: 'no_action', amount: 0, recipient: 'none',
      basis: 'The structured route record does not meet the v2.1 refund conditions.',
      sourceRefs: ['/trip_data', '/chat_log_analysis', '/traffic_analysis', '/applicable_policy/route_deviation'],
    };
  }

  return null;
}
