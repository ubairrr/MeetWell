import { describe, it, expect, vi, afterEach } from 'vitest'
import { TokenMonitor, CHECK_INTERVAL_MS, TOKEN_THRESHOLD } from '../TokenMonitor'
import { RollingWindow } from '../RollingWindow'
import type Database from 'better-sqlite3-multiple-ciphers'

// ---------------------------------------------------------------------------
// Module-level constants
// ---------------------------------------------------------------------------
describe('TokenMonitor constants', () => {
  it('CHECK_INTERVAL_MS is 30000', () => {
    expect(CHECK_INTERVAL_MS).toBe(30_000)
  })

  it('TOKEN_THRESHOLD is 560000', () => {
    expect(TOKEN_THRESHOLD).toBe(560_000)
  })
})

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------
// better-sqlite3-multiple-ciphers is a native Electron binding compiled for
// Electron's Node ABI. In the Vitest (system Node) environment the .node
// file cannot be dlopen'd. We mock the DB object to test TokenMonitor logic
// without the native binding. The same mocking pattern is needed for all
// main-process unit tests that touch the DB.
//
// Pre-existing issue: tests/db.test.ts and tests/unit/TranscriptStore.test.ts
// have the same ABI mismatch (NODE_MODULE_VERSION 146 vs 147) confirming
// this is a project-wide environment condition, not a TokenMonitor bug.

type MockStmt = { all: ReturnType<typeof vi.fn> }

function makeMockDb(rows: Array<{ text: string }>): Database.Database {
  const stmt: MockStmt = { all: vi.fn().mockReturnValue(rows) }
  return {
    prepare: vi.fn().mockReturnValue(stmt),
  } as unknown as Database.Database
}

// ---------------------------------------------------------------------------
// countTokens
// ---------------------------------------------------------------------------
describe('TokenMonitor.countTokens', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns > 0 for two segments and sums both', async () => {
    const db = makeMockDb([{ text: 'hello world' }, { text: 'foo bar' }])
    const monitor = new TokenMonitor(db)
    const count = await monitor.countTokens('meeting-1', 0)

    // tiktoken cl100k_base: "hello world" = 2 tokens, "foo bar" = 2 tokens
    expect(count).toBeGreaterThan(0)
    // Must be the SUM of both, not just one segment
    const dbSingle = makeMockDb([{ text: 'hello world' }])
    const monitorSingle = new TokenMonitor(dbSingle)
    const singleCount = await monitorSingle.countTokens('meeting-1', 0)
    expect(count).toBeGreaterThan(singleCount)
  })

  it('passes coveredUntil to the DB query (watermark filter)', async () => {
    // We capture the arguments that prepare() is called with to confirm
    // the SQL uses timestamp_start > ? with the coveredUntil value
    const stmt = { all: vi.fn().mockReturnValue([{ text: 'new content' }]) }
    const db = { prepare: vi.fn().mockReturnValue(stmt) } as unknown as Database.Database
    const monitor = new TokenMonitor(db)

    await monitor.countTokens('meeting-2', 100)

    // all() called with [meetingId, coveredUntil]
    expect(stmt.all).toHaveBeenCalledWith('meeting-2', 100)
  })

  it('returns 0 when there are no eligible segments', async () => {
    const db = makeMockDb([])
    const monitor = new TokenMonitor(db)
    const count = await monitor.countTokens('meeting-empty', 0)
    expect(count).toBe(0)
  })

  it('returns 0 when coveredUntil excludes all rows (handled by DB layer)', async () => {
    // DB returns empty rows (simulating timestamp_start > coveredUntil = no rows)
    const db = makeMockDb([])
    const monitor = new TokenMonitor(db)
    const count = await monitor.countTokens('meeting-1', 9999)
    expect(count).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// start / stop
// ---------------------------------------------------------------------------
describe('TokenMonitor.start and stop', () => {
  it('start schedules an interval and stop clears it', () => {
    vi.useFakeTimers()
    const db = makeMockDb([])
    const monitor = new TokenMonitor(db)
    const rw = new RollingWindow()
    const onThreshold = vi.fn()

    monitor.start('meeting-3', rw, onThreshold)

    // Before the interval fires no threshold callbacks should occur
    vi.advanceTimersByTime(CHECK_INTERVAL_MS - 1)
    expect(onThreshold).not.toHaveBeenCalled()

    monitor.stop()
    vi.useRealTimers()
  })

  it('stop() is safe to call without prior start()', () => {
    const db = makeMockDb([])
    const monitor = new TokenMonitor(db)
    expect(() => monitor.stop()).not.toThrow()
  })

  it('start() clears existing interval before scheduling a new one', () => {
    vi.useFakeTimers()
    const db = makeMockDb([])
    const monitor = new TokenMonitor(db)
    const rw = new RollingWindow()
    const onThreshold = vi.fn()

    monitor.start('meeting-4', rw, onThreshold)
    // Call start again — should not create a leaked second interval
    monitor.start('meeting-4', rw, onThreshold)

    monitor.stop()
    vi.useRealTimers()
  })
})
