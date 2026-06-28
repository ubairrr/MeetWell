/**
 * RollingWindow — in-memory eviction watermark for the ContextEngine.
 *
 * Tracks the `covered-until` timestamp: transcript segments at or before
 * this timestamp have already been compressed into an epoch summary and
 * must be excluded from future token-count passes.
 *
 * The watermark is strictly monotonic — it never moves backward. This
 * prevents a late-arriving or duplicate EpochCompressor call from
 * accidentally re-including segments that were already compressed.
 *
 * Called by:
 *   - TokenMonitor — reads getCoveredUntil() to scope its DB query
 *   - EpochCompressor — calls markEvicted(epochEnd) after each compression
 *   - ContextEngine.stop() — calls reset() between meetings
 */
export class RollingWindow {
  private coveredUntil: number = 0

  /**
   * Returns the current watermark timestamp.
   * Segments with timestamp_start <= coveredUntil have been compressed.
   */
  getCoveredUntil(): number {
    return this.coveredUntil
  }

  /**
   * Advance the watermark to timestampEnd if it is greater than the current
   * value. Uses Math.max to enforce the monotonic invariant: a call with a
   * smaller value (e.g., late duplicate) has no effect.
   */
  markEvicted(timestampEnd: number): void {
    this.coveredUntil = Math.max(this.coveredUntil, timestampEnd)
  }

  /**
   * Reset the watermark to 0. Called by ContextEngine.stop() so a new
   * meeting starts with a clean slate.
   */
  reset(): void {
    this.coveredUntil = 0
  }
}
