import { EventEmitter } from 'events'
import path from 'path'
import { app } from 'electron'
import { AudioTee } from 'audiotee'

export class SystemAudioSource extends EventEmitter {
  private audiotee: AudioTee | null = null
  private retryCount = 0
  private readonly MAX_RETRIES = 3
  private readonly RETRY_DELAY_MS = 2000
  private startedSuccessfully = false

  private getBinaryPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'audiotee')
    }
    return path.join(__dirname, '../../../node_modules/audiotee/bin/audiotee')
  }

  async start(): Promise<void> {
    this.startedSuccessfully = false
    this.retryCount = 0
    await this.startInternal()
  }

  private async startInternal(): Promise<void> {
    this.audiotee = new AudioTee({
      sampleRate: 16000,
      chunkDurationMs: 250,
      binaryPath: this.getBinaryPath(),
    })

    this.audiotee.on('start', () => {
      this.startedSuccessfully = true
      this.retryCount = 0
      this.emit('start')
    })

    this.audiotee.on('data', (chunk: { data: Buffer }) => {
      this.emit('data', chunk.data)
    })

    this.audiotee.on('error', (err: Error) => {
      if (!this.startedSuccessfully) {
        this.emit('fallback-needed', err)
        return
      }
      this.handleCrash(err)
    })

    this.audiotee.on('stop', () => {
      this.emit('stop')
    })

    this.audiotee.on('log', (_level: string, _msg: unknown) => {
      // suppress debug logs
    })

    try {
      await this.audiotee.start()
    } catch (err) {
      if (!this.startedSuccessfully) {
        this.emit('fallback-needed', err)
      } else {
        this.handleCrash(err instanceof Error ? err : new Error(String(err)))
      }
    }
  }

  private async handleCrash(err: Error): Promise<void> {
    if (this.retryCount >= this.MAX_RETRIES) {
      this.emit('error', err)
      return
    }
    this.retryCount++
    await new Promise(r => setTimeout(r, this.RETRY_DELAY_MS))
    await this.startInternal()
  }

  async stop(): Promise<void> {
    if (this.audiotee?.isActive()) {
      await this.audiotee.stop()
    }
    this.audiotee = null
  }
}
