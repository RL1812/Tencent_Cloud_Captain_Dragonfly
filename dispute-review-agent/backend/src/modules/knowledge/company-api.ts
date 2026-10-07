/**
 * Company internal records API client.
 *
 * We don't have access to the real internal API yet, so by default this
 * serves mock data shaped like the RydeResolve sample dataset (DISP-002).
 * Set COMPANY_API_BASE_URL (and COMPANY_API_TOKEN) to switch to the real API;
 * nothing else needs to change.
 */

import { env } from '../../config/env'
import type { CompanyRecordType } from './types'
import { MOCK_RECORDS } from './company-api.mock-data'

export type CompanyRecord = Record<string, unknown>

export interface CompanyRecordsClient {
  readonly name: string
  get(type: CompanyRecordType, id: string): Promise<CompanyRecord | null>
}

class MockCompanyRecordsClient implements CompanyRecordsClient {
  readonly name = 'mock'

  async get(type: CompanyRecordType, id: string): Promise<CompanyRecord | null> {
    const record = MOCK_RECORDS[type][id]
    // Deep copy so callers can't mutate the fixtures
    return record ? structuredClone(record) : null
  }
}

class HttpCompanyRecordsClient implements CompanyRecordsClient {
  readonly name = 'http'

  constructor(
    private baseUrl: string,
    private token?: string
  ) {}

  async get(type: CompanyRecordType, id: string): Promise<CompanyRecord | null> {
    // TODO: adjust paths to the real API once its spec is available
    const res = await fetch(`${this.baseUrl}/${type}s/${encodeURIComponent(id)}`, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Company API ${type}/${id} failed (${res.status})`)
    return (await res.json()) as CompanyRecord
  }
}

export const companyRecordsClient: CompanyRecordsClient = env.COMPANY_API_BASE_URL
  ? new HttpCompanyRecordsClient(env.COMPANY_API_BASE_URL, env.COMPANY_API_TOKEN)
  : new MockCompanyRecordsClient()

export interface DisputeBundle {
  dispute: CompanyRecord
  trip: CompanyRecord | null
  rider: CompanyRecord | null
  driver: CompanyRecord | null
}

/**
 * Fetch a dispute ticket and everything it references (trip, rider, driver).
 */
export async function fetchDisputeBundle(disputeId: string): Promise<DisputeBundle | null> {
  const client = companyRecordsClient
  const dispute = await client.get('dispute', disputeId)
  if (!dispute) return null

  const trip = typeof dispute.trip_id === 'string' ? await client.get('trip', dispute.trip_id) : null
  const riderId = trip?.rider_id ?? dispute.rider_id
  const driverId = trip?.driver_id ?? dispute.driver_id
  const [rider, driver] = await Promise.all([
    typeof riderId === 'string' ? client.get('rider', riderId) : null,
    typeof driverId === 'string' ? client.get('driver', driverId) : null,
  ])
  return { dispute, trip, rider, driver }
}

/** The record's own ID field, e.g. rider_id for a rider */
export function recordExternalId(type: CompanyRecordType, record: CompanyRecord): string {
  const value = record[`${type}_id`]
  if (typeof value !== 'string' || !value) {
    throw new Error(`Company ${type} record has no ${type}_id`)
  }
  return value
}

const RECORD_TITLES: Record<CompanyRecordType, string> = {
  dispute: 'Dispute ticket',
  rider: 'Rider profile',
  driver: 'Driver profile',
  trip: 'Trip record',
}

export function recordTitle(type: CompanyRecordType, externalId: string): string {
  return `${RECORD_TITLES[type]} ${externalId}`
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return '—'
  return String(value)
}

function flatten(value: unknown, prefix: string, lines: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        // Keep each list entry (GPS point, chat message, app event) on one line.
        // "#n", not "[n]", so the LLM cannot mistake it for a citation number
        const fields = Object.entries(item as Record<string, unknown>)
          .map(([k, v]) => `${k}=${typeof v === 'object' && v !== null ? JSON.stringify(v) : formatScalar(v)}`)
          .join(', ')
        lines.push(`${prefix} #${i + 1}: ${fields}`)
      } else {
        flatten(item, `${prefix} #${i + 1}`, lines)
      }
    })
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, lines)
    }
    return
  }
  lines.push(`${prefix}: ${formatScalar(value)}`)
}

/**
 * Render a record as plain text for embedding. Generic on purpose, so it keeps
 * working when the real API's fields differ from the mock.
 */
export function recordToText(type: CompanyRecordType, record: CompanyRecord): string {
  const lines = [`${recordTitle(type, recordExternalId(type, record))} (company internal record)`]
  flatten(record, '', lines)
  return lines.join('\n')
}
