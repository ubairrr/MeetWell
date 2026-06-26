// AudioWorkletProcessor: Float32 → Int16 PCM conversion
// D-01: conversion happens here, before postMessage
// D-02: flush every 4,000 samples (250ms at 16kHz)

const TARGET_SAMPLES = 4000

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buffer = new Float32Array(TARGET_SAMPLES)
    this._offset = 0
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel || channel.length === 0) return true

    let i = 0
    while (i < channel.length) {
      const remaining = TARGET_SAMPLES - this._offset
      const toCopy = Math.min(remaining, channel.length - i)

      this._buffer.set(channel.subarray(i, i + toCopy), this._offset)
      this._offset += toCopy
      i += toCopy

      if (this._offset >= TARGET_SAMPLES) {
        const int16 = new Int16Array(TARGET_SAMPLES)
        for (let j = 0; j < TARGET_SAMPLES; j++) {
          const s = Math.max(-1, Math.min(1, this._buffer[j]))
          int16[j] = s < 0 ? (s * 32768) : (s * 32767)
        }
        // Transfer ownership — zero-copy, CAPT-09 compliant
        this.port.postMessage({ type: 'audio', buffer: int16.buffer }, [int16.buffer])
        this._buffer = new Float32Array(TARGET_SAMPLES)
        this._offset = 0
      }
    }
    return true
  }
}

registerProcessor('mic-processor', MicProcessor)
