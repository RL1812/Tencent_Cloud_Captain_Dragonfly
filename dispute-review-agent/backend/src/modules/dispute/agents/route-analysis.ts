import {
  isLegacyRouteDeviationDataset,
  type RouteDeviationDataset,
} from './dataset';
import { RYDE_POLICY_V2_1 } from './policy';

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
  /** Percentage difference from the upfront estimate; null when the estimate is zero. */
  fare_difference_pct: number | null;
  /** (base + distance + time) x surge + booking fee - promo discount */
  breakdown_computed_total: number;
  breakdown_available: boolean;
  breakdown_matches_total: boolean;
  total_matches_final_fare: boolean;
  findings: string[];
}

/** GPS points further than this from the recommended route count as off-route. */
export const OFF_ROUTE_M = 500;
/** Speed below this (km/h) counts as stationary, tolerating GPS jitter. */
const STOP_SPEED_KMH = 1;
/** Stops shorter than this (minutes) are likely GPS noise and are filtered out. */
const MIN_STOP_MIN = 1;
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
  const legacy = isLegacyRouteDeviationDataset(data);
  const trip = data.trip_data;
  const route = legacy
    ? data.recommended_route
    : {
        distance_km: data.optimal_route.estimated_distance_km,
        duration_min: data.optimal_route.estimated_duration_min,
        waypoints: data.optimal_route.waypoints,
      };
  const pickupTime = legacy ? data.trip_data.pickup_time : data.trip_data.start_time;
  const dropoffTime = legacy ? data.trip_data.dropoff_time : data.trip_data.end_time;
  const finalFare = legacy ? data.trip_data.final_fare : data.trip_data.actual_fare;
  const fareBreakdown = legacy ? data.trip_data.fare_breakdown : null;
  const start = Date.parse(pickupTime);
  const end = Date.parse(dropoffTime);

  // Only points recorded during the trip, keeping their index for citations
  const points = data.gps_telemetry
    .map((p, i) => ({ ...p, ref: `/gps_telemetry/${i}` }))
    .filter((p) => Date.parse(p.timestamp) >= start && Date.parse(p.timestamp) <= end);

  let pathM = 0;
  for (let i = 1; i < points.length; i++) pathM += haversineM(points[i - 1], points[i]);

  const offsets = points.map((p) => ({ ref: p.ref, m: distanceToRouteM(p, route.waypoints) }));
  const offRoute = offsets.filter((o) => o.m > OFF_ROUTE_M);

  // Stationary runs between pickup and drop-off (the first and last points are the stops themselves).
  // A speed threshold tolerates GPS jitter; brief blips below MIN_STOP_MIN are filtered as noise.
  const stops: RouteAnalysis['unexpected_stops'] = [];
  let run: typeof points = [];
  const flush = () => {
    if (run.length) {
      const minutes = round(minutesBetween(run[0].timestamp, run[run.length - 1].timestamp));
      if (minutes >= MIN_STOP_MIN) stops.push({
        from: run[0].timestamp, to: run[run.length - 1].timestamp,
        minutes,
        points: run.map((p) => p.ref),
      });
    }
    run = [];
  };
  for (const p of points.slice(1, -1)) {
    if (p.speed_kmh < STOP_SPEED_KMH) run.push(p);
    else flush();
  }
  flush();

  const extraKm = trip.actual_distance_km - route.distance_km;
  const deviationPct = (extraKm / route.distance_km) * 100;
  const actualMin = minutesBetween(pickupTime, dropoffTime);
  const fareDiff = finalFare - trip.estimated_fare;
  const computedTotal = fareBreakdown
    ? (fareBreakdown.base_fare + fareBreakdown.distance_fare + fareBreakdown.time_fare) * fareBreakdown.surge_multiplier
      + fareBreakdown.booking_fee - fareBreakdown.promo_discount
    : finalFare;
  const breakdownOk = fareBreakdown ? Math.abs(computedTotal - fareBreakdown.total) < CENT : true;
  const totalOk = fareBreakdown ? Math.abs(fareBreakdown.total - finalFare) < CENT : true;
  const tolerance = legacy
    ? data.fare_policy.deviation_tolerance_pct
    : (RYDE_POLICY_V2_1.route_deviation.distance_tolerance_km / route.distance_km) * 100;
  const gpsPathKm = round(pathM / 1000);

  const findings: string[] = [];

  if (points.length === 0) {
    findings.push('No GPS points were recorded during the trip window (pickup to drop-off).');
  } else {
    findings.push(
      `Metered distance ${trip.actual_distance_km} km vs recommended ${route.distance_km} km ` +
        `(${extraKm >= 0 ? '+' : ''}${round(extraKm)} km, ${round(deviationPct)}%; policy tolerance ` +
        `${legacy ? `${tolerance}%` : `${RYDE_POLICY_V2_1.route_deviation.distance_tolerance_km} km`}).`
    );
    findings.push(
      offRoute.length
        ? `${offRoute.length} of ${points.length} trip GPS points are more than ${OFF_ROUTE_M} m from the recommended route ` +
          `(max ${Math.round(Math.max(...offsets.map((o) => o.m)))} m).`
        : `All ${points.length} trip GPS points are within ${OFF_ROUTE_M} m of the recommended route.`
    );
    // Flag a material discrepancy between the GPS path distance and the metered distance
    if (gpsPathKm > 0 && Math.abs(gpsPathKm - trip.actual_distance_km) > Math.max(0.5, trip.actual_distance_km * 0.1)) {
      findings.push(
        `GPS path distance ${gpsPathKm} km differs materially from the metered distance ${trip.actual_distance_km} km, ` +
        `which may indicate a metering issue or GPS gaps.`
      );
    }
    findings.push(`Trip took ${round(actualMin)} min vs ${trip.estimated_duration_min} min estimated.`);
    findings.push(...stops.map((s) => `Stationary mid-trip from ${s.from} to ${s.to} (${s.minutes} min).`));
    findings.push(
      `Final fare ${money(finalFare)} vs upfront estimate ${money(trip.estimated_fare)} ` +
        `(${fareDiff >= 0 ? '+' : ''}${money(fareDiff)}).`
    );
  }
  if (fareBreakdown && !breakdownOk) findings.push(`Fare components add up to ${money(computedTotal)}, not the stated total ${money(fareBreakdown.total)}.`);
  if (fareBreakdown && !totalOk) findings.push(`Breakdown total ${money(fareBreakdown.total)} differs from the charged fare ${money(finalFare)}.`);
  if (fareBreakdown?.surge_multiplier && fareBreakdown.surge_multiplier > 1) findings.push(`Surge multiplier ${fareBreakdown.surge_multiplier} applied.`);
  if (fareBreakdown?.promo_code) findings.push(`Promo code ${fareBreakdown.promo_code} applied (discount ${money(fareBreakdown.promo_discount)}).`);
  if (!fareBreakdown) findings.push('Only an aggregate fare breakdown was supplied; component arithmetic was not independently verified.');

  return {
    recommended_distance_km: route.distance_km,
    actual_distance_km: trip.actual_distance_km,
    extra_distance_km: round(extraKm),
    deviation_pct: round(deviationPct),
    tolerance_pct: tolerance,
    exceeds_tolerance: legacy
      ? deviationPct > tolerance
      : extraKm > RYDE_POLICY_V2_1.route_deviation.distance_tolerance_km,
    gps_path_distance_km: gpsPathKm,
    max_off_route_m: offsets.length ? Math.round(Math.max(...offsets.map((o) => o.m))) : 0,
    off_route_points: offRoute.length,
    first_off_route_point: offRoute[0]?.ref ?? null,
    estimated_duration_min: trip.estimated_duration_min,
    actual_duration_min: round(actualMin),
    extra_duration_min: round(actualMin - trip.estimated_duration_min),
    unexpected_stops: stops,
    estimated_fare: money(trip.estimated_fare),
    final_fare: money(finalFare),
    fare_difference: money(fareDiff),
    fare_difference_pct: trip.estimated_fare > 0 ? round((fareDiff / trip.estimated_fare) * 100) : null,
    breakdown_computed_total: money(computedTotal),
    breakdown_available: fareBreakdown !== null,
    breakdown_matches_total: breakdownOk,
    total_matches_final_fare: totalOk,
    findings,
  };
}
