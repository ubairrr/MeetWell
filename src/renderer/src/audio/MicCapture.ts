export interface MicCaptureHandle {
  stop(): Promise<void>
}

export async function startMicCapture(): Promise<MicCaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    video: false,
  })

  const ctx = new AudioContext({ sampleRate: 16000 })

  await ctx.audioWorklet.addModule('/audio/mic-processor.worklet.js')

  const source = ctx.createMediaStreamSource(stream)
  const workletNode = new AudioWorkletNode(ctx, 'mic-processor')

  workletNode.port.onmessage = (event: MessageEvent) => {
    if (event.data?.type !== 'audio') return
    // Send ArrayBuffer (not Uint8Array) — Electron IPC bug #35152
    window.electronAPI.invoke('mic-audio-chunk', event.data.buffer).catch((err: unknown) => {
      console.error('[MicCapture] IPC error:', err)
    })
  }

  source.connect(workletNode)
  // Do NOT connect to destination — capture only, no playback

  return {
    async stop(): Promise<void> {
      workletNode.port.onmessage = null
      workletNode.disconnect()
      source.disconnect()
      stream.getTracks().forEach(t => t.stop())
      await ctx.close()
    },
  }
}
