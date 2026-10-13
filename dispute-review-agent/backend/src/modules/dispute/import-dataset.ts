/**
 * Dispute Review — turn a sample dataset (e.g. DISP-002, DISP-003) into a dashboard case.
 */

import { isNoShowDataset, type SampleDataset } from './agents/dataset';
import { analyzeRoute } from './agents/route-analysis';
import type { CreateDisputeDTO, NewEvidence, TripInfo } from './types';

function clock(timestamp: string): string {
  return timestamp.replace('T', ' ').replace(/(\.\d+)?(Z|[+-]\d\d:\d\d)$/, ' $2').trim();
}

export function datasetToCreateDTO(data: SampleDataset): CreateDisputeDTO {
  const t = data.dispute_ticket;

  const chatLines = (sender: 'rider' | 'driver' | 'system') =>
    data.chat_logs
      .filter((m) => m.sender === sender)
      .map((m) => `[${clock(m.timestamp)}] (${m.type}) ${m.content}`)
      .join('\n');

  const evidence: NewEvidence[] = [];
  const add = (e: NewEvidence) => {
    if (e.content.trim()) evidence.push(e);
  };

  add({ party: 'rider', kind: 'chat', title: 'Rider chat and call log', content: chatLines('rider') });
  add({ party: 'driver', kind: 'chat', title: 'Driver chat and call log', content: chatLines('driver') });
  add({ party: 'platform', kind: 'chat', title: 'System notifications', content: chatLines('system') });
  add({
    party: 'platform',
    kind: 'gps',
    title: `GPS trace (${data.gps_telemetry.length} points)`,
    content: data.gps_telemetry
      .map((p) => `[${clock(p.timestamp)}] ${p.lat}, ${p.lng} | ${p.speed_kmh} km/h | ${p.status}`)
      .join('\n'),
  });
  add({
    party: 'platform',
    kind: 'text',
    title: 'App event log',
    content: data.app_events
      .map((e) => `[${clock(e.timestamp)}] ${e.event_type}: ${e.details}`)
      .join('\n'),
  });

  // "Honda HR-V (SGP 4521 M)" -> model + plate
  const vehicle = data.driver_profile.vehicle;
  const plateMatch = vehicle.match(/\(([^)]+)\)\s*$/);
  const car = {
    vehicleModel: plateMatch ? vehicle.replace(plateMatch[0], '').trim() : vehicle,
    plateNumber: plateMatch ? plateMatch[1] : '',
    currency: 'SGD' as const,
  };
  let trip: TripInfo;

  if (isNoShowDataset(data)) {
    const p = data.cancellation_policy;
    add({
      party: 'platform',
      kind: 'text',
      title: 'Cancellation policy',
      content:
        `Free wait: ${p.free_wait_time_min} minutes; cancellation fee after wait: ${p.cancellation_fee_after_wait}; ` +
        `no-show threshold: ${p.no_show_threshold_min} minutes; fee recipient: ${p.fee_goes_to}`,
    });
    const td = data.trip_data;
    trip = {
      pickupLocation: td.pickup_location.name,
      dropoffLocation: td.dropoff_location.name,
      pickupTime: td.scheduled_time,
      dropoffTime: td.cancellation_time,
      fare: td.cancellation_fee,
      distance: 0,
      ...car,
    };
  } else {
    const td = data.trip_data;
    const fb = td.fare_breakdown;
    const route = data.recommended_route;
    add({
      party: 'platform',
      kind: 'payment',
      title: 'Fare breakdown',
      content:
        `Upfront estimate: ${td.estimated_fare.toFixed(2)}; charged: ${td.final_fare.toFixed(2)}\n` +
        `Base ${fb.base_fare.toFixed(2)} + distance ${fb.distance_fare.toFixed(2)} + time ${fb.time_fare.toFixed(2)}, ` +
        `surge x${fb.surge_multiplier}, booking fee ${fb.booking_fee.toFixed(2)}, ` +
        `promo ${fb.promo_code ?? 'none'} (-${fb.promo_discount.toFixed(2)}) = ${fb.total.toFixed(2)}`,
    });
    add({
      party: 'platform',
      kind: 'gps',
      title: `Recommended route (${route.summary})`,
      content:
        `${route.distance_km} km, ${route.duration_min} min\n` +
        route.waypoints.map((w) => `${w.lat}, ${w.lng}${w.name ? ` | ${w.name}` : ''}`).join('\n'),
    });
    add({
      party: 'platform',
      kind: 'text',
      title: 'Route analysis (computed from GPS and fare records)',
      content: analyzeRoute(data).findings.join('\n'),
    });
    const p = data.fare_policy;
    add({
      party: 'platform',
      kind: 'text',
      title: 'Fare policy',
      content:
        `Deviation tolerance: ${p.deviation_tolerance_pct}%; refund basis: ${p.refund_basis}; ` +
        `exemptions: ${p.exempt_reasons.join(', ')}`,
    });
    trip = {
      pickupLocation: td.pickup_location.name,
      dropoffLocation: td.dropoff_location.name,
      pickupTime: td.pickup_time,
      dropoffTime: td.dropoff_time,
      fare: td.final_fare,
      distance: td.actual_distance_km,
      ...car,
    };
  }

  return {
    title: `[${t.dispute_id}] ${t.description}`.slice(0, 90),
    priority: 'medium',
    type: t.dispute_type,
    driver: {
      name: data.driver_profile.name,
      id: data.driver_profile.driver_id,
      rating: data.driver_profile.avg_rating,
      statement: '(The dataset does not include a separate driver statement.)',
    },
    passenger: {
      name: data.rider_profile.name,
      id: data.rider_profile.rider_id,
      rating: data.rider_profile.avg_rating,
      statement: t.filed_by === 'rider' ? t.description : '',
    },
    trip,
    evidence,
  };
}
