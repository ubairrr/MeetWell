---
plan: 07-04
phase: 07-capture-transcriptstore
title: AudioWorklet mic bridge (renderer-side)
status: complete
completed_at: 2026-06-27
---

`mic-processor.worklet.js` AudioWorkletProcessor implemented in renderer; streams Float32 PCM frames to main process via `mic-audio-chunk` IPC. `MicCapture` TypeScript class manages `AudioContext`, `MediaStreamTrack`, and AudioWorklet lifecycle. IPC handler in main process forwards PCM to the microphone-channel `DeepgramClient`. Unit tests cover worklet message serialisation and MicCapture start/stop lifecycle.
