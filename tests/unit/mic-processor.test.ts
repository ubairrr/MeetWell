import { describe, it, expect } from 'vitest'

// Mirror the exact algorithm from the worklet
function float32ToInt16(samples: Float32Array): Int16Array {
  const int16 = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    int16[i] = s < 0 ? (s * 32768) : (s * 32767)
  }
  return int16
}

describe('float32ToInt16', () => {
  it('float32 0.0 → int16 0', () => { expect(float32ToInt16(new Float32Array([0.0]))[0]).toBe(0) })
  it('float32 1.0 → int16 32767', () => { expect(float32ToInt16(new Float32Array([1.0]))[0]).toBe(32767) })
  it('float32 -1.0 → int16 -32768', () => { expect(float32ToInt16(new Float32Array([-1.0]))[0]).toBe(-32768) })
  it('clipping above 1.0 clamped to 32767', () => { expect(float32ToInt16(new Float32Array([1.5]))[0]).toBe(32767) })
  it('clipping below -1.0 clamped to -32768', () => { expect(float32ToInt16(new Float32Array([-1.5]))[0]).toBe(-32768) })
  it('4000 samples at 16kHz = 8000 bytes', () => { expect(new Int16Array(4000).buffer.byteLength).toBe(8000) })
  it('silence frame all zeros → all int16 zeros', () => {
    const result = float32ToInt16(new Float32Array(4000))
    expect(Array.from(result).every(v => v === 0)).toBe(true)
  })
})
