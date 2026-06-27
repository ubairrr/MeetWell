import { DeepgramClient as DGClient } from '@deepgram/sdk'
import type { V1Socket } from '@deepgram/sdk/dist/cjs/api/resources/listen/resources/v1/client/Socket.js'
import { SpeakerNormalizer } from './SpeakerNormalizer'

export type HealthStatus = 'idle' | 'healthy' | 'silent' | 'error'

export interface SpeechFinalSegment {
  transcript: string
  speakerLabel: string
  channel: 'mic' | 'system'
  timestampStart: number
  timestampEnd: number
  confidence: number | null
}

export interface DeepgramClientOptions {
  apiKey: string
  channel: 'mic' | 'system'
  onSegment: (segment: SpeechFinalSegment) => void
  onHealthChange: (status: HealthStatus) => void
}

export class DeepgramClient {
  private socket: V1Socket | null = null
  private retryCount = 0
  private readonly MAX_RETRIES = 3
  private readonly RETRY_DELAY_MS = 2000
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private readonly SILENCE_TIMEOUT_MS = 5000
  private normalizer: SpeakerNormalizer
  private meetingId: string = ''

  // Utterance buffer — instance vars so disconnect() can flush before closing
  private isFinalsBuffer: string[] = []
  private utteranceStart = 0
  private utteranceEnd = 0
  private utteranceConfidence: number | null = null
  private utteranceSpeakerId: number | undefined

  constructor(private readonly options: DeepgramClientOptions) {
    this.normalizer = new SpeakerNormalizer(options.channel)
  }

  async connect(meetingId: string): Promise<void> {
    this.meetingId = meetingId
    const client = new DGClient({ apiKey: this.options.apiKey })
    this.socket = await client.listen.v1.connect({
      model: 'nova-3',
      diarize: 'true',
      mip_opt_out: true,
      encoding: 'linear16',
      sample_rate: 16000,
      interim_results: 'true',
      punctuate: 'true',
      smart_format: true,
      endpointing: 100,
      utterance_end_ms: 1000,
      Authorization: this.options.apiKey,
      reconnectAttempts: 0,
    })

    this.socket.on('open', () => {
      this.retryCount = 0
      this.options.onHealthChange('healthy')
      this.resetSilenceTimer()
    })

    this.socket.on('message', (data) => {
      this.resetSilenceTimer()

      if (data.type === 'UtteranceEnd') {
        this.flushBuffer()
        return
      }

      if (data.type !== 'Results') return
      const alt = data.channel?.alternatives?.[0]
      if (!alt) return

      const transcript = (alt.transcript ?? '').trim()

      if (data.is_final && transcript) {
        if (this.isFinalsBuffer.length === 0) {
          this.utteranceStart = data.start ?? 0
        }
        this.utteranceEnd = (data.start ?? 0) + (data.duration ?? 0)
        this.utteranceConfidence = alt.confidence ?? null
        this.utteranceSpeakerId = alt.words?.find((w) => w.speaker !== undefined)?.speaker
        this.isFinalsBuffer.push(transcript)
      }
    })

    this.socket.on('close', () => {
      void this.handleDisconnect()
    })

    this.socket.on('error', () => {
      void this.handleDisconnect()
    })

    // WrappedListenV1Socket is lazy — must call connect() to initiate the WebSocket
    this.socket.connect()
  }

  sendMedia(buffer: Buffer): void {
    if (!this.socket) return
    try {
      this.socket.sendMedia(buffer)
      this.resetSilenceTimer()
    } catch {
      // socket exists but connection not yet open — drop silently
    }
  }

  async disconnect(): Promise<void> {
    this.clearSilenceTimer()
    // Flush any buffered is_final segments before closing — prevents last utterance loss
    this.flushBuffer()
    // Prevent handleDisconnect from reconnecting after explicit disconnect
    this.retryCount = this.MAX_RETRIES
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
  }

  private flushBuffer(): void {
    const fullText = this.isFinalsBuffer.join(' ').trim()
    this.isFinalsBuffer = []
    if (!fullText) return
    const speakerLabel = this.normalizer.normalize(this.utteranceSpeakerId)
    this.options.onSegment({
      transcript: fullText,
      speakerLabel,
      channel: this.options.channel,
      timestampStart: this.utteranceStart,
      timestampEnd: this.utteranceEnd,
      confidence: this.utteranceConfidence,
    })
  }

  private async handleDisconnect(): Promise<void> {
    if (this.retryCount >= this.MAX_RETRIES) {
      this.clearSilenceTimer()
      this.options.onHealthChange('error')
      return
    }
    this.retryCount++
    this.normalizer.reset()
    await new Promise((r) => setTimeout(r, this.RETRY_DELAY_MS))
    await this.connect(this.meetingId)
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
  }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer()
    this.silenceTimer = setTimeout(() => {
      this.options.onHealthChange('silent')
    }, this.SILENCE_TIMEOUT_MS)
  }
}
