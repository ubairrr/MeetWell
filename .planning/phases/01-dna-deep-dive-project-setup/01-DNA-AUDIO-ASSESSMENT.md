# DNA Audio-Capture Assessment

**Domain:** DNA's real system-audio capture method + effective minimum macOS version
**Assessed:** 2026-06-25
**Confidence:** HIGH (direct reads from `DNA/src/renderer/audio.js`, `DNA/src/main.js`, `DNA/package.json`, and shipped binary `Info.plist`)
**Satisfies:** DNA-04
**Downstream consumer:** Phase 3 RSCH-04 (capture spike + supported-OS floor decision)

---

## Purpose

This document records the DNA's **real** system-audio capture mechanism and its effective minimum macOS version as verified from source and binary. It is written as input to the Phase 3 RSCH-04 spike, which must validate the capture path under full-meeting conditions and declare the officially supported OS floor.

---

## Real Capture Method

The DNA captures system audio via **Chromium's ScreenCaptureKit loopback**, implemented hand-rolled using Electron's `desktopCapturer` API rather than via the `electron-audio-loopback` npm package. The mechanism is a **post-mixer** loopback path — audio is captured after macOS's volume mixer, meaning output volume affects what is recorded.

### How It Works — Step by Step

**Step 1 — Obtain a screen source ID (main process, `DNA/src/main.js:202-207`):**

```
ipcMain.handle('get-desktop-source-id', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  return sources[0]?.id || null;
});
```

The renderer invokes the `get-desktop-source-id` IPC bridge, which calls `desktopCapturer.getSources({types:['screen']})` and returns the first screen source's `id`.

**Step 2 — Capture both audio and video, then discard video (renderer, `DNA/src/renderer/audio.js:11-37`):**

```javascript
const desktopStream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } },
    video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } }
});
const audioTracks = desktopStream.getAudioTracks();
if (audioTracks.length > 0) {
    systemAudioStream = new MediaStream(audioTracks);
}
desktopStream.getVideoTracks().forEach(t => t.stop());  // video discarded immediately
```

`getUserMedia` is called with **both** audio and video constraints (Chromium requires both for the loopback path to activate), but video tracks are stopped immediately after the call. Only the audio tracks are kept in `systemAudioStream`.

---

## The Mandatory Enabling Flag

Capture **silently fails with no error** if the following Chromium flag is absent:

```
--enable-features=MacLoopbackAudioForScreenShare
```

This flag is passed on the Electron launch command in both dev and production scripts (`DNA/package.json:8,11`):

```json
"dev:electron": "...electron . --enable-features=MacLoopbackAudioForScreenShare",
"start:prod": "NODE_ENV=production electron . --enable-features=MacLoopbackAudioForScreenShare"
```

**Risk:** Omitting this flag produces no error output — the system audio stream simply comes back empty or null. MeetingAssist must include this flag (or its `electron-audio-loopback` equivalent) from day one and include a runtime health check to detect silent capture failure. This is a key input to RSCH-04's capture-health detection task.

---

## Channel Handling

Mic and system audio are kept **completely separate, end-to-end**:

```
Mic stream       → AudioWorklet (mic)    → IPC (sendMicAudioChunk)    → Deepgram socket #1
System stream    → AudioWorklet (system) → IPC (sendSystemAudioChunk) → Deepgram socket #2
```

There is **no diarization** — "You vs Interviewer/Others" labeling is purely positional: whichever physical channel the audio came from determines the speaker label. This is the cheap, reliable baseline RSCH-02 should build "You vs Others" on for MeetingAssist. For actual multi-speaker diarization within a single audio channel (e.g., multiple people in a meeting room), a proper STT diarization feature (Deepgram Nova-3 diarization) is required — the DNA's channel-split approach does not provide this.

---

## Permission Model

The Chromium ScreenCaptureKit loopback path triggers the macOS **Screen Recording** permission (TCC), which causes the **purple screen-recording indicator** to appear in the macOS Control Center menu bar during capture.

**Failure handling (`DNA/src/main.js:209-223`):**

If `getUserMedia` throws a `Permission denied` error, the renderer calls `window.electron.requestScreenPermission()` → main shows a system dialog deep-linking to macOS Privacy settings:

```
x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture
```

The user is offered "Open Settings" or "Continue Without System Audio." On the AudioTee.js premium path (CLAUDE.md), the permission is "System Audio Recording Only" (no purple indicator), but that path requires macOS 14.2+ and a signed Swift binary.

---

## Entitlements as Shipped

`build/entitlements.mac.plist` contains only:
- `com.apple.security.cs.allow-jit`
- `com.apple.security.cs.allow-unsigned-executable-memory`
- `com.apple.security.device.audio-input`

The built `Info.plist` carries `NSMicrophoneUsageDescription`, `NSAudioCaptureUsageDescription`, and `NSCameraUsageDescription` — but **no `NSScreenCaptureUsageDescription`** and **no `com.apple.security.cs.disable-library-validation`**.

> `disable-library-validation` is absent because the DNA bundles no Swift binary. The AudioTee.js premium path (CLAUDE.md) would add this entitlement.

---

## Effective Minimum macOS Version

| Evidence Source | Value | Confidence |
|-----------------|-------|------------|
| Shipped binary `Contents/Info.plist` → `LSMinimumSystemVersion` | **12.0** | HIGH (read from the actual built `.app`) |
| Electron 40.6.1 (`electron-builder` baseline) | Electron sets the floor; 12.0 is what builder stamped | HIGH |
| README platform claims | "macOS only"; no explicit numeric floor | MEDIUM |

**Effective packaging floor = macOS 12.0 (Monterey)** as stamped in the shipped binary's `Info.plist`.

---

## RSCH-04 Handoff — Critical Framing

**12.0 is the packaging floor and the starting hypothesis for RSCH-04 — it is NOT a real-world reliability guarantee.**

Three reasons the floor may be higher in practice:

1. **ScreenCaptureKit reliability by OS version.** The `MacLoopbackAudioForScreenShare` flag and ScreenCaptureKit loopback behavior are materially better on macOS 13.x+ (Ventura). Anecdotal developer reports indicate capture is unreliable or silently empty on 12.x in some configurations. The DNA's 1:1 interview use never stress-tested this under real conditions.

2. **Multi-speaker full-meeting capture was never validated.** The DNA was built for 1:1 interviews (one mic, one system source). MeetingAssist's core use case — multiple participants in an extended meeting — has never been exercised on this code path. Scaling, duration, and concurrent Deepgram socket behavior under load are unknown.

3. **Premium AudioTee path needs 14.2+.** CLAUDE.md's premium capture variant (Core Audio Taps via AudioTee.js) requires macOS 14.2+ for `AudioHardwareCreateProcessTap`. The floor for the two-path strategy is therefore: default loopback path = TBD by spike, premium path = 14.2+.

### What RSCH-04 Must Do

RSCH-04 (Phase 3, capture spike) is the named consumer of this assessment. It must:

1. **Validate the `MacLoopbackAudioForScreenShare` loopback path across macOS 12 / 13 / 14 / 15** under multi-speaker full-meeting conditions (>30 min, multiple concurrent participants).
2. **Declare the supported OS floor** — superseding this assessment's 12.0 packaging hypothesis with an evidence-backed decision.
3. **Design and implement a capture-health detection approach** — silent capture failure (stream returns but is empty or silent due to missing flag, revoked permissions, or OS-version incompatibility) must be detected and surfaced to the user in real time. The DNA has no such health check.
4. **Evaluate whether `electron-audio-loopback`** (the packaged npm equivalent, CLAUDE.md §"Default") is a drop-in replacement for the DNA's hand-rolled approach or whether it provides additional reliability/compatibility.
5. **Produce a recommendation on the two-path strategy**: default Chromium loopback (broader OS support, purple indicator, post-mixer) vs. AudioTee.js premium (14.2+ only, cleaner permissions, pre-mixer, requires signed binary).

---

## Comparison: DNA Approach vs. CLAUDE.md Recommended Paths

| Property | DNA (hand-rolled) | `electron-audio-loopback` (CLAUDE.md default) | AudioTee.js (CLAUDE.md premium) |
|----------|-------------------|------------------------------------------------|----------------------------------|
| Mechanism | `desktopCapturer` + `getUserMedia({chromeMediaSource:'desktop'})` | Same Chromium ScreenCaptureKit flags, packaged | Core Audio Taps (`AudioHardwareCreateProcessTap`) |
| macOS floor | 12.0 (packaged); real floor TBD by RSCH-04 | 13.2+ per CLAUDE.md | **14.2+** |
| Audio path | Post-mixer (volume-dependent) | Post-mixer | **Pre-mixer** (volume-independent) |
| Permission | Screen Recording (purple indicator) | Screen Recording (purple indicator) | System Audio Recording Only (no purple indicator) |
| Bundled binary | None | None | ~600KB signed Swift binary |
| Notarization | Clean | Clean | Clean (with proper signing + entitlement) |
| Flag required | `MacLoopbackAudioForScreenShare` | Managed by package | N/A |
| Health check | None | TBD (package may provide) | TBD |

The DNA's hand-rolled approach is **functionally equivalent to `electron-audio-loopback`** (same Chromium flags, same ScreenCaptureKit path). RSCH-04 should evaluate whether to adopt the npm package for maintainability or continue hand-rolling.

---

## Summary for Downstream Phases

| Fact | Value | Source |
|------|-------|--------|
| Capture mechanism | Chromium ScreenCaptureKit loopback via `desktopCapturer` | `DNA/src/renderer/audio.js:11-37`, `DNA/src/main.js:202-207` |
| Mandatory flag | `--enable-features=MacLoopbackAudioForScreenShare` | `DNA/package.json:8,11` |
| Silent failure risk | YES — no flag = no audio, no error | `DNA/package.json:8,11` |
| Audio path type | Post-mixer (volume-dependent) | Code analysis |
| Channel strategy | Mic + system audio separate end-to-end | `DNA/src/renderer/audio.js:43-60` |
| Diarization | None — channel = physical source only | Code analysis |
| Permission triggered | Screen Recording (purple indicator) | `DNA/src/main.js:209-223` |
| Failure path | Dialog → deep-link to Privacy_ScreenCapture | `DNA/src/main.js:209-223` |
| Entitlements (shipped) | allow-jit, allow-unsigned-executable-memory, device.audio-input | `build/entitlements.mac.plist` |
| No `disable-library-validation` | Correct — no Swift binary bundled | Entitlements verified |
| Effective packaging floor | macOS **12.0** (Monterey) | Shipped binary `Info.plist` `LSMinimumSystemVersion` |
| Real-world floor | **Unknown — RSCH-04 to declare** | RSCH-04 spike deliverable |
| Premium path floor | macOS **14.2+** (AudioTee.js) | CLAUDE.md §"macOS System-Audio Capture" |
