import type Database from 'better-sqlite3-multiple-ciphers'
import { BrowserWindow } from 'electron'
import { SummaryCardStore } from '../store/SummaryCardStore'
import type { StoredSummaryCard } from '../../shared/schemas/index'
import { SummaryCardSchema } from '../../shared/schemas/index'
import { LLMAdapter } from '../llm/LLMAdapter'

const SYSTEM_PROMPT = `You are a meeting assistant generating a brief summary of the last 5 minutes of a meeting transcript.
Rules:
1. Report only what was explicitly said. Do not infer, add context, or speculate.
2. The topic_headline must be a short noun phrase (10 words or fewer) describing the main subject discussed.
3. Each key_point must be a complete sentence directly reflecting something said in the transcript.
4. If fewer than 3 distinct points were discussed, use all available points (minimum 1).
5. speaker_contributions: include only speakers who actually spoke. One sentence per speaker.
6. Output must match the JSON schema exactly. No additional fields.`

interface TranscriptRow {
  id: string
  meeting_id: string
  speaker_label: string
  channel: string
  timestamp_start: number
  timestamp_end: number
  text: string
  created_at: number
}

export class SummaryCardTimer {
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null
  private currentMeetingId: string | null = null
  private cardIndex: number = 0
  private readonly INTERVAL_MS = 5 * 60 * 1000

  constructor(
    private readonly db: Database.Database,
    private readonly win: BrowserWindow,
    private readonly store: SummaryCardStore,
    private readonly llm: LLMAdapter
  ) { }

  start(meetingId: string): void {
    this.currentMeetingId = meetingId
    this.cardIndex = 0
    this.scheduleNext()
  }

  stop(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle)
      this.timeoutHandle = null
    }
    this.currentMeetingId = null
  }

  private scheduleNext(): void {
    this.timeoutHandle = setTimeout(async () => {
      try {
        await this.fire()
      } catch (err) {
        console.error('[SummaryCardTimer] card generation failed:', err)
      } finally {
        if (this.timeoutHandle !== null) {
          this.scheduleNext()
        }
      }
    }, this.INTERVAL_MS)
  }

  private async fire(): Promise<void> {
    if (!process.env.GEMINI_API_KEY || !this.currentMeetingId) return

    const windowEndMs = Date.now()
    const windowStartMs = windowEndMs - this.INTERVAL_MS

    const segments = this.db
      .prepare(
        `SELECT * FROM transcript_segments
         WHERE meeting_id = ? AND created_at > ? AND created_at <= ?
         ORDER BY timestamp_start ASC`
      )
      .all(this.currentMeetingId, windowStartMs, windowEndMs) as TranscriptRow[]

    // D-03: no segments in window — skip LLM call, no card
    if (segments.length === 0) return

    const userContent = segments
      .map((row) => `[${row.speaker_label}] (${row.channel}): ${row.text}`)
      .join('\n')

    const card = await this.llm.generate(
      SummaryCardSchema,
      'SummaryCardSchema',
      SYSTEM_PROMPT,
      userContent
    )

    const intervalStartSec = windowStartMs / 1000
    const intervalEndSec = windowEndMs / 1000
    const wallTimeLabel = new Date(windowEndMs).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
    const currentIndex = this.cardIndex
    this.cardIndex++

    const id = this.store.saveCard(
      this.currentMeetingId,
      currentIndex,
      intervalStartSec,
      intervalEndSec,
      wallTimeLabel,
      card,
      'gemini-2.5-flash'
    )

    const storedCard: StoredSummaryCard | undefined = this.store
      .getCardsForMeeting(this.currentMeetingId)
      .find((c) => c.id === id)

    if (!storedCard) {
      console.error('[SummaryCardTimer] could not retrieve stored card after save, id:', id)
      return
    }

    this.win.webContents.send('summary-card-ready', storedCard)
  }
}
