---
plan: 07-02
phase: 07-capture-transcriptstore
title: DeepgramClient — single-channel WebSocket wrapper
status: complete
completed_at: 2026-06-27
---

`DeepgramClient` implemented as a single-channel WebSocket wrapper around the Deepgram Nova-3 SDK. Handles `speech_final` events and emits `TranscriptSegment` objects with speaker label and confidence. `SpeakerNormalizer` normalises raw Deepgram speaker integers to `microphone`/`system` channel labels. Unit tests cover event emission, reconnect logic, and speaker normalisation edge cases.
