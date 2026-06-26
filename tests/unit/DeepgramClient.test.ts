import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- SDK mock -----------------------------------------------------------
// We store event handlers here so tests can trigger them manually
const handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
let connectCallArgs: unknown = null

const mockSendMedia = vi.fn()
const mockFinish = vi.fn()
const mockClose = vi.fn()

const mockSocket = {
  on(event: string, cb: (...args: unknown[]) => void) {
    if (!handlers[event]) handlers[event] = []
    handlers[event].push(cb)
  },
  connect: vi.fn(),
  sendMedia: mockSendMedia,
  finish: mockFinish,
  close: mockClose,
}

const mockConnect = vi.fn().mockResolvedValue(mockSocket)

vi.mock('@deepgram/sdk', () => {
  return {
    DeepgramClient: vi.fn().mockImplementation(() => ({
      listen: {
        v1: {
          connect: (...args: unknown[]) => {
            connectCallArgs = args[0]
            return mockConnect(...args)
          },
        },
      },
    })),
  }
})

// -----------------------------------------------------------------------

import { DeepgramClient } from '../../src/main/capture/DeepgramClient'

function emit(event: string, ...args: unknown[]) {
  ;(handlers[event] ?? []).forEach((cb) => cb(...args))
}

function makeClient(channel: 'mic' | 'system' = 'mic') {
  const onSegment = vi.fn()
  const onHealthChange = vi.fn()
  const client = new DeepgramClient({
    apiKey: 'test-key',
    channel,
    onSegment,
    onHealthChange,
  })
  return { client, onSegment, onHealthChange }
}

function clearHandlers() {
  for (const key of Object.keys(handlers)) {
    delete handlers[key]
  }
  connectCallArgs = null
  mockSendMedia.mockClear()
  mockFinish.mockClear()
  mockClose.mockClear()
  mockConnect.mockClear()
}

describe('DeepgramClient', () => {
  beforeEach(() => {
    clearHandlers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('connect() calls listen.v1.connect with mip_opt_out: true hardcoded', async () => {
    const { client } = makeClient()
    await client.connect('mtg-1')

    expect(connectCallArgs).toMatchObject({
      mip_opt_out: true,
      model: 'nova-3',
      diarize: 'true',
      encoding: 'linear16',
      sample_rate: 16000,
      reconnectAttempts: 0,
    })
  })

  it('speech_final message triggers onSegment', async () => {
    const { client, onSegment } = makeClient('mic')
    await client.connect('mtg-1')

    emit('message', {
      type: 'Results',
      speech_final: true,
      channel: {
        alternatives: [
          {
            transcript: 'Hello world',
            confidence: 0.95,
            words: [{ word: 'Hello', speaker: 0, start: 0, end: 0.5, confidence: 0.95 }],
          },
        ],
      },
      start: 0,
      duration: 0.5,
    })

    expect(onSegment).toHaveBeenCalledOnce()
    expect(onSegment).toHaveBeenCalledWith({
      transcript: 'Hello world',
      confidence: 0.95,
      channel: 'mic',
      speakerLabel: 'You',
      timestampStart: 0,
      timestampEnd: 0.5,
    })
  })

  it('non-speech_final message does not trigger onSegment', async () => {
    const { client, onSegment } = makeClient('mic')
    await client.connect('mtg-1')

    emit('message', {
      type: 'Results',
      speech_final: false,
      channel: {
        alternatives: [
          {
            transcript: 'Hello world',
            confidence: 0.95,
            words: [{ word: 'Hello', speaker: 0, start: 0, end: 0.5, confidence: 0.95 }],
          },
        ],
      },
      start: 0,
      duration: 0.5,
    })

    expect(onSegment).not.toHaveBeenCalled()
  })

  it('reconnect: handleDisconnect retries 3 times then calls onHealthChange("error")', async () => {
    vi.useFakeTimers()
    const { client, onHealthChange } = makeClient()
    await client.connect('mtg-1')

    // Each 'close' event starts a handleDisconnect cycle.
    // handleDisconnect waits RETRY_DELAY_MS then calls connect() again.
    // We trigger close once per retry and advance timers to let the delay + reconnect settle.

    // close → retry 1 (retryCount becomes 1)
    emit('close')
    await vi.runAllTimersAsync()

    // close → retry 2 (retryCount becomes 2)
    emit('close')
    await vi.runAllTimersAsync()

    // close → retry 3 (retryCount becomes 3)
    emit('close')
    await vi.runAllTimersAsync()

    // close → retryCount (3) >= MAX_RETRIES (3) → onHealthChange('error')
    emit('close')
    await vi.runAllTimersAsync()

    expect(onHealthChange).toHaveBeenCalledWith('error')
  })

  it('sendMedia during reconnect (socket null) is dropped silently', async () => {
    const { client } = makeClient()
    await client.connect('mtg-1')

    // Force socket to null via disconnect
    await client.disconnect()

    // Should not throw
    expect(() => client.sendMedia(Buffer.from([1, 2, 3]))).not.toThrow()
    // sendMedia on the underlying socket was not called
    expect(mockSendMedia).not.toHaveBeenCalled()
  })

  it('silence timer fires onHealthChange("silent") after 5 seconds', async () => {
    vi.useFakeTimers()
    const { client, onHealthChange } = makeClient()
    await client.connect('mtg-1')

    // Trigger 'open' so the silence timer starts
    emit('open')

    // Advance to just past the silence timeout
    await vi.advanceTimersByTimeAsync(5001)

    expect(onHealthChange).toHaveBeenCalledWith('silent')
  })

  it('sendMedia resets silence timer', async () => {
    vi.useFakeTimers()
    const { client, onHealthChange } = makeClient()
    await client.connect('mtg-1')

    // Start the silence timer
    emit('open')

    // Advance 4000ms (not enough to fire)
    await vi.advanceTimersByTimeAsync(4000)

    // Send media — this resets the 5s timer
    client.sendMedia(Buffer.from([1, 2, 3]))

    // Advance another 4000ms — total 8s from start, but only 4s since last reset
    await vi.advanceTimersByTimeAsync(4000)

    // 'silent' should NOT have been called yet (need 5s from last sendMedia)
    expect(onHealthChange).not.toHaveBeenCalledWith('silent')
  })
})
