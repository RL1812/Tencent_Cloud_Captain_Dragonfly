import { chunkSections, normalizeText } from '../modules/knowledge/chunker'
import { detectSourceType } from '../modules/knowledge/parsers'
import {
  companyRecordsClient,
  fetchDisputeBundle,
  recordToText,
} from '../modules/knowledge/company-api'
import { buildContext } from '../modules/knowledge/rag'
import type { SearchHit } from '../modules/knowledge/types'

describe('chunker', () => {
  it('keeps short text in one chunk', () => {
    const chunks = chunkSections([{ text: 'Driver arrived at 08:43.' }])
    expect(chunks).toEqual([{ content: 'Driver arrived at 08:43.', chunkIndex: 0, page: undefined }])
  })

  it('splits long text within the size limit and carries page numbers', () => {
    const para = 'The driver waited at the lobby. '.repeat(20)
    const chunks = chunkSections(
      [
        { text: `${para}\n\n${para}`, page: 1 },
        { text: para, page: 2 },
      ],
      { maxChars: 300, overlapChars: 50 }
    )
    expect(chunks.length).toBeGreaterThan(3)
    expect(chunks.every((c) => c.content.length <= 300)).toBe(true)
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i))
    expect(chunks[0].page).toBe(1)
    expect(chunks[chunks.length - 1].page).toBe(2)
  })

  it('splits Chinese text on Chinese sentence punctuation', () => {
    const text = '乘客承认他仍在商场内。'.repeat(40)
    const chunks = chunkSections([{ text }], { maxChars: 100, overlapChars: 0 })
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.content.endsWith('。'))).toBe(true)
  })

  it('hard-cuts text without any natural break', () => {
    const chunks = chunkSections([{ text: 'x'.repeat(250) }], { maxChars: 100, overlapChars: 0 })
    expect(chunks.map((c) => c.content.length)).toEqual([100, 100, 50])
  })

  it('drops empty sections', () => {
    expect(chunkSections([{ text: '  \n\n ' }])).toEqual([])
  })

  it('normalizes whitespace and line endings', () => {
    expect(normalizeText('﻿a\r\n\r\n\r\n\r\nb   c\t d')).toBe('a\n\nb c d')
  })
})

describe('detectSourceType', () => {
  it.each([
    ['application/pdf', 'x.bin', 'pdf'],
    ['image/png', 'shot', 'image'],
    ['image/jpeg', 'photo.jpg', 'image'],
    ['text/plain', 'note', 'text'],
    ['application/octet-stream', 'notes.md', 'text'],
    ['application/octet-stream', 'SCAN.PDF', 'pdf'],
    ['application/octet-stream', 'virus.exe', null],
  ])('%s %s → %s', (mime, name, expected) => {
    expect(detectSourceType(mime, name)).toBe(expected)
  })
})

describe('mock company API', () => {
  it('uses the mock when no COMPANY_API_BASE_URL is set', () => {
    expect(companyRecordsClient.name).toBe('mock')
  })

  it('fetches a dispute with its trip, rider and driver', async () => {
    const bundle = await fetchDisputeBundle('DISP-002')
    expect(bundle?.dispute.dispute_id).toBe('DISP-002')
    expect(bundle?.trip?.trip_id).toBe('TRIP-2026-09945')
    expect(bundle?.rider?.rider_id).toBe('R-7823')
    expect(bundle?.driver?.driver_id).toBe('D-2398')
  })

  it('returns null for unknown disputes', async () => {
    expect(await fetchDisputeBundle('NOPE')).toBeNull()
  })

  it('returns copies so callers cannot change the fixtures', async () => {
    const rider = await companyRecordsClient.get('rider', 'R-7823')
    rider!.name = 'changed'
    expect((await companyRecordsClient.get('rider', 'R-7823'))!.name).toBe('Michael Wong')
  })

  it('renders records as readable text with one line per list item', async () => {
    const trip = await companyRecordsClient.get('trip', 'TRIP-2026-09945')
    const text = recordToText('trip', trip!)
    expect(text.split('\n')[0]).toBe('Trip record TRIP-2026-09945 (company internal record)')
    expect(text).toContain('pickup_location.name: Tiong Bahru Plaza')
    expect(text).toContain('chat_logs #3: timestamp=2026-09-13T08:47:05+08:00, sender=driver, type=call')
    expect(text).toContain('cancellation_policy.free_wait_time_min: 5')
  })
})

describe('buildContext', () => {
  const hit = (n: number, content: string): SearchHit => ({
    chunkId: n,
    documentId: `doc-${n}`,
    caseId: n === 1 ? 'DISP-002' : null,
    title: `Doc ${n}`,
    sourceType: n === 1 ? 'company_record' : 'pdf',
    originalFilename: null,
    page: n === 1 ? null : 4,
    chunkIndex: 0,
    content,
    score: 0.5,
  })

  it('numbers passages and labels their source', () => {
    const { context, used } = buildContext([hit(1, 'alpha'), hit(2, 'beta')])
    expect(used.map((u) => u.ref)).toEqual([1, 2])
    expect(context).toContain('[1] (Doc 1 · company record · case DISP-002)\nalpha')
    expect(context).toContain('[2] (Doc 2 · pdf · page 4)\nbeta')
  })

  it('stops adding passages once the context budget is used, but always keeps one', () => {
    const big = 'x'.repeat(13_000)
    const { used } = buildContext([hit(1, big), hit(2, 'small')])
    expect(used).toHaveLength(1)
  })
})
