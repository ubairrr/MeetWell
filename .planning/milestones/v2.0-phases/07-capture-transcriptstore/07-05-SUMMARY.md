---
plan: 07-05
phase: 07-capture-transcriptstore
title: CaptureService — orchestrate both channels
status: complete
completed_at: 2026-06-27
---

`CaptureService` orchestrates both audio channels: calls `TranscriptStore.createMeeting()` on start, instantiates two `DeepgramClient` instances (mic + system), wires `SystemAudioSource` and `MicCapture`, and persists every `speech_final` segment via `TranscriptStore.insertSegment()`. Endpointing tuned to 500ms after fixing mid-clause boundary issues. Segments flush on `UtteranceEnd` instead of `speech_final` for better boundary accuracy. Unit tests added covering `TranscriptStore` write path from `CaptureService`.
