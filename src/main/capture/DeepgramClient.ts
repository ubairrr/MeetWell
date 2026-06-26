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
      Authorization: this.options.apiKey,
      reconnectAttempts: 0,
    })

    this.socket.on('open', () => {
      this.retryCount = 0
      this.options.onHealthChange('healthy')
      this.resetSilenceTimer()
    })

    this.socket.on('message', (data) => {
      // Reset silence timer on every data event, even non-speech-final
      this.resetSilenceTimer()

      if (data.type === 'Results' && data.speech_final === true) {
        const alt = data.channel?.alternatives?.[0]
        if (!alt) return

        const transcript = alt.transcript ?? ''
        const confidence = alt.confidence ?? null
        const speakerId = alt.words?.find((w) => w.speaker !== undefined)?.speaker
        const speakerLabel = this.normalizer.normalize(speakerId)
        const timestampStart = data.start ?? 0
        const timestampEnd = (data.start ?? 0) + (data.duration ?? 0)

        this.options.onSegment({
          transcript,
          speakerLabel,
          channel: this.options.channel,
          timestampStart,
          timestampEnd,
          confidence,
        })
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
    // Prevent handleDisconnect from reconnecting after explicit disconnect
    this.retryCount = this.MAX_RETRIES
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
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
