import { get_encoding } from 'tiktoken'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { RollingWindow } from './RollingWindow'

/**
 * Polling interval between token-count passes (milliseconds).
 * Exported so tests can reference without hard-coding.
 */
export const CHECK_INTERVAL_MS = 30_000

/**
 * Token threshold that triggers EpochCompressor (70% of 800K ceiling).
 * Exported so EpochCompressor can reference the same constant.
 */
export const TOKEN_THRESHOLD = 560_000

interface SegmentRow {
  text: string
}

/**
 * TokenMonitor — single-encoder tiktoken polling loop.
 *
 * Counts tokens in eligible transcript_segments (those not yet covered by the
 * RollingWindow watermark) and fires `onThreshold` when TOKEN_THRESHOLD is
 * reached. Uses a single tiktoken encoder per countTokens pass and frees its
 * WASM memory via enc.free() in a finally block (T-10-01-A mitigation).
 *
 * Design decision: TokenMonitor does NOT hold a reference to RollingWindow.
 * Instead, `start()` calls `rollingWindow.getCoveredUntil()` on each tick so
 * the watermark snapshot is taken at the moment of the count, not at start time.
 */
export class TokenMonitor {
  private handle: ReturnType<typeof setInterval> | null = null

  constructor(private readonly db: Database.Database) {}

  /**
   * Count tokens in transcript_segments for `meetingId` where
   * `timestamp_start > coveredUntil` (segments already compressed are excluded).
   *
   * Creates ONE tiktoken encoder for the full pass and frees it in a finally
   * block to prevent WASM memory leaks across polling ticks.
   */
  async countTokens(meetingId: string, coveredUntil: number): Promise<number> {
    const rows = this.db
      .prepare(
        `SELECT text FROM transcript_segments
         WHERE meeting_id = ? AND timestamp_start > ?
         ORDER BY timestamp_start ASC`
      )
      .all(meetingId, coveredUntil) as SegmentRow[]

    if (rows.length === 0) return 0

    const enc = get_encoding('cl100k_base')
    try {
      let totalTokens = 0
      for (const row of rows) {
        totalTokens += enc.encode(row.text).length
      }
      return totalTokens
    } finally {
      enc.free()
    }
  }

  /**
   * Start the polling loop. Clears any existing interval before scheduling.
   * On each tick, reads the current RollingWindow watermark and passes it to
   * countTokens so freshly-compressed segments are excluded.
   */
  start(
    meetingId: string,
    rollingWindow: RollingWindow,
    onThreshold: (count: number) => void
  ): void {
    this.stop() // clear any existing interval
    this.handle = setInterval(() => {
      this.countTokens(meetingId, rollingWindow.getCoveredUntil())
        .then((count) => {
          if (count >= TOKEN_THRESHOLD) {
            onThreshold(count)
          }
        })
        .catch((err) => {
          console.error('[TokenMonitor] count error:', err)
        })
    }, CHECK_INTERVAL_MS)
  }

  /**
   * Stop the polling loop and clear the interval handle.
   */
  stop(): void {
    if (this.handle !== null) {
      clearInterval(this.handle)
      this.handle = null
    }
  }
}
