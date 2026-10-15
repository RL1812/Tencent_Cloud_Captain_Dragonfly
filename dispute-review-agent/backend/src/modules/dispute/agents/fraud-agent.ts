import type { AgentInput, FraudAssessment, FraudSignal } from './contracts';
import { isDataset } from './dataset';
import { sourceIndex, validateInput } from './shared';

/**
 * Fraud and Bad-Faith Detection agent.
 *
 * It runs alongside the two advocates and reads only structured signals already
 * present in the record: account risk flags, dispute history and account age.
 * Like the Prioritization and Evidence Validation agents it makes **no** model
 * call, so a review still costs three LLM calls (advocate, advocate, Judge), the
 * signals stay explainable, and they remain available when a provider is down.
 *
 * Its output is risk context for the Judge. It is never evidence about this trip,
 * it is deliberately absent from `sourceIndex` (so a citation of it is rejected),
 * and it never decides a case on its own. Ratings, history and flags do not prove
 * fault — a flagged rider can still be right.
 */

/** Disputes per 100 trips at or above which a party's dispute rate is notable. */
const HIGH_DISPUTES_PER_100_TRIPS = 5;
const MEDIUM_DISPUTES_PER_100_TRIPS = 2;
/** Share of a party's own disputes decided against them. */
const HIGH_ADVERSE_RATIO = 0.66;
const MEDIUM_ADVERSE_RATIO = 0.5;
/** A ratio over one or two disputes is noise, not a pattern. */
const MIN_DISPUTES_FOR_RATIO = 3;
/** An account younger than this that already carries disputes is worth noting. */
const THIN_ACCOUNT_DAYS = 365;
const MIN_DISPUTES_FOR_THIN_ACCOUNT = 3;

interface PartyHistory {
  party: 'rider' | 'driver';
  profilePath: '/rider_profile' | '/driver_profile';
  name: string;
  fraudFlags: number;
  fraudFlagDetails?: string;
  totalDisputes: number;
  /** Disputes decided against this party: rejected for a rider, upheld_against for a driver. */
  adverse: number;
  accountAgeDays: number;
  totalTrips: number;
}

function partyHistories(input: AgentInput): PartyHistory[] {
  if (!isDataset(input)) return [];
  const { rider_profile: rider, driver_profile: driver } = input;
  return [
    {
      party: 'rider',
      profilePath: '/rider_profile',
      name: rider.name,
      fraudFlags: rider.fraud_flags,
      fraudFlagDetails: rider.fraud_flag_details,
      totalDisputes: rider.dispute_history.total_disputes,
      adverse: rider.dispute_history.rejected,
      accountAgeDays: rider.account_age_days,
      totalTrips: rider.total_trips,
    },
    {
      party: 'driver',
      profilePath: '/driver_profile',
      name: driver.name,
      fraudFlags: driver.fraud_flags,
      fraudFlagDetails: driver.fraud_flag_details,
      totalDisputes: driver.dispute_history.total_disputes,
      adverse: driver.dispute_history.upheld_against,
      accountAgeDays: driver.account_age_days,
      totalTrips: driver.total_trips,
    },
  ];
}

function disputesPer100Trips(history: PartyHistory): number {
  if (history.totalTrips === 0) return 0;
  return (history.totalDisputes / history.totalTrips) * 100;
}

function adverseRatio(history: PartyHistory): number {
  if (history.totalDisputes === 0) return 0;
  return history.adverse / history.totalDisputes;
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** One party's signals, from their own profile and dispute history. */
function signalsFor(history: PartyHistory): FraudSignal[] {
  const signals: FraudSignal[] = [];
  const base = history.profilePath;
  const historyPath = `${base}/dispute_history`;
  const who = history.party;

  if (history.fraudFlags > 0) {
    signals.push({
      party: who,
      code: 'account_risk_flag',
      severity: 'high',
      detail: `${history.name} carries ${history.fraudFlags} account risk flag(s)`
        + `${history.fraudFlagDetails ? ` (${history.fraudFlagDetails})` : ''}.`,
      sourceRefs: [
        `${base}/fraud_flags`,
        ...(history.fraudFlagDetails ? [`${base}/fraud_flag_details`] : []),
      ],
    });
  }

  const rate = disputesPer100Trips(history);
  if (rate >= MEDIUM_DISPUTES_PER_100_TRIPS) {
    signals.push({
      party: who,
      code: 'dispute_frequency',
      severity: rate >= HIGH_DISPUTES_PER_100_TRIPS ? 'high' : 'medium',
      detail: `${history.name} has filed or attracted ${history.totalDisputes} dispute(s) over `
        + `${history.totalTrips} trips (${round(rate)} per 100 trips).`,
      sourceRefs: [`${historyPath}/total_disputes`, `${base}/total_trips`],
    });
  }

  const ratio = adverseRatio(history);
  if (history.totalDisputes >= MIN_DISPUTES_FOR_RATIO && ratio >= MEDIUM_ADVERSE_RATIO) {
    signals.push({
      party: who,
      code: 'adverse_outcome_ratio',
      severity: ratio >= HIGH_ADVERSE_RATIO ? 'high' : 'medium',
      detail: `${history.adverse} of ${history.name}'s ${history.totalDisputes} disputes were `
        + `decided against them (${round(ratio * 100)}%).`,
      sourceRefs: [
        `${historyPath}/total_disputes`,
        `${historyPath}/${who === 'rider' ? 'rejected' : 'upheld_against'}`,
      ],
    });
  }

  if (history.accountAgeDays < THIN_ACCOUNT_DAYS
      && history.totalDisputes >= MIN_DISPUTES_FOR_THIN_ACCOUNT) {
    signals.push({
      party: who,
      code: 'thin_account_history',
      severity: 'medium',
      detail: `${history.name}'s account is ${history.accountAgeDays} days old and already `
        + `carries ${history.totalDisputes} dispute(s).`,
      sourceRefs: [`${base}/account_age_days`, `${historyPath}/total_disputes`],
    });
  }

  return signals;
}

/**
 * A flagged party facing an unflagged counterparty is a pattern in itself: it
 * says which side the history leans toward when both give plausible accounts.
 */
function asymmetrySignals(histories: PartyHistory[]): FraudSignal[] {
  const flagged = histories.filter((h) => h.fraudFlags > 0);
  const clean = histories.filter((h) => h.fraudFlags === 0);
  if (flagged.length !== 1 || clean.length !== 1) return [];
  const [subject] = flagged;
  const [other] = clean;
  return [{
    party: subject.party,
    code: 'counterparty_asymmetry',
    severity: 'medium',
    detail: `${subject.name} is risk-flagged while ${other.name} has no account risk flag.`,
    sourceRefs: [
      `${subject.profilePath}/fraud_flags`,
      `${other.profilePath}/fraud_flags`,
    ],
  }];
}

/** Keep only paths that exist in the record, so a signal can never invent a citation. */
function citableRefs(refs: string[], input: AgentInput): string[] {
  const index = sourceIndex(input);
  return refs.filter((ref) => Object.prototype.hasOwnProperty.call(index, ref));
}

/**
 * Deterministic abuse-pattern assessment. Returns a low-risk, empty-signal result
 * when the record carries no party history (e.g. a case typed into the web app),
 * rather than inferring risk from ratings.
 */
export function runFraudAgent(input: AgentInput): FraudAssessment {
  const record = validateInput(input);
  const histories = partyHistories(record);

  if (histories.length === 0) {
    return {
      agent: 'fraud_detection_agent',
      riskLevel: 'low',
      signals: [],
      note: 'No party dispute history is available in this record, so no abuse pattern was assessed.',
      contextOnly: true,
      assessedAt: new Date().toISOString(),
    };
  }

  const signals = histories.flatMap(signalsFor).concat(asymmetrySignals(histories))
    .map((signal) => ({ ...signal, sourceRefs: citableRefs(signal.sourceRefs, record) }))
    .filter((signal) => signal.sourceRefs.length > 0);

  const riskLevel = signals.some((s) => s.severity === 'high')
    ? 'high'
    : signals.length > 0 ? 'medium' : 'low';

  const flagged = signals.filter((s) => s.party === 'rider').length;
  const note = riskLevel === 'low'
    ? 'No dispute-abuse pattern was found in either party\'s profile or dispute history.'
    : `Risk context only, not evidence: ${signals.length} signal(s) across the parties`
      + `${flagged > 0 ? ` (${flagged} on the rider side)` : ''}. `
      + 'A flagged or high-frequency account can still be the wronged party in this trip.';

  return {
    agent: 'fraud_detection_agent',
    riskLevel,
    signals,
    note,
    contextOnly: true,
    assessedAt: new Date().toISOString(),
  };
}
