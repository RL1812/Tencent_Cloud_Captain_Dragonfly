import { z } from 'zod';

const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();
const location = z.object({
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
const profile = {
  name: z.string().min(1), account_age_days: count, total_trips: count,
  avg_rating: z.number().min(0).max(5), fraud_flags: count,
  fraud_flag_details: z.string().optional(),
};

/** Matches the sample JSON, excluding the markdown's expected-ruling prose. */
export const sampleDatasetSchema = z.object({
  dispute_ticket: z.object({
    dispute_id: z.string().min(1), trip_id: z.string().min(1),
    filed_by: z.enum(['rider', 'driver']), dispute_type: z.literal('no_show_charge'),
    description: z.string().min(1), filed_at: timestamp, status: z.string().min(1),
  }),
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
  trip_data: z.object({
    trip_id: z.string().min(1), rider_id: z.string().min(1), driver_id: z.string().min(1),
    pickup_location: location, dropoff_location: location,
    scheduled_time: timestamp, driver_arrival_time: timestamp,
    driver_wait_start: timestamp, cancellation_time: timestamp,
    cancellation_fee: z.number().nonnegative(), cancellation_reason: z.string(),
  }),
  gps_telemetry: z.array(z.object({
    timestamp, lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
    speed_kmh: z.number().nonnegative(), status: z.string(),
  })),
  chat_logs: z.array(z.object({
    timestamp, sender: z.enum(['rider', 'driver', 'system']),
    type: z.enum(['message', 'call', 'system']), content: z.string(),
  })),
  app_events: z.array(z.object({ timestamp, event_type: z.string(), details: z.string() })),
  cancellation_policy: z.object({
    free_wait_time_min: z.number().nonnegative(),
    cancellation_fee_after_wait: z.number().nonnegative(),
    no_show_threshold_min: z.number().nonnegative(), fee_goes_to: z.string(),
  }),
}).superRefine((data, ctx) => {
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
});

export type SampleDataset = z.infer<typeof sampleDatasetSchema>;
