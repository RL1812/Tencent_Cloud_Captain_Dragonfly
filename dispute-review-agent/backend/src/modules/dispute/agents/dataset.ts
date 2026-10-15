import { z } from 'zod';

const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();
const money = z.number().nonnegative();
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const location = z.object({ name: z.string().min(1), lat, lng });
const profile = {
  name: z.string().min(1), account_age_days: count, total_trips: count,
  avg_rating: z.number().min(0).max(5), fraud_flags: count,
  fraud_flag_details: z.string().optional(),
};

/** Sections every dataset shares: who filed, both parties, telemetry, chat and app events. */
const common = {
  rider_profile: z.object({
    ...profile, rider_id: z.string().min(1),
    dispute_history: z.object({ total_disputes: count, upheld: count, rejected: count }),
    payment_method: z.string(),
  }),
  driver_profile: z.object({
    ...profile, driver_id: z.string().min(1),
    dispute_history: z.object({ total_disputes: count, upheld_against: count, rejected: count }),
    vehicle: z.string(),
  }),
  gps_telemetry: z.array(z.object({
    timestamp, lat, lng, speed_kmh: z.number().nonnegative(), status: z.string(),
  })),
  chat_logs: z.array(z.object({
    timestamp, sender: z.enum(['rider', 'driver', 'system']),
    type: z.enum(['message', 'call', 'system']), content: z.string(),
  })),
  app_events: z.array(z.object({ timestamp, event_type: z.string(), details: z.string() })),
};

const ticket = <T extends string>(type: T) => z.object({
  dispute_id: z.string().min(1), trip_id: z.string().min(1),
  filed_by: z.enum(['rider', 'driver']), dispute_type: z.literal(type),
  description: z.string().min(1), filed_at: timestamp, status: z.string().min(1),
});

const tripParties = {
  trip_id: z.string().min(1), rider_id: z.string().min(1), driver_id: z.string().min(1),
  pickup_location: location, dropoff_location: location,
};

type Linked = {
  dispute_ticket: { trip_id: string };
  rider_profile: { rider_id: string };
  driver_profile: { driver_id: string };
  trip_data: { trip_id: string; rider_id: string; driver_id: string };
};

function sameTripAndParties(data: Linked, ctx: z.RefinementCtx): void {
  for (const [field, actual, expected] of [
    ['trip_id', data.trip_data.trip_id, data.dispute_ticket.trip_id],
    ['rider_id', data.trip_data.rider_id, data.rider_profile.rider_id],
    ['driver_id', data.trip_data.driver_id, data.driver_profile.driver_id],
  ]) {
    if (actual !== expected) ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['trip_data', field],
      message: 'Record IDs must refer to the same trip and parties',
    });
  }
}

/** Matches the DISP-002 sample JSON, excluding the markdown's expected-ruling prose. */
export const noShowDatasetSchema = z.object({
  dispute_ticket: ticket('no_show_charge'),
  ...common,
  trip_data: z.object({
    ...tripParties,
    scheduled_time: timestamp, driver_arrival_time: timestamp,
    driver_wait_start: timestamp, cancellation_time: timestamp,
    cancellation_fee: money, cancellation_reason: z.string(),
  }),
  cancellation_policy: z.object({
    free_wait_time_min: z.number().nonnegative(),
    cancellation_fee_after_wait: money,
    no_show_threshold_min: z.number().nonnegative(), fee_goes_to: z.string(),
  }),
}).superRefine(sameTripAndParties);

/**
 * Route deviation / overcharge: the recommended route and upfront estimate the
 * rider was shown, the metered result with its fare breakdown, and the fare policy.
 */
export const routeDeviationDatasetSchema = z.object({
  dispute_ticket: ticket('route_deviation'),
  ...common,
  trip_data: z.object({
    ...tripParties,
    pickup_time: timestamp, dropoff_time: timestamp,
    estimated_distance_km: z.number().positive(), estimated_duration_min: z.number().positive(),
    actual_distance_km: z.number().nonnegative(),
    estimated_fare: money, final_fare: money,
    fare_breakdown: z.object({
      base_fare: money, distance_fare: money, time_fare: money,
      surge_multiplier: z.number().min(1), booking_fee: money,
      promo_code: z.string().nullable(), promo_discount: money, total: money,
    }),
  }),
  recommended_route: z.object({
    summary: z.string().min(1),
    distance_km: z.number().positive(),
    duration_min: z.number().positive(),
    waypoints: z.array(z.object({ name: z.string().optional(), lat, lng })).min(2),
  }),
  fare_policy: z.object({
    deviation_tolerance_pct: z.number().nonnegative(),
    refund_basis: z.string().min(1),
    exempt_reasons: z.array(z.string().min(1)),
  }),
}).superRefine(sameTripAndParties);

const documentProfile = {
  ...profile,
  dispute_history: z.object({}).passthrough(),
};

const documentGpsPoint = z.object({
  timestamp, lat, lng, speed_kmh: z.number().nonnegative(),
}).passthrough();

const documentChat = z.object({
  timestamp,
  sender: z.enum(['rider', 'driver', 'system']),
  message: z.string().min(1),
}).passthrough();

/** The newly supplied DISP-001 document. Its proposed ruling is intentionally discarded. */
const structuredRouteRawSchema = z.object({
  dispute_ticket: ticket('route_deviation').passthrough(),
  rider_profile: z.object({
    ...documentProfile, rider_id: z.string().min(1), payment_method: z.string(),
  }).passthrough(),
  driver_profile: z.object({
    ...documentProfile, driver_id: z.string().min(1), vehicle: z.string(),
  }).passthrough(),
  trip_data: z.object({
    ...tripParties,
    start_time: timestamp, end_time: timestamp,
    estimated_duration_min: z.number().positive(), actual_duration_min: z.number().nonnegative(),
    estimated_distance_km: z.number().positive(), actual_distance_km: z.number().nonnegative(),
    estimated_fare: money, actual_fare: money,
    excess_distance_km: z.number(), excess_fare: money, route_deviated: z.boolean(),
  }).passthrough(),
  fare_breakdown: z.object({
    estimated: z.object({ total: money }).passthrough(),
    actual: z.object({ total: money }).passthrough(),
    delta: z.object({ total: z.number() }).passthrough(),
    excess_distance_fare: money,
    excess_tolls: money,
    notes: z.string(),
  }).passthrough(),
  gps_telemetry: z.array(documentGpsPoint).min(2),
  optimal_route: z.object({
    route_name: z.string().min(1),
    estimated_distance_km: z.number().positive(),
    estimated_duration_min: z.number().positive(),
    waypoints: z.array(z.object({ lat, lng }).passthrough()).min(2),
  }).passthrough(),
  chat_logs: z.array(documentChat),
  chat_log_analysis: z.object({
    route_notification_sent: z.boolean(),
    rider_inquired_about_route: z.boolean(),
  }).passthrough(),
  traffic_conditions: z.array(z.object({}).passthrough()),
  traffic_analysis: z.object({
    reroute_justified: z.boolean(),
    notification_failure: z.boolean(),
  }).passthrough(),
  recommended_ruling: z.unknown().optional(),
}).passthrough().superRefine(sameTripAndParties);

export const structuredRouteDeviationDatasetSchema = structuredRouteRawSchema.transform((data) => {
  const { recommended_ruling: _answerKey, ...record } = data;
  return {
    ...record,
    gps_telemetry: record.gps_telemetry.map((point) => ({
      ...point,
      status: typeof point.location_desc === 'string' ? point.location_desc : 'recorded',
    })),
    chat_logs: record.chat_logs.map((entry) => ({
      ...entry, type: 'message' as const, content: entry.message,
    })),
    app_events: [] as { timestamp: string; event_type: string; details: string }[],
  };
});

/** The newly supplied DISP-003 surge-pricing document. */
const fareDisputeRawSchema = z.object({
  dispute_ticket: ticket('fare_dispute').passthrough(),
  rider_profile: z.object({
    ...documentProfile, rider_id: z.string().min(1), payment_method: z.string(),
  }).passthrough(),
  driver_profile: z.object({
    ...documentProfile, driver_id: z.string().min(1), vehicle: z.string(),
  }).passthrough(),
  trip_data: z.object({
    ...tripParties,
    start_time: timestamp, end_time: timestamp,
    estimated_duration_min: z.number().positive(), actual_duration_min: z.number().nonnegative(),
    upfront_quote: money, actual_fare: money, fare_difference: z.number(),
  }).passthrough(),
  fare_breakdown: z.object({
    upfront_quote: z.object({
      surge_multiplier: z.number().positive(), surge_amount: money,
      total: money, surgeable_subtotal: money,
    }).passthrough(),
    actual_fare: z.object({
      surge_multiplier: z.number().positive(), surge_amount: money,
      total: money, surgeable_subtotal: money,
    }).passthrough(),
    comparison: z.object({
      surge_amount_difference: z.number(), total_difference: z.number(),
      root_cause: z.string(), booking_fee_surge_exempt: z.boolean(),
    }).passthrough(),
  }).passthrough(),
  gps_telemetry: z.array(documentGpsPoint).min(2),
  chat_logs: z.array(documentChat),
  surge_pricing_log: z.object({
    quote_time_surge: z.number().positive(),
    trip_start_surge: z.number().positive(),
    surge_activated_at: timestamp,
    rider_notified: z.boolean(),
    notification_method: z.string().nullable(),
    notification_timestamp: timestamp.nullable(),
    reason: z.string(),
  }).passthrough(),
}).passthrough().superRefine(sameTripAndParties);

export const fareDisputeDatasetSchema = fareDisputeRawSchema.transform((record) => ({
  ...record,
  gps_telemetry: record.gps_telemetry.map((point) => ({
    ...point, status: 'recorded',
  })),
  chat_logs: record.chat_logs.map((entry) => ({
    ...entry, type: 'message' as const, content: entry.message,
  })),
  app_events: [] as { timestamp: string; event_type: string; details: string }[],
}));

export const sampleDatasetSchema = z.union([
  noShowDatasetSchema,
  routeDeviationDatasetSchema,
  structuredRouteDeviationDatasetSchema,
  fareDisputeDatasetSchema,
]);

export type NoShowDataset = z.infer<typeof noShowDatasetSchema>;
export type LegacyRouteDeviationDataset = z.infer<typeof routeDeviationDatasetSchema>;
export type StructuredRouteDeviationDataset = z.infer<typeof structuredRouteDeviationDatasetSchema>;
export type FareDisputeDataset = z.infer<typeof fareDisputeDatasetSchema>;
export type RouteDeviationDataset = LegacyRouteDeviationDataset | StructuredRouteDeviationDataset;
export type SampleDataset = NoShowDataset | RouteDeviationDataset | FareDisputeDataset;

export function isDataset(input: object): input is SampleDataset {
  return 'dispute_ticket' in input &&
    typeof input.dispute_ticket === 'object' &&
    input.dispute_ticket !== null &&
    'dispute_type' in input.dispute_ticket &&
    typeof input.dispute_ticket.dispute_type === 'string';
}

export function isNoShowDataset(input: object): input is NoShowDataset {
  return isDataset(input) && input.dispute_ticket.dispute_type === 'no_show_charge';
}

export function isRouteDeviationDataset(input: object): input is RouteDeviationDataset {
  return isDataset(input) && input.dispute_ticket.dispute_type === 'route_deviation';
}

export function isLegacyRouteDeviationDataset(input: object): input is LegacyRouteDeviationDataset {
  return isRouteDeviationDataset(input) && 'recommended_route' in input;
}

export function isStructuredRouteDeviationDataset(input: object): input is StructuredRouteDeviationDataset {
  return isRouteDeviationDataset(input) && 'optimal_route' in input;
}

export function isFareDisputeDataset(input: object): input is FareDisputeDataset {
  return isDataset(input) && input.dispute_ticket.dispute_type === 'fare_dispute';
}

/** The dataset section that holds the policy agents must cite, e.g. "/cancellation_policy/". */
export function policyPrefix(input: object): string | null {
  if (isNoShowDataset(input)) return '/cancellation_policy/';
  if (isLegacyRouteDeviationDataset(input)) return '/fare_policy/';
  if (isStructuredRouteDeviationDataset(input)) return '/applicable_policy/route_deviation/';
  if (isFareDisputeDataset(input)) return '/applicable_policy/fare_and_surge/';
  return null;
}
