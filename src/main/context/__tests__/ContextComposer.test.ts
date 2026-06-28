import { describe, it, expect, vi } from 'vitest'
import { ContextComposer } from '../ContextComposer'
import type Database from 'better-sqlite3-multiple-ciphers'

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------
// better-sqlite3-multiple-ciphers is a native Electron binding compiled for
// Electron's Node ABI. In the Vitest (system Node) environment the .node
// file cannot be dlopen'd. We mock the DB object to test ContextComposer
// logic without the native binding — same pre-existing project condition
// documented in 10-01-SUMMARY.md.
//
// We use an SQL-matching implementation so tests are not brittle to the
// order of prepare() calls.

function makeMockDb(
  segmentRows: unknown[],
  epochRows: unknown[]
): Database.Database {
  return {
    prepare: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('transcript_segments')) {
        return { all: vi.fn().mockReturnValue(segmentRows) }
      }
      if (sql.includes('epoch_summaries')) {
        return { all: vi.fn().mockReturnValue(epochRows) }
      }
      throw new Error(`Unexpected SQL in ContextComposer mock: ${sql}`)
    }),
  } as unknown as Database.Database
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const segmentRow = {
  id: 'seg-1',
  meeting_id: 'meeting-1',
  speaker_label: 'Speaker A',
  channel: 'mic',
  timestamp_start: 100,
  timestamp_end: 110,
  text: 'Hello everyone',
}

const epochRow = {
  id: 'epoch-1',
  meeting_id: 'meeting-1',
  covered_interval_start: 0,
  covered_interval_end: 99,
  decisions_json: '["Decision A","Decision B"]',
  action_items_json: '["Action 1"]',
  key_points_json: '["Key Point X","Key Point Y"]',
  speaker_attributions_json: '{"Speaker A":"discussed the roadmap"}',
  raw_segment_count: 10,
  token_count_compressed: 2400,
  created_at: '2026-06-28T00:00:00.000Z',
}

// ---------------------------------------------------------------------------
// ContextComposer.getContext — empty DB
// ---------------------------------------------------------------------------

describe('ContextComposer.getContext — empty DB', () => {
  it('returns ContextWindow with empty rollingSegments when DB has no segments', () => {
    const db = makeMockDb([], [])
    const composer = new ContextComposer(db)
    const result = composer.getContext('meeting-1', 0)
    expect(result.rollingSegments).toEqual([])
  })

  it('returns ContextWindow with empty epochSummaries when DB has no epochs', () => {
    const db = makeMockDb([], [])
    const composer = new ContextComposer(db)
    const result = composer.getContext('meeting-1', 0)
    expect(result.epochSummaries).toEqual([])
  })

  it('returns both fields as arrays (ContextWindow shape)', () => {
    const db = makeMockDb([], [])
    const composer = new ContextComposer(db)
    const result = composer.getContext('meeting-1', 0)
    expect(Array.isArray(result.rollingSegments)).toBe(true)
    expect(Array.isArray(result.epochSummaries)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ContextComposer.getContext — rollingSegments
// ---------------------------------------------------------------------------

describe('ContextComposer.getContext — rollingSegments', () => {
  it('includes segment from DB in rollingSegments', () => {
    const db = makeMockDb([segmentRow], [])
    const composer = new ContextComposer(db)
    const result = composer.getContext('meeting-1', 0)
    expect(result.rollingSegments).toHaveLength(1)
    expect(result.rollingSegments[0].id).toBe('seg-1')
    expect(result.rollingSegments[0].text).toBe('Hello everyone')
    expect(result.rollingSegments[0].timestamp_start).toBe(100)
  })

  it('passes meetingId and coveredUntil to transcript_segments query', () => {
    const segStmt = { all: vi.fn().mockReturnValue([]) }
    const epochStmt = { all: vi.fn().mockReturnValue([]) }
    const db = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('transcript_segments')) return segStmt
        return epochStmt
      }),
    } as unknown as Database.Database
    const composer = new ContextComposer(db)
    composer.getContext('meeting-2', 500)
    expect(segStmt.all).toHaveBeenCalledWith('meeting-2', 500)
  })

  it('coveredUntil=0 does not filter any segments (handled by DB layer)', () => {
    // DB returns the segment because timestamp_start > 0 is true for our fixture
    const db = makeMockDb([segmentRow], [])
    const composer = new ContextComposer(db)
    const result = composer.getContext('meeting-1', 0)
    expect(result.rollingSegments).toHaveLength(1)
  })

  it('coveredUntil=999 causes DB to return no segments (simulated by empty mock)', () => {
    // DB returns empty because no segment has timestamp_start > 999
    const db = makeMockDb([], [])
    const composer = new ContextComposer(db)
    const result = composer.getContext('meeting-1', 999)
    expect(result.rollingSegments).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// ContextComposer.getContext — epochSummaries
// ---------------------------------------------------------------------------

describe('ContextComposer.getContext — epochSummaries', () => {
  it('returns epoch regardless of coveredUntil value', () => {
    const db = makeMockDb([], [epochRow])
    const composer = new ContextComposer(db)
    // Even with a large coveredUntil, epochSummaries are all returned
    const result = composer.getContext('meeting-1', 999_999)
    expect(result.epochSummaries).toHaveLength(1)
  })

  it('passes only meetingId to epoch_summaries query (no coveredUntil filter)', () => {
    const segStmt = { all: vi.fn().mockReturnValue([]) }
    const epochStmt = { all: vi.fn().mockReturnValue([]) }
    const db = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('transcript_segments')) return segStmt
        return epochStmt
      }),
    } as unknown as Database.Database
    const composer = new ContextComposer(db)
    composer.getContext('meeting-3', 500)
    // epoch query should be called with only meetingId
    expect(epochStmt.all).toHaveBeenCalledWith('meeting-3')
  })

  it('deserializes decisions_json into decisions array', () => {
    const db = makeMockDb([], [epochRow])
    const composer = new ContextComposer(db)
    const result = composer.getContext('meeting-1', 0)
    expect(result.epochSummaries[0].decisions).toEqual(['Decision A', 'Decision B'])
  })

  it('deserializes action_items_json into action_items array', () => {
    const db = makeMockDb([], [epochRow])
    const composer = new ContextComposer(db)
    const result = composer.getContext('meeting-1', 0)
    expect(result.epochSummaries[0].action_items).toEqual(['Action 1'])
  })

  it('deserializes key_points_json into key_points array', () => {
    const db = makeMockDb([], [epochRow])
    const composer = new ContextComposer(db)
    const result = composer.getContext('meeting-1', 0)
    expect(result.epochSummaries[0].key_points).toEqual(['Key Point X', 'Key Point Y'])
  })

  it('deserializes speaker_attributions_json into speaker_attributions record', () => {
    const db = makeMockDb([], [epochRow])
    const composer = new ContextComposer(db)
    const result = composer.getContext('meeting-1', 0)
    expect(result.epochSummaries[0].speaker_attributions).toEqual({
      'Speaker A': 'discussed the roadmap',
    })
  })

  it('epoch StoredEpochSummary has all required non-JSON fields', () => {
    const db = makeMockDb([], [epochRow])
    const composer = new ContextComposer(db)
    const result = composer.getContext('meeting-1', 0)
    const epoch = result.epochSummaries[0]
    expect(epoch.id).toBe('epoch-1')
    expect(epoch.meeting_id).toBe('meeting-1')
    expect(epoch.covered_interval_start).toBe(0)
    expect(epoch.covered_interval_end).toBe(99)
    expect(epoch.raw_segment_count).toBe(10)
    expect(epoch.token_count_compressed).toBe(2400)
    expect(epoch.created_at).toBe('2026-06-28T00:00:00.000Z')
  })
})
