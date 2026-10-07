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

  add({ party: 'rider', kind: 'chat', title: '乘客聊天/通话记录', content: chatLines('rider') });
  add({ party: 'driver', kind: 'chat', title: '司机聊天/通话记录', content: chatLines('driver') });
  add({ party: 'platform', kind: 'chat', title: '系统通知', content: chatLines('system') });
  add({
    party: 'platform',
    kind: 'gps',
    title: `GPS 轨迹（${data.gps_telemetry.length} 个点）`,
    content: data.gps_telemetry
      .map((p) => `[${clock(p.timestamp)}] ${p.lat}, ${p.lng} | ${p.speed_kmh} km/h | ${p.status}`)
      .join('\n'),
  });
  add({
    party: 'platform',
    kind: 'text',
    title: 'App 事件记录',
    content: data.app_events
      .map((e) => `[${clock(e.timestamp)}] ${e.event_type}: ${e.details}`)
      .join('\n'),
  });
  const p = data.cancellation_policy;
  add({
    party: 'platform',
    kind: 'text',
    title: '取消政策',
    content:
      `免费等待 ${p.free_wait_time_min} 分钟；超时取消费 ${p.cancellation_fee_after_wait}；` +
      `爽约判定阈值 ${p.no_show_threshold_min} 分钟；费用归属：${p.fee_goes_to}`,
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
      statement: '（数据集未提供司机陈述）',
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
