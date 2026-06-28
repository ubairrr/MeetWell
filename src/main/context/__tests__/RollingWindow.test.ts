import { describe, it, expect } from 'vitest'
import { RollingWindow } from '../RollingWindow'

describe('RollingWindow', () => {
  it('returns 0 initially (no compression yet — all segments eligible)', () => {
    const rw = new RollingWindow()
    expect(rw.getCoveredUntil()).toBe(0)
  })

  it('returns the value after markEvicted', () => {
    const rw = new RollingWindow()
    rw.markEvicted(1000.5)
    expect(rw.getCoveredUntil()).toBe(1000.5)
  })

  it('is monotonic: markEvicted(900) after markEvicted(1000) does NOT decrease coveredUntil', () => {
    const rw = new RollingWindow()
    rw.markEvicted(1000)
    rw.markEvicted(900)
    expect(rw.getCoveredUntil()).toBe(1000)
  })

  it('advances when markEvicted is called with a larger value', () => {
    const rw = new RollingWindow()
    rw.markEvicted(1000)
    rw.markEvicted(1200)
    expect(rw.getCoveredUntil()).toBe(1200)
  })

  it('reset() restores coveredUntil to 0', () => {
    const rw = new RollingWindow()
    rw.markEvicted(5000)
    rw.reset()
    expect(rw.getCoveredUntil()).toBe(0)
  })

  it('can advance again after reset', () => {
    const rw = new RollingWindow()
    rw.markEvicted(5000)
    rw.reset()
    rw.markEvicted(100)
    expect(rw.getCoveredUntil()).toBe(100)
  })
})
