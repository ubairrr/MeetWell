import { describe, it, expect } from 'vitest'
import { CitationValidator } from './CitationValidator'

describe('CitationValidator', () => {
  const validator = new CitationValidator()

  it('exact match returns 1.0', () => {
    const result = validator.score(
      'I will handle the backend changes by end of week',
      'I will handle the backend changes by end of week'
    )
    expect(result).toBe(1.0)
  })

  it('high overlap passes threshold', () => {
    const result = validator.score(
      'I will handle the backend changes',
      'I will handle the backend changes by end of week'
    )
    expect(result).toBeGreaterThanOrEqual(0.90)
  })

  it('fabricated citation fails threshold', () => {
    const result = validator.score(
      'Alice will lead the marketing campaign launch',
      'I will handle the backend changes by end of week'
    )
    expect(result).toBeLessThan(0.90)
  })

  it('empty inputs return 1.0 and 0.0 correctly', () => {
    expect(validator.score('', '')).toBe(1.0)
    expect(validator.score('hello', '')).toBe(0.0)
  })

  it('validate() returns true when best citation score >= 0.90', () => {
    const result = validator.validate(
      'I will handle the backend changes',
      [{ quote_full: 'I will handle the backend changes by end of week' }]
    )
    expect(result).toBe(true)
  })

  it('validate() returns false when no citation score >= 0.90 (fabricated citation rejection)', () => {
    const result = validator.validate(
      'Alice will launch the marketing campaign globally',
      [{ quote_full: 'I will handle the backend changes by end of week' }]
    )
    expect(result).toBe(false)
  })
})
