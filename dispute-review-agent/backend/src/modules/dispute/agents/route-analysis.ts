import type { RouteDeviationDataset } from './dataset';

/**
 * Deterministic telemetry checks for route-deviation disputes, computed from the
 * record itself (no model call). The agents receive the result as
 * /computed_route_analysis/... so they cite measured numbers instead of
 * estimating distances from raw coordinates.
 */
export interface RouteAnalysis {
  recommended_distance_km: number;
  actual_distance_km: number;
  extra_distance_km: number;
  deviation_pct: number;
  tolerance_pct: number;
  exceeds_tolerance: boolean;
  gps_path_distance_km: number;
  max_off_route_m: number;
  off_route_points: number;
  /** JSON pointer to the first GPS point more than OFF_ROUTE_M from the recommended route */
  first_off_route_point: string | null;
  estimated_duration_min: number;
  actual_duration_min: number;
  extra_duration_min: number;
  unexpected_stops: { from: string; to: string; minutes: number; points: string[] }[];
  estimated_fare: number;
  final_fare: number;
  fare_difference: number;
  fare_difference_pct: number;
  /** (base + distance + time) x surge + booking fee - promo discount */
  breakdown_computed_total: number;
  breakdown_matches_total: boolean;
  total_matches_final_fare: boolean;
  findings: string[];
}

/** GPS points further than this from the recommended route count as off-route. */
export const OFF_ROUTE_M = 500;
const EARTH_M = 6_371_000;
const CENT = 0.01;

const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;
const money = (n: number) => round(n, 2);
const minutesBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000;

type Point = { lat: number; lng: number };

function haversineM(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

/** Distance from p to segment ab, on a local flat projection (fine at city scale). */
function pointToSegmentM(p: Point, a: Point, b: Point): number {
  const kx = Math.cos(p.lat * Math.PI / 180) * EARTH_M * Math.PI / 180;
  const ky = EARTH_M * Math.PI / 180;
  const [px, py] = [p.lng * kx, p.lat * ky];
  const [ax, ay] = [a.lng * kx, a.lat * ky];
  const [bx, by] = [b.lng * kx, b.lat * ky];
  const [dx, dy] = [bx - ax, by - ay];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distanceToRouteM(p: Point, route: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < route.length; i++) best = Math.min(best, pointToSegmentM(p, route[i - 1], route[i]));
  return best;
}

export function analyzeRoute(data: RouteDeviationDataset): RouteAnalysis {
  const trip = data.trip_data;
  const route = data.recommended_route;
  const fb = trip.fare_breakdown;
  const start = Date.parse(trip.pickup_time);
  const end = Date.parse(trip.dropoff_time);

  // Only points recorded during the trip, keeping their index for citations
  const points = data.gps_telemetry
    .map((p, i) => ({ ...p, ref: `/gps_telemetry/${i}` }))
    .filter((p) => Date.parse(p.timestamp) >= start && Date.parse(p.timestamp) <= end);

  let pathM = 0;
  for (let i = 1; i < points.length; i++) pathM += haversineM(points[i - 1], points[i]);

  const offsets = points.map((p) => ({ ref: p.ref, m: distanceToRouteM(p, route.waypoints) }));
  const offRoute = offsets.filter((o) => o.m > OFF_ROUTE_M);

  // Stationary runs between pickup and drop-off (the first and last points are the stops themselves)
  const stops: RouteAnalysis['unexpected_stops'] = [];
  let run: typeof points = [];
  const flush = () => {
    if (run.length) stops.push({
      from: run[0].timestamp, to: run[run.length - 1].timestamp,
      minutes: round(minutesBetween(run[0].timestamp, run[run.length - 1].timestamp)),
      points: run.map((p) => p.ref),
    });
    run = [];
  };
  for (const p of points.slice(1, -1)) {
    if (p.speed_kmh === 0) run.push(p);
    else flush();
  }
  flush();

  const extraKm = trip.actual_distance_km - route.distance_km;
  const deviationPct = (extraKm / route.distance_km) * 100;
  const actualMin = minutesBetween(trip.pickup_time, trip.dropoff_time);
  const fareDiff = trip.final_fare - trip.estimated_fare;
  const computedTotal = (fb.base_fare + fb.distance_fare + fb.time_fare) * fb.surge_multiplier
    + fb.booking_fee - fb.promo_discount;
  const breakdownOk = Math.abs(computedTotal - fb.total) < CENT;
  const totalOk = Math.abs(fb.total - trip.final_fare) < CENT;
  const tolerance = data.fare_policy.deviation_tolerance_pct;

  const findings = [
    `Metered distance ${trip.actual_distance_km} km vs recommended ${route.distance_km} km ` +
      `(${extraKm >= 0 ? '+' : ''}${round(extraKm)} km, ${round(deviationPct)}%; policy tolerance ${tolerance}%).`,
    offRoute.length
      ? `${offRoute.length} of ${points.length} trip GPS points are more than ${OFF_ROUTE_M} m from the recommended route ` +
        `(max ${Math.round(Math.max(...offsets.map((o) => o.m)))} m).`
      : `All ${points.length} trip GPS points are within ${OFF_ROUTE_M} m of the recommended route.`,
    `Trip took ${round(actualMin)} min vs ${trip.estimated_duration_min} min estimated.`,
    ...stops.map((s) => `Stationary mid-trip from ${s.from} to ${s.to} (${s.minutes} min).`),
    `Final fare ${money(trip.final_fare)} vs upfront estimate ${money(trip.estimated_fare)} ` +
      `(${fareDiff >= 0 ? '+' : ''}${money(fareDiff)}).`,
  ];
  if (!breakdownOk) findings.push(`Fare components add up to ${money(computedTotal)}, not the stated total ${money(fb.total)}.`);
  if (!totalOk) findings.push(`Breakdown total ${money(fb.total)} differs from the charged fare ${money(trip.final_fare)}.`);
  if (fb.surge_multiplier > 1) findings.push(`Surge multiplier ${fb.surge_multiplier} applied.`);
  if (fb.promo_code) findings.push(`Promo code ${fb.promo_code} applied (discount ${money(fb.promo_discount)}).`);

  return {
    recommended_distance_km: route.distance_km,
    actual_distance_km: trip.actual_distance_km,
    extra_distance_km: round(extraKm),
    deviation_pct: round(deviationPct),
    tolerance_pct: tolerance,
    exceeds_tolerance: deviationPct > tolerance,
    gps_path_distance_km: round(pathM / 1000),
    max_off_route_m: offsets.length ? Math.round(Math.max(...offsets.map((o) => o.m))) : 0,
    off_route_points: offRoute.length,
    first_off_route_point: offRoute[0]?.ref ?? null,
    estimated_duration_min: trip.estimated_duration_min,
    actual_duration_min: round(actualMin),
    extra_duration_min: round(actualMin - trip.estimated_duration_min),
    unexpected_stops: stops,
    estimated_fare: money(trip.estimated_fare),
    final_fare: money(trip.final_fare),
    fare_difference: money(fareDiff),
    fare_difference_pct: trip.estimated_fare > 0 ? round((fareDiff / trip.estimated_fare) * 100) : 0,
    breakdown_computed_total: money(computedTotal),
    breakdown_matches_total: breakdownOk,
    total_matches_final_fare: totalOk,
    findings,
  };
}
