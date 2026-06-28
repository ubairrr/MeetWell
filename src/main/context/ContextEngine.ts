import type Database from 'better-sqlite3-multiple-ciphers'
import { BrowserWindow } from 'electron'
import { SummaryCardStore } from '../store/SummaryCardStore'
import { LLMAdapter } from '../llm/LLMAdapter'
import { EmbeddingAdapter } from '../llm/EmbeddingAdapter'
import { SummaryCardTimer } from './SummaryCardTimer'
import { TokenMonitor } from './TokenMonitor'
import { EpochCompressor } from './EpochCompressor'
import { ContextComposer, ContextWindow } from './ContextComposer'
import { RollingWindow } from './RollingWindow'
import type { StoredEpochSummary } from '../../shared/schemas/index'

/**
 * Public interface for ContextEngine (D-07, ARCHITECTURE.md §6.8).
 *
 * src/main/index.ts calls start/stop/getContext on this interface.
 * ContextEngine is the only implementation in v1 — the interface exists
 * to make the contract explicit and aid future testing and mocking.
 */
export interface ContextEnginePort {
  start(meetingId: string): void
  stop(): void
  getContext(): ContextWindow | null
  onEpochCompressed(cb: (summary: StoredEpochSummary) => void): void
}

/**
 * ContextEngine — the orchestrator that owns all context subsystem lifetimes.
 *
 * Manages four subsystems created in the constructor:
 *   - SummaryCardTimer  — 5-minute summary card generation (Phase 9)
 *   - TokenMonitor      — 30-second tiktoken polling against 560K threshold
 *   - EpochCompressor   — LLM compression of oldest segments when threshold fires
 *   - ContextComposer   — synchronous DB read layer assembling ContextWindow (v1 infra)
 *
 * SummaryCardTimer is NOT retrofitted to go through ContextComposer (D-08). It
 * continues to query transcript_segments directly for its 5-minute window.
 * ContextEngine only manages its start/stop lifecycle.
 *
 * ContextComposer is v1 infrastructure only (D-07) — getContext() is consumed
 * by the 60-minute Vitest test (10-06) and the future v2 Live Assistant, not
 * by any v1 user-facing flow.
 *
 * Design: all subsystems are composed (not inherited). Each subsystem is a
 * separate class with a single responsibility. ContextEngine coordinates them.
 */
export class ContextEngine implements ContextEnginePort {
  private readonly summaryCardTimer: SummaryCardTimer
  private readonly tokenMonitor: TokenMonitor
  private readonly epochCompressor: EpochCompressor
  private readonly contextComposer: ContextComposer
  private readonly rollingWindow: RollingWindow
  private currentMeetingId: string | null = null
  private readonly epochCallbacks: Array<(summary: StoredEpochSummary) => void> = []

  constructor(
    db: Database.Database,
    win: BrowserWindow,
    summaryCardStore: SummaryCardStore,
    llm: LLMAdapter,
    embedding: EmbeddingAdapter
  ) {
    this.summaryCardTimer = new SummaryCardTimer(db, win, summaryCardStore, llm)
    this.tokenMonitor = new TokenMonitor(db)
    this.epochCompressor = new EpochCompressor(db, llm, embedding)
    this.contextComposer = new ContextComposer(db)
    this.rollingWindow = new RollingWindow()
  }

  /**
   * Start the context subsystems for a new meeting session.
   *
   * If a previous session is still active (currentMeetingId is set), stop()
   * is called first to clear timers and reset the rolling window — this is
   * the idempotency guard that prevents two concurrent TokenMonitor intervals
   * (T-10-04-A mitigation).
   *
   * Sequence:
   *   1. Guard: if already started, stop previous session.
   *   2. Record meetingId.
   *   3. Start SummaryCardTimer (5-minute card generation).
   *   4. Start TokenMonitor with onThreshold callback that triggers epoch compression.
   */
  start(meetingId: string): void {
    // T-10-04-A: prevent duplicate intervals from double-start
    if (this.currentMeetingId !== null) {
      this.stop()
    }

    this.currentMeetingId = meetingId
    this.summaryCardTimer.start(meetingId)

    this.tokenMonitor.start(meetingId, this.rollingWindow, async (count: number) => {
      try {
        const summary = await this.epochCompressor.compress(
          meetingId,
          count,
          this.rollingWindow
        )
        if (summary !== null) {
          for (const cb of this.epochCallbacks) {
            cb(summary)
          }
        }
      } catch (err) {
        console.error('[ContextEngine] epoch compression error:', err)
      }
    })
  }

  /**
   * Stop all context subsystems and reset session state.
   *
   * Called by src/main/index.ts on the Capturing → Complete FSM transition,
   * or internally by start() when a new meeting begins without an explicit stop.
   */
  stop(): void {
    this.summaryCardTimer.stop()
    this.tokenMonitor.stop()
    this.rollingWindow.reset()
    this.currentMeetingId = null
  }

  /**
   * Assemble and return the current ContextWindow.
   *
   * Returns null if no meeting session is active (before start() or after stop()).
   *
   * Delegates to ContextComposer.getContext() which performs two synchronous DB
   * reads: rolling segments after the watermark and all epoch summaries for the
   * meeting. This is v1 infrastructure (D-07) — the ContextWindow is not pushed
   * to the renderer in v1.
   */
  getContext(): ContextWindow | null {
    if (this.currentMeetingId === null) return null
    return this.contextComposer.getContext(
      this.currentMeetingId,
      this.rollingWindow.getCoveredUntil()
    )
  }

  /**
   * Register a callback to be called after each successful epoch compression.
   *
   * The callback receives the StoredEpochSummary produced by EpochCompressor.
   * Multiple callbacks can be registered — all are called in registration order.
   *
   * Used by the 60-minute Vitest test (10-06) to assert that compression fired
   * and to verify the ContextWindow shape after compression.
   */
  onEpochCompressed(cb: (summary: StoredEpochSummary) => void): void {
    this.epochCallbacks.push(cb)
  }
}
