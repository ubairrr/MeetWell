export type ChannelType = 'mic' | 'system'

export class SpeakerNormalizer {
  private map: Map<number, string> = new Map()

  constructor(private readonly channel: ChannelType) {}

  normalize(speakerId: number | undefined): string {
    // Mic channel: always "You" regardless of speakerId (D-09)
    if (this.channel === 'mic') return 'You'

    // System channel: speakerId undefined defaults to 0
    const id = speakerId ?? 0
    if (!this.map.has(id)) {
      if (this.map.size >= 8) {
        // Cap at 8 speakers — new speakers beyond the cap reuse 'Speaker 8'
        this.map.set(id, 'Speaker 8')
      } else {
        // Speaker 0 → "Speaker 1", speaker 1 → "Speaker 2", etc.
        this.map.set(id, `Speaker ${this.map.size + 1}`)
      }
    }
    return this.map.get(id)!
  }

  reset(): void {
    // D-10: clear map on reconnect; speaker IDs restart from the new connection
    this.map.clear()
  }
}
