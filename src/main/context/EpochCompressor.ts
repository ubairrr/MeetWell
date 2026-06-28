import type Database from 'better-sqlite3-multiple-ciphers'
import * as crypto from 'crypto'
import { get_encoding } from 'tiktoken'
import { LLMAdapter } from '../llm/LLMAdapter'
import { EmbeddingAdapter } from '../llm/EmbeddingAdapter'
import { EpochSummarySchema, StoredEpochSummary } from '../../shared/schemas/index'
import { RollingWindow } from './RollingWindow'

/**
 * Token floor: evict enough of the oldest segments to bring the remaining
 * token count below this value (50% of the 800K ceiling — D-02).
 *
 * When TokenMonitor fires at 560K (70% ceiling), EpochCompressor is called
 * with currentTokenCount ≈ 560K. Evicting down to 400K frees ≈ 160K tokens
 * before the next polling tick.
 */
const TARGET_TOKEN_FLOOR = 400_000

/**
 * System prompt for the LLM compression call (Step 3).
 *
 * Instructs the model to extract only explicitly-stated content and to
 * output strictly to the EpochSummarySchema JSON shape. The structured
 * output format (zodResponseFormat) further constrains the response to the
 * schema, guarding against prompt injection (T-10-03-D).
 */
const EPOCH_SYSTEM_PROMPT = `You are a meeting summarizer processing a batch of consecutive transcript segments.
Extract the following from the provided transcript segments:
- decisions: an array of explicit decisions made during this period (verbatim or near-verbatim)
- action_items: an array of action items with responsible parties where named (as plain strings)
- key_points: an array of key discussion points raised during this period
- speaker_attributions: a record mapping each speaker label to a brief summary of what they contributed

Rules:
- Report ONLY what was explicitly stated in the transcript segments. Do not infer or embellish.
- If a category has no content, return an empty array or empty object for that field.
- Output must match the JSON schema exactly.`

/**
 * Row shape returned by the transcript_segments SELECT in compress().
 *
 * Source-of-truth invariant (D-04, AI-SPEC §2.2 Pitfall 4):
 * EpochCompressor reads EXCLUSIVELY from transcript_segments.
 * Never query display-artifact tables (epoch display artifacts, card tables)
 * for compression content — those are derived display artifacts, not the
 * authoritative meeting record.
 */
interface TranscriptRow {
  id: string
  speaker_label: string
  timestamp_start: number
  timestamp_end: number
  text: string
}

/**
 * EpochCompressor — the core compression engine of the ContextEngine (D-01).
 *
 * Triggered by TokenMonitor when the token budget approaches the 800K ceiling.
 * Called by ContextEngine with the current token count and RollingWindow.
 *
 * Single public method: compress(meetingId, currentTokenCount, rollingWindow)
 *
 * Per call:
 *   1. Selects oldest uncompressed transcript_segments (those after the
 *      RollingWindow watermark), exclusively from the transcript_segments table.
 *   2. Walks oldest-first accumulating token counts until enough tokens are
 *      selected to bring the remaining count below TARGET_TOKEN_FLOOR.
 *   3. Sends the selected segments to the LLM for structured-output summarization.
 *   4. Writes one row to epoch_summaries.
 *   5. Embeds the epoch text and writes one row to vec_chunks.
 *   6. Advances the RollingWindow watermark via markEvicted(coveredEnd).
 *
 * Steps 3–6 are wrapped in try/catch — compression failure must not crash the
 * ongoing meeting session.
 */
export class EpochCompressor {
  constructor(
    private readonly db: Database.Database,
    private readonly llm: LLMAdapter,
    private readonly embedding: EmbeddingAdapter
  ) {}

  async compress(
    meetingId: string,
    currentTokenCount: number,
    rollingWindow: RollingWindow
  ): Promise<StoredEpochSummary | null> {
    // -------------------------------------------------------------------------
    // Step 1 — Select segments to compress.
    //
    // The data-source invariant is enforced here: transcript_segments is the
    // ONLY table queried for compression content (D-04, AI-SPEC §2.2 Pitfall 4).
    // Segments already covered by the watermark (timestamp_start <= coveredUntil)
    // are excluded — they were compressed in a prior epoch.
    // -------------------------------------------------------------------------
    const rows = this.db
      .prepare(
        `SELECT id, speaker_label, timestamp_start, timestamp_end, text
         FROM transcript_segments
         WHERE meeting_id = ? AND timestamp_start > ?
         ORDER BY timestamp_start ASC`
      )
      .all(meetingId, rollingWindow.getCoveredUntil()) as TranscriptRow[]

    if (rows.length === 0) return null

    // -------------------------------------------------------------------------
    // Step 2 — Determine eviction target.
    //
    // tokensToEvict = currentTokenCount - TARGET_TOKEN_FLOOR
    // Walk segments oldest-first; add each to toCompress[] until the accumulated
    // token count covers at least tokensToEvict. This brings the remaining
    // token count below TARGET_TOKEN_FLOOR after the epoch is evicted.
    //
    // Single tiktoken encoder per pass (T-10-01-A pattern): enc.free() in
    // finally releases WASM memory regardless of whether encoding succeeded.
    // -------------------------------------------------------------------------
    const toCompress: TranscriptRow[] = []
    let accumulatedTokens = 0

    const enc = get_encoding('cl100k_base')
    try {
      const tokensToEvict = currentTokenCount - TARGET_TOKEN_FLOOR
      for (const row of rows) {
        const tokenCount = enc.encode(row.text).length
        toCompress.push(row)
        accumulatedTokens += tokenCount
        if (accumulatedTokens >= tokensToEvict) break
      }
    } finally {
      enc.free()
    }

    if (toCompress.length === 0) return null

    // -------------------------------------------------------------------------
    // Steps 3–6 — LLM call, epoch_summaries write, vec_chunks embed, watermark.
    //
    // Wrapped in try/catch: if the LLM, DB, or embedding call fails, we log
    // the error and return null so the meeting session continues uninterrupted.
    // -------------------------------------------------------------------------
    try {
      // Step 3 — LLM structured-output call.
      //
      // Each segment is formatted as "[speaker] (timestamp_start): text" so the
      // model can attribute statements to speakers. Content is placed in the user
      // role only; LLM instructions are in the system prompt (T-10-03-D).
      // LLMAdapter validates the response against EpochSummarySchema via Zod
      // before returning — malformed responses throw, preventing DB corruption
      // (T-10-03-A).
      const userContent = toCompress
        .map((row) => `[${row.speaker_label}] (${row.timestamp_start.toFixed(1)}s): ${row.text}`)
        .join('\n')

      const content = await this.llm.generate(
        EpochSummarySchema,
        'EpochSummarySchema',
        EPOCH_SYSTEM_PROMPT,
        userContent
      )

      // Step 4 — Write exactly one row to epoch_summaries.
      //
      // token_count_compressed reuses accumulatedTokens from Step 2 — no
      // re-encoding. Array/object fields serialised as JSON strings matching
      // the _json column naming convention from the DDL.
      const epochId = crypto.randomUUID()
      const coveredStart = toCompress[0].timestamp_start
      const coveredEnd = toCompress[toCompress.length - 1].timestamp_end
      const now = new Date().toISOString()

      this.db
        .prepare(
          `INSERT INTO epoch_summaries
             (id, meeting_id, covered_interval_start, covered_interval_end,
              decisions_json, action_items_json, key_points_json,
              speaker_attributions_json, raw_segment_count, token_count_compressed,
              created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          epochId,
          meetingId,
          coveredStart,
          coveredEnd,
          JSON.stringify(content.decisions),
          JSON.stringify(content.action_items),
          JSON.stringify(content.key_points),
          JSON.stringify(content.speaker_attributions),
          toCompress.length,
          accumulatedTokens,
          now
        )

      // Step 5 — Embed and write exactly one row to vec_chunks.
      //
      // Text for embedding is the concatenation of all structured output fields
      // (decisions + action_items + key_points). No chunking — callers concatenate
      // before calling embed() per D-06. The dimension assertion guards against
      // silent model changes corrupting the vec_chunks float[1536] schema
      // (T-10-03-B, mirrors EmbeddingAdapter's own guard).
      const embedText = [
        ...content.decisions,
        ...content.action_items,
        ...content.key_points,
      ].join(' ')

      const vector = await this.embedding.embed(embedText)

      if (vector.length !== 1536) {
        throw new Error(`vec_chunks dimension mismatch: ${vector.length}`)
      }

      const textPreview = content.key_points.slice(0, 3).join(' | ')

      this.db
        .prepare(
          `INSERT INTO vec_chunks
             (embedding, chunk_id, meeting_id, speaker_label, timestamp_start, text_preview)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(new Float32Array(vector), epochId, meetingId, 'epoch', coveredStart, textPreview)

      // Step 6 — Advance the RollingWindow watermark.
      //
      // markEvicted uses Math.max internally — safe to call even if a concurrent
      // or late call produced a larger coveredEnd.
      rollingWindow.markEvicted(coveredEnd)

      // Build and return the StoredEpochSummary, deserialising from the values
      // used in the INSERT (avoids a round-trip SELECT).
      const stored: StoredEpochSummary = {
        id: epochId,
        meeting_id: meetingId,
        covered_interval_start: coveredStart,
        covered_interval_end: coveredEnd,
        decisions: content.decisions,
        action_items: content.action_items,
        key_points: content.key_points,
        speaker_attributions: content.speaker_attributions,
        raw_segment_count: toCompress.length,
        token_count_compressed: accumulatedTokens,
        created_at: now,
      }

      return stored
    } catch (err) {
      console.error('[EpochCompressor] compression failed — session continues:', err)
      return null
    }
  }
}
