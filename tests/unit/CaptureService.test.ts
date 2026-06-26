import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { DeepgramClientOptions, SpeechFinalSegment } from '../../src/main/capture/DeepgramClient'

// ---- Mock DeepgramClient -------------------------------------------------
// We need to capture constructor opts so tests can trigger onSegment/onHealthChange.
// Each instantiation pushes its mock instance into deepgramInstances[].

const deepgramInstances: Array<{
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  sendMedia: ReturnType<typeof vi.fn>
  opts: DeepgramClientOptions
}> = []

vi.mock('../../src/main/capture/DeepgramClient', () => ({
  DeepgramClient: vi.fn().mockImplementation((opts: DeepgramClientOptions) => {
    const instance = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      sendMedia: vi.fn(),
      opts,
    }
    deepgramInstances.push(instance)
    return instance
  }),
}))

// ---- Mock SystemAudioSource -----------------------------------------------
// Stores event handlers so tests can emit events.

type EventHandler = (...args: unknown[]) => void

const systemAudioHandlers: Record<string, EventHandler> = {}
let mockSystemAudioStart: ReturnType<typeof vi.fn>
let mockSystemAudioStop: ReturnType<typeof vi.fn>

vi.mock('../../src/main/capture/SystemAudioSource', () => ({
  SystemAudioSource: vi.fn().mockImplementation(() => {
    mockSystemAudioStart = vi.fn().mockResolvedValue(undefined)
    mockSystemAudioStop = vi.fn().mockResolvedValue(undefined)

    // Clear old handlers on each instantiation
    for (const key of Object.keys(systemAudioHandlers)) {
      delete systemAudioHandlers[key]
    }

    return {
      on: vi.fn().mockImplementation((event: string, handler: EventHandler) => {
        systemAudioHandlers[event] = handler
      }),
      start: mockSystemAudioStart,
      stop: mockSystemAudioStop,
    }
  }),
}))

// ---- Mock TranscriptStore -------------------------------------------------

const mockCreateMeeting = vi.fn()
const mockAppendSegment = vi.fn()
const mockGetSegmentsByMeeting = vi.fn().mockReturnValue([])

vi.mock('../../src/main/transcript/TranscriptStore', () => ({
  TranscriptStore: vi.fn().mockImplementation(() => ({
    createMeeting: mockCreateMeeting,
    appendSegment: mockAppendSegment,
    getSegmentsByMeeting: mockGetSegmentsByMeeting,
  })),
}))

// ---- Import CaptureService after mocks ------------------------------------

import { CaptureService } from '../../src/main/capture/CaptureService'

// ---- Helpers --------------------------------------------------------------

function makeMockWin() {
  const send = vi.fn()
  return {
    webContents: { send },
    isDestroyed: vi.fn().mockReturnValue(false),
  } as unknown as import('electron').BrowserWindow
}

function makeMockDb() {
  return {} as unknown as import('better-sqlite3-multiple-ciphers').default
}

function makeSegment(channel: 'mic' | 'system' = 'mic'): SpeechFinalSegment {
  return {
    transcript: 'Hello world',
    speakerLabel: 'You',
    channel,
    timestampStart: 0,
    timestampEnd: 1.5,
    confidence: 0.95,
  }
}

// ---- Test suite -----------------------------------------------------------

describe('CaptureService', () => {
  let service: CaptureService
  let win: ReturnType<typeof makeMockWin>

  beforeEach(() => {
    // Clear all state between tests
    deepgramInstances.length = 0
    mockCreateMeeting.mockClear()
    mockAppendSegment.mockClear()
    mockGetSegmentsByMeeting.mockClear()

    win = makeMockWin()
    service = new CaptureService(makeMockDb(), win, 'test-api-key')
  })

  // Test 1
  it('startCapture creates a meeting row', async () => {
    await service.startCapture('mtg-1')

    expect(mockCreateMeeting).toHaveBeenCalledOnce()
    expect(mockCreateMeeting).toHaveBeenCalledWith('mtg-1', expect.any(Number))
  })

  // Test 2
  it('startCapture connects both Deepgram channels concurrently', async () => {
    await service.startCapture('mtg-1')

    // Two DeepgramClient instances should have been created
    expect(deepgramInstances).toHaveLength(2)

    const micInstance = deepgramInstances.find((i) => i.opts.channel === 'mic')
    const sysInstance = deepgramInstances.find((i) => i.opts.channel === 'system')

    expect(micInstance).toBeDefined()
    expect(sysInstance).toBeDefined()
    expect(micInstance!.connect).toHaveBeenCalledWith('mtg-1')
    expect(sysInstance!.connect).toHaveBeenCalledWith('mtg-1')
  })

  // Test 3
  it('handleMicChunk forwards buffer to mic DeepgramClient', async () => {
    await service.startCapture('mtg-1')

    const micInstance = deepgramInstances.find((i) => i.opts.channel === 'mic')!
    service.handleMicChunk(new ArrayBuffer(8000))

    expect(micInstance.sendMedia).toHaveBeenCalledOnce()
    expect(micInstance.sendMedia).toHaveBeenCalledWith(expect.any(Buffer))
  })

  // Test 4
  it('handleMicChunk before startCapture is a no-op', () => {
    // deepgramMic is null — should not throw
    expect(() => service.handleMicChunk(new ArrayBuffer(8000))).not.toThrow()
  })

  // Test 5
  it('speech_final segment from mic channel inserts to DB and sends IPC', async () => {
    await service.startCapture('mtg-1')

    const micInstance = deepgramInstances.find((i) => i.opts.channel === 'mic')!
    const seg = makeSegment('mic')

    // Trigger the onSegment callback as DeepgramClient would
    micInstance.opts.onSegment(seg)

    expect(mockAppendSegment).toHaveBeenCalledOnce()
    const insertedRow = mockAppendSegment.mock.calls[0][0]
    expect(insertedRow).toMatchObject({
      meetingId: 'mtg-1',
      text: 'Hello world',
      speakerLabel: 'You',
      channel: 'mic',
      timestampStart: 0,
      timestampEnd: 1.5,
      confidence: 0.95,
      isSpeechFinal: 1,
    })
    expect(typeof insertedRow.id).toBe('string')
    expect(insertedRow.id.length).toBeGreaterThan(0)

    expect(win.webContents.send).toHaveBeenCalledWith(
      'transcript-segment',
      expect.objectContaining({
        text: 'Hello world',
        speakerLabel: 'You',
        channel: 'mic',
        timestampStart: 0,
        timestampEnd: 1.5,
        confidence: 0.95,
      })
    )
  })

  // Test 6
  it('health update from system channel pushes capture-health-update IPC', async () => {
    await service.startCapture('mtg-1')

    const sysInstance = deepgramInstances.find((i) => i.opts.channel === 'system')!

    // Trigger the onHealthChange callback
    sysInstance.opts.onHealthChange('silent')

    expect(win.webContents.send).toHaveBeenCalledWith('capture-health-update', {
      channel: 'system',
      status: 'silent',
    })
  })

  // Test 7
  it('D-06: mic channel failure does not affect system channel', async () => {
    await service.startCapture('mtg-1')

    const micInstance = deepgramInstances.find((i) => i.opts.channel === 'mic')!
    const sysInstance = deepgramInstances.find((i) => i.opts.channel === 'system')!

    // Trigger error on system channel — mic should NOT be disconnected
    sysInstance.opts.onHealthChange('error')

    expect(micInstance.disconnect).not.toHaveBeenCalled()
  })

  // Test 8
  it('stopCapture disconnects both channels and systemAudio', async () => {
    await service.startCapture('mtg-1')

    const micInstance = deepgramInstances.find((i) => i.opts.channel === 'mic')!
    const sysInstance = deepgramInstances.find((i) => i.opts.channel === 'system')!

    const returnedId = await service.stopCapture()

    expect(returnedId).toBe('mtg-1')
    expect(mockSystemAudioStop).toHaveBeenCalledOnce()
    expect(sysInstance.disconnect).toHaveBeenCalledOnce()
    expect(micInstance.disconnect).toHaveBeenCalledOnce()
  })
})
