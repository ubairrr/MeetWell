---
plan: 07-03
phase: 07-capture-transcriptstore
title: audiotee system audio source + packaging
status: complete
completed_at: 2026-06-27
---

`audiotee` 0.0.7 Swift binary wired as the primary system audio source via Core Audio Taps. `SystemAudioSource` class wraps the binary spawn with stdout PCM piping to the Deepgram system-channel `DeepgramClient`. `electron-builder.yml` updated with `asarUnpack: ["resources/audiotee"]` and `extraResources` entry. `package.json` `postinstall` script runs `electron-rebuild` for `better-sqlite3-multiple-ciphers` to target Electron ABI.
