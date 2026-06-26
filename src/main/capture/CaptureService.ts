import crypto from 'crypto'
import type { BrowserWindow } from 'electron'
import type Database from 'better-sqlite3-multiple-ciphers'
import { DeepgramClient } from './DeepgramClient'
import type { SpeechFinalSegment, HealthStatus } from './DeepgramClient'
import { SystemAudioSource } from './SystemAudioSource'
import { TranscriptStore } from '../transcript/TranscriptStore'
import type { TranscriptSegmentRow } from '../transcript/TranscriptStore'

export class CaptureService {
  private transcriptStore: TranscriptStore
  private deepgramMic: DeepgramClient | null = null
  private deepgramSystem: DeepgramClient | null = null
  private systemAudio: SystemAudioSource | null = null
  private currentMeetingId: string | null = null

  constructor(
    private db: Database.Database,
    private win: BrowserWindow,
    private apiKey: string
  ) {
    this.transcriptStore = new TranscriptStore(db)
  }

  async startCapture(meetingId: string): Promise<void> {
    this.currentMeetingId = meetingId
    this.transcriptStore.createMeeting(meetingId, Date.now())

    this.deepgramMic = new DeepgramClient({
      apiKey: this.apiKey,
      channel: 'mic',
      onSegment: (seg) => this.handleSegment(seg),
      onHealthChange: (status) => this.pushHealthUpdate('mic', status),
    })

    this.deepgramSystem = new DeepgramClient({
      apiKey: this.apiKey,
      channel: 'system',
      onSegment: (seg) => this.handleSegment(seg),
      onHealthChange: (status) => this.pushHealthUpdate('system', status),
    })

    await Promise.all([
      this.deepgramMic.connect(meetingId),
      this.deepgramSystem.connect(meetingId),
    ])

    this.systemAudio = new SystemAudioSource()

    this.systemAudio.on('data', (buffer: Buffer) => {
      // CAPT-09: forward immediately, do not store
      this.deepgramSystem?.sendMedia(buffer)
    })

    this.systemAudio.on('fallback-needed', (err: Error) => {
      console.warn('[CaptureService] audiotee unavailable, fallback needed:', err.message)
      // Push error status — Chromium loopback fallback requires renderer action (v1 limitation)
      this.pushHealthUpdate('system', 'error')
    })

    this.systemAudio.on('error', (err: Error) => {
      console.error('[CaptureService] SystemAudioSource error after retries:', err.message)
      this.pushHealthUpdate('system', 'error')
    })

    await this.systemAudio.start()
  }

  async stopCapture(): Promise<string | null> {
    const meetingId = this.currentMeetingId

    await Promise.all([
      this.systemAudio?.stop(),
      this.deepgramSystem?.disconnect(),
      this.deepgramMic?.disconnect(),
    ])

    this.systemAudio = null
    this.deepgramMic = null
    this.deepgramSystem = null
    this.currentMeetingId = null

    return meetingId
  }

  handleMicChunk(buffer: ArrayBuffer): void {
    if (!this.deepgramMic) return
    this.deepgramMic.sendMedia(Buffer.from(buffer))
  }

  private handleSegment(seg: SpeechFinalSegment): void {
    if (!this.currentMeetingId) return

    const row: TranscriptSegmentRow = {
      id: crypto.randomUUID(),
      meetingId: this.currentMeetingId,
      speakerLabel: seg.speakerLabel,
      channel: seg.channel,
      timestampStart: seg.timestampStart,
      timestampEnd: seg.timestampEnd,
      text: seg.transcript,
      isSpeechFinal: 1,
      confidence: seg.confidence,
      createdAt: Date.now(),
    }

    this.transcriptStore.appendSegment(row)

    // Push to renderer — display-only, no raw audio (CAPT-09)
    this.win.webContents.send('transcript-segment', {
      id: row.id,
      text: row.text,
      speakerLabel: row.speakerLabel,
      channel: row.channel,
      timestampStart: row.timestampStart,
      timestampEnd: row.timestampEnd,
      confidence: row.confidence,
    })
  }

  private pushHealthUpdate(channel: 'mic' | 'system', status: HealthStatus): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('capture-health-update', { channel, status })
    }
  }
}
