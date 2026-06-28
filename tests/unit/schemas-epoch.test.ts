import { describe, it, expect } from 'vitest'
import { EpochSummarySchema } from '../../src/shared/schemas/index'
import type { StoredEpochSummary } from '../../src/shared/schemas/index'
import { ZodError } from 'zod'

describe('EpochSummarySchema', () => {
  it('parses a full valid epoch summary', () => {
    const result = EpochSummarySchema.parse({
      decisions: ['d1'],
      action_items: ['a1'],
      key_points: ['k1'],
      speaker_attributions: { 'Speaker 0': 'led discussion' },
    })
    expect(result.decisions).toEqual(['d1'])
    expect(result.action_items).toEqual(['a1'])
    expect(result.key_points).toEqual(['k1'])
    expect(result.speaker_attributions).toEqual({ 'Speaker 0': 'led discussion' })
  })

  it('accepts empty arrays and empty record', () => {
    const result = EpochSummarySchema.parse({
      decisions: [],
      action_items: [],
      key_points: [],
      speaker_attributions: {},
    })
    expect(result.decisions).toEqual([])
    expect(result.action_items).toEqual([])
    expect(result.key_points).toEqual([])
    expect(result.speaker_attributions).toEqual({})
  })

  it('throws ZodError when decisions is not an array', () => {
    expect(() =>
      EpochSummarySchema.parse({
        decisions: 'not-array',
        action_items: [],
        key_points: [],
        speaker_attributions: {},
      })
    ).toThrow(ZodError)
  })

  it('throws ZodError when action_items is missing', () => {
    expect(() =>
      EpochSummarySchema.parse({
        decisions: [],
        key_points: [],
        speaker_attributions: {},
      })
    ).toThrow(ZodError)
  })

  it('throws ZodError when speaker_attributions is an array instead of record', () => {
    expect(() =>
      EpochSummarySchema.parse({
        decisions: [],
        action_items: [],
        key_points: [],
        speaker_attributions: ['not', 'a', 'record'],
      })
    ).toThrow(ZodError)
  })
})

describe('StoredEpochSummary interface', () => {
  it('allows a fully typed StoredEpochSummary object', () => {
    // This test is a compile-time check — if StoredEpochSummary is not exported
    // this file will fail to compile and the test will not run.
    const stored: StoredEpochSummary = {
      id: 'epoch-1',
      meeting_id: 'meeting-1',
      covered_interval_start: 0,
      covered_interval_end: 3600,
      decisions: ['d1'],
      action_items: ['a1'],
      key_points: ['k1'],
      speaker_attributions: { 'Speaker 0': 'led discussion' },
      raw_segment_count: 120,
      token_count_compressed: 4500,
      created_at: '2026-01-01T00:00:00Z',
    }
    expect(stored.id).toBe('epoch-1')
    expect(stored.raw_segment_count).toBe(120)
  })
})
