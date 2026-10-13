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

export const sampleDatasetSchema = z.union([noShowDatasetSchema, routeDeviationDatasetSchema]);

export type NoShowDataset = z.infer<typeof noShowDatasetSchema>;
export type RouteDeviationDataset = z.infer<typeof routeDeviationDatasetSchema>;
export type SampleDataset = NoShowDataset | RouteDeviationDataset;

export function isDataset(input: object): input is SampleDataset {
  return 'dispute_ticket' in input;
}

export function isNoShowDataset(input: object): input is NoShowDataset {
  return isDataset(input) && input.dispute_ticket.dispute_type === 'no_show_charge';
}

export function isRouteDeviationDataset(input: object): input is RouteDeviationDataset {
  return isDataset(input) && input.dispute_ticket.dispute_type === 'route_deviation';
}

/** The dataset section that holds the policy agents must cite, e.g. "/cancellation_policy/". */
export function policyPrefix(input: object): string | null {
  if (isNoShowDataset(input)) return '/cancellation_policy/';
  if (isRouteDeviationDataset(input)) return '/fare_policy/';
  return null;
}
