import { describe, it, expect, beforeEach } from 'vitest'
import { SpeakerNormalizer } from '../../src/main/capture/SpeakerNormalizer'

describe('SpeakerNormalizer', () => {
  describe('mic channel', () => {
    let normalizer: SpeakerNormalizer

    beforeEach(() => {
      normalizer = new SpeakerNormalizer('mic')
    })

    it('always returns "You"', () => {
      expect(normalizer.normalize(0)).toBe('You')
      expect(normalizer.normalize(1)).toBe('You')
      expect(normalizer.normalize(undefined)).toBe('You')
    })
  })

  describe('system channel', () => {
    let normalizer: SpeakerNormalizer

    beforeEach(() => {
      normalizer = new SpeakerNormalizer('system')
    })

    it('maps 0→Speaker 1, 1→Speaker 2', () => {
      expect(normalizer.normalize(0)).toBe('Speaker 1')
      expect(normalizer.normalize(1)).toBe('Speaker 2')
    })

    it('is consistent for same ID', () => {
      expect(normalizer.normalize(0)).toBe('Speaker 1')
      // Call again — should return same value
      expect(normalizer.normalize(0)).toBe('Speaker 1')
    })

    it('reset() clears the map so IDs restart from Speaker 1', () => {
      expect(normalizer.normalize(0)).toBe('Speaker 1')
      normalizer.reset()
      // After reset, speaker 0 should be Speaker 1 again
      expect(normalizer.normalize(0)).toBe('Speaker 1')
    })

    it('caps at 8 speakers', () => {
      // Normalize 9 distinct IDs: 0..8
      for (let i = 0; i <= 7; i++) {
        normalizer.normalize(i)
      }
      // The 9th distinct ID (8) should be capped at 'Speaker 8'
      expect(normalizer.normalize(8)).toBe('Speaker 8')
    })
  })
})
