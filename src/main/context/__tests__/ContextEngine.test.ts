import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Database from 'better-sqlite3-multiple-ciphers'

// ---------------------------------------------------------------------------
// vi.hoisted — module-level mock instances created before vi.mock() hoisting
// ---------------------------------------------------------------------------
// vi.hoisted() guarantees these variables are initialised before the vi.mock()
// factories execute, so the factories can close over them safely. This is the
// recommended Vitest 2.x pattern for capturing mock instances by reference.

const {
  mockSCT,
  mockTM,
  mockEC,
  mockCC,
  mockRW,
} = vi.hoisted(() => {
  const mockSCT = { start: vi.fn(), stop: vi.fn() }
  const mockTM = { start: vi.fn(), stop: vi.fn() }
  const mockEC = {
    compress: vi.fn().mockResolvedValue(null),
  }
  const mockCC = {
    getContext: vi.fn().mockReturnValue({ rollingSegments: [], epochSummaries: [] }),
  }
  const mockRW = {
    getCoveredUntil: vi.fn().mockReturnValue(0),
    markEvicted: vi.fn(),
    reset: vi.fn(),
  }
  return { mockSCT, mockTM, mockEC, mockCC, mockRW }
})

// ---------------------------------------------------------------------------
// Module mocks — intercept native bindings and Electron imports
// ---------------------------------------------------------------------------
// All sub-modules are mocked so ContextEngine tests are pure unit tests.
// The constructor dependencies (db, win, store, llm, embedding) are passed
// as opaque mocks because ContextEngine delegates all real work to the
// sub-classes it instantiates internally.

vi.mock('../SummaryCardTimer', () => ({
  SummaryCardTimer: vi.fn(() => mockSCT),
}))

vi.mock('../TokenMonitor', () => ({
  TokenMonitor: vi.fn(() => mockTM),
}))

vi.mock('../EpochCompressor', () => ({
  EpochCompressor: vi.fn(() => mockEC),
}))

vi.mock('../ContextComposer', () => ({
  ContextComposer: vi.fn(() => mockCC),
}))

vi.mock('../RollingWindow', () => ({
  RollingWindow: vi.fn(() => mockRW),
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}))

vi.mock('../../store/SummaryCardStore', () => ({
  SummaryCardStore: vi.fn(),
}))

vi.mock('../../llm/LLMAdapter', () => ({
  LLMAdapter: vi.fn(),
}))

vi.mock('../../llm/EmbeddingAdapter', () => ({
  EmbeddingAdapter: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import ContextEngine after mocks are in place
// ---------------------------------------------------------------------------

import { ContextEngine, ContextEnginePort } from '../ContextEngine'

// ---------------------------------------------------------------------------
// Helper — create a ContextEngine with stub DB and dependencies
// ---------------------------------------------------------------------------

const mockDb = {} as Database.Database
const mockWin = {} as Electron.BrowserWindow
const mockStore = {} as import('../../store/SummaryCardStore').SummaryCardStore
const mockLlm = {} as import('../../llm/LLMAdapter').LLMAdapter
const mockEmbedding = {} as import('../../llm/EmbeddingAdapter').EmbeddingAdapter

function makeEngine(): ContextEngine {
  return new ContextEngine(mockDb, mockWin, mockStore, mockLlm, mockEmbedding)
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('ContextEngine — constructor', () => {
  it('constructs without throwing', () => {
    expect(() => makeEngine()).not.toThrow()
  })

  it('implements ContextEnginePort interface (structural check)', () => {
    const engine = makeEngine()
    // All four ContextEnginePort methods must exist as functions
    expect(typeof engine.start).toBe('function')
    expect(typeof engine.stop).toBe('function')
    expect(typeof engine.getContext).toBe('function')
    expect(typeof engine.onEpochCompressed).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// ContextEngine.start
// ---------------------------------------------------------------------------

describe('ContextEngine.start', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCC.getContext.mockReturnValue({ rollingSegments: [], epochSummaries: [] })
    mockRW.getCoveredUntil.mockReturnValue(0)
    mockEC.compress.mockResolvedValue(null)
  })

  it('calls summaryCardTimer.start(meetingId)', () => {
    const engine = makeEngine()
    engine.start('meeting-1')
    expect(mockSCT.start).toHaveBeenCalledWith('meeting-1')
  })

  it('calls tokenMonitor.start with meetingId, rollingWindow, and a callback', () => {
    const engine = makeEngine()
    engine.start('meeting-1')
    expect(mockTM.start).toHaveBeenCalledTimes(1)
    const [calledMeetingId, calledRw, calledCb] = mockTM.start.mock.calls[0]
    expect(calledMeetingId).toBe('meeting-1')
    expect(calledRw).toBe(mockRW)
    expect(typeof calledCb).toBe('function')
  })

  it('start() on active session calls stop() first (idempotency guard — T-10-04-A)', () => {
    const engine = makeEngine()
    engine.start('meeting-1')
    // Second start without stop should trigger internal stop first
    engine.start('meeting-2')
    // summaryCardTimer.stop should have been called once (from the guard inside start)
    expect(mockSCT.stop).toHaveBeenCalledTimes(1)
    // The second start should have called summaryCardTimer.start twice total
    expect(mockSCT.start).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// ContextEngine.stop
// ---------------------------------------------------------------------------

describe('ContextEngine.stop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCC.getContext.mockReturnValue({ rollingSegments: [], epochSummaries: [] })
    mockRW.getCoveredUntil.mockReturnValue(0)
    mockEC.compress.mockResolvedValue(null)
  })

  it('calls summaryCardTimer.stop()', () => {
    const engine = makeEngine()
    engine.start('meeting-1')
    engine.stop()
    expect(mockSCT.stop).toHaveBeenCalled()
  })

  it('calls tokenMonitor.stop()', () => {
    const engine = makeEngine()
    engine.start('meeting-1')
    engine.stop()
    expect(mockTM.stop).toHaveBeenCalled()
  })

  it('calls rollingWindow.reset()', () => {
    const engine = makeEngine()
    engine.start('meeting-1')
    engine.stop()
    expect(mockRW.reset).toHaveBeenCalled()
  })

  it('getContext() returns null after stop()', () => {
    const engine = makeEngine()
    engine.start('meeting-1')
    engine.stop()
    expect(engine.getContext()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// ContextEngine.getContext
// ---------------------------------------------------------------------------

describe('ContextEngine.getContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCC.getContext.mockReturnValue({ rollingSegments: [], epochSummaries: [] })
    mockRW.getCoveredUntil.mockReturnValue(0)
  })

  it('returns null before start() is called', () => {
    const engine = makeEngine()
    expect(engine.getContext()).toBeNull()
  })

  it('calls contextComposer.getContext with meetingId and coveredUntil after start()', () => {
    mockRW.getCoveredUntil.mockReturnValue(42)
    const engine = makeEngine()
    engine.start('meeting-5')
    engine.getContext()
    expect(mockCC.getContext).toHaveBeenCalledWith('meeting-5', 42)
  })

  it('returns the ContextWindow from contextComposer.getContext()', () => {
    const window = { rollingSegments: [{ id: 'seg-1' }], epochSummaries: [] }
    mockCC.getContext.mockReturnValue(window)
    const engine = makeEngine()
    engine.start('meeting-5')
    expect(engine.getContext()).toBe(window)
  })
})

// ---------------------------------------------------------------------------
// ContextEngine.onEpochCompressed + onThreshold callback chain
// ---------------------------------------------------------------------------

describe('ContextEngine.onEpochCompressed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCC.getContext.mockReturnValue({ rollingSegments: [], epochSummaries: [] })
    mockRW.getCoveredUntil.mockReturnValue(0)
    mockEC.compress.mockResolvedValue(null)
  })

  it('registers a callback without throwing', () => {
    const engine = makeEngine()
    expect(() => engine.onEpochCompressed(() => {})).not.toThrow()
  })

  it('onThreshold callback calls epochCompressor.compress with meetingId, count, rollingWindow', async () => {
    const engine = makeEngine()
    engine.start('meeting-6')
    // Retrieve the onThreshold callback captured by the tokenMonitor.start mock
    const onThreshold = mockTM.start.mock.calls[0][2] as (count: number) => Promise<void>
    await onThreshold(560_000)
    expect(mockEC.compress).toHaveBeenCalledWith('meeting-6', 560_000, mockRW)
  })

  it('fires registered onEpochCompressed callbacks when compress() returns a summary', async () => {
    const fakeSummary = {
      id: 'epoch-1',
      meeting_id: 'meeting-6',
      covered_interval_start: 0,
      covered_interval_end: 99,
      decisions: [],
      action_items: [],
      key_points: [],
      speaker_attributions: {},
      raw_segment_count: 5,
      token_count_compressed: 1200,
      created_at: '2026-06-28T00:00:00.000Z',
    }
    mockEC.compress.mockResolvedValue(fakeSummary)

    const engine = makeEngine()
    const cb = vi.fn()
    engine.onEpochCompressed(cb)
    engine.start('meeting-6')

    const onThreshold = mockTM.start.mock.calls[0][2] as (count: number) => Promise<void>
    await onThreshold(560_000)

    expect(cb).toHaveBeenCalledWith(fakeSummary)
  })

  it('does NOT fire callbacks when epochCompressor.compress() returns null', async () => {
    mockEC.compress.mockResolvedValue(null)
    const engine = makeEngine()
    const cb = vi.fn()
    engine.onEpochCompressed(cb)
    engine.start('meeting-7')

    const onThreshold = mockTM.start.mock.calls[0][2] as (count: number) => Promise<void>
    await onThreshold(560_000)

    expect(cb).not.toHaveBeenCalled()
  })

  it('fires all registered callbacks (multiple registrations)', async () => {
    const fakeSummary = {
      id: 'epoch-2',
      meeting_id: 'meeting-8',
      covered_interval_start: 0,
      covered_interval_end: 99,
      decisions: [],
      action_items: [],
      key_points: [],
      speaker_attributions: {},
      raw_segment_count: 3,
      token_count_compressed: 800,
      created_at: '2026-06-28T00:00:00.000Z',
    }
    mockEC.compress.mockResolvedValue(fakeSummary)

    const engine = makeEngine()
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    engine.onEpochCompressed(cb1)
    engine.onEpochCompressed(cb2)
    engine.start('meeting-8')

    const onThreshold = mockTM.start.mock.calls[0][2] as (count: number) => Promise<void>
    await onThreshold(560_000)

    expect(cb1).toHaveBeenCalledWith(fakeSummary)
    expect(cb2).toHaveBeenCalledWith(fakeSummary)
  })

  it('does not crash if epochCompressor.compress() throws (error caught in callback)', async () => {
    mockEC.compress.mockRejectedValue(new Error('LLM call failed'))
    const engine = makeEngine()
    engine.start('meeting-9')

    const onThreshold = mockTM.start.mock.calls[0][2] as (count: number) => Promise<void>
    // Should not reject — ContextEngine wraps in try/catch
    await expect(onThreshold(560_000)).resolves.toBeUndefined()
  })
})
