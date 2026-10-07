/**
 * Dispute Review — turn a sample dataset (e.g. DISP-002) into a dashboard case.
 */

import type { SampleDataset } from './agents/dataset';
import type { CreateDisputeDTO, NewEvidence } from './types';

function clock(timestamp: string): string {
  return timestamp.replace('T', ' ').replace(/(\.\d+)?(Z|[+-]\d\d:\d\d)$/, ' $2').trim();
}

export function datasetToCreateDTO(data: SampleDataset): CreateDisputeDTO {
  const t = data.dispute_ticket;
  const trip = data.trip_data;

  const chatLines = (sender: 'rider' | 'driver' | 'system') =>
    data.chat_logs
      .filter((m) => m.sender === sender)
      .map((m) => `[${clock(m.timestamp)}] (${m.type}) ${m.content}`)
      .join('\n');

  const evidence: NewEvidence[] = [];
  const add = (e: NewEvidence) => {
    if (e.content.trim()) evidence.push(e);
  };

  add({ party: 'rider', kind: 'chat', title: 'Rider messages and calls', content: chatLines('rider') });
  add({ party: 'driver', kind: 'chat', title: 'Driver messages and calls', content: chatLines('driver') });
  add({ party: 'platform', kind: 'chat', title: 'System notifications', content: chatLines('system') });
  add({
    party: 'platform',
    kind: 'gps',
    title: `GPS track (${data.gps_telemetry.length} points)`,
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
  const p = data.cancellation_policy;
  add({
    party: 'platform',
    kind: 'text',
    title: 'Cancellation policy',
    content:
      `Free wait ${p.free_wait_time_min} min; cancellation fee after the wait ${p.cancellation_fee_after_wait}; ` +
      `no-show threshold ${p.no_show_threshold_min} min; fee goes to: ${p.fee_goes_to}`,
  });

  // "Honda HR-V (SGP 4521 M)" -> model + plate
  const vehicle = data.driver_profile.vehicle;
  const plateMatch = vehicle.match(/\(([^)]+)\)\s*$/);

  return {
    title: `[${t.dispute_id}] ${t.description}`.slice(0, 90),
    priority: 'medium',
    type: t.dispute_type,
    driver: {
      name: data.driver_profile.name,
      id: data.driver_profile.driver_id,
      rating: data.driver_profile.avg_rating,
      statement: '(No driver statement in the dataset)',
    },
    passenger: {
      name: data.rider_profile.name,
      id: data.rider_profile.rider_id,
      rating: data.rider_profile.avg_rating,
      statement: t.filed_by === 'rider' ? t.description : '',
    },
    trip: {
      pickupLocation: trip.pickup_location.name,
      dropoffLocation: trip.dropoff_location.name,
      pickupTime: trip.scheduled_time,
      dropoffTime: trip.cancellation_time,
      fare: trip.cancellation_fee,
      distance: 0,
      vehicleModel: plateMatch ? vehicle.replace(plateMatch[0], '').trim() : vehicle,
      plateNumber: plateMatch ? plateMatch[1] : '',
      currency: 'SGD',
    },
    evidence,
  };
}
