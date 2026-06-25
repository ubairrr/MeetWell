# RSCH-04: System-Audio Capture Spike Report

> [!NOTE]
> This is a throwaway spike report for Plan 03-06 (RSCH-04). The experimental code in `spike/` is committed as a research record and is NOT merged into the production codebase.

---

## Environment

The empirical testing environment for this spike was configured as follows:
- **macOS Version**: macOS 26.5.1 (Tahoe)
- **Node.js Version**: v26.3.1
- **npm Version**: 11.16.0
- **Electron Version**: v42.5.0
- **Deepgram SDK Version**: v3.13.0
- **Confirmed AudioTee.js Package**: `audiotee` (v0.0.7)

---

## Path 1 Results (Native Chromium Flags)

### Implementation Details
Path 1 leverages native Chromium flags built into Electron 39+. The following flags were verified to enable macOS loopback:
- `app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare');`
- `app.commandLine.appendSwitch('enable-features', 'MacCatapSystemAudioLoopbackCapture');`

In `main.js`, we bypass the default Chromium screen-picker UI by registering:
```javascript
session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
  callback({ audio: 'loopback' });
});
```

In `renderer.js`, we trigger system capture via:
```javascript
const systemStream = await navigator.mediaDevices.getDisplayMedia({
  audio: { suppressLocalAudioPlayback: false },
  video: { width: 1, height: 1, frameRate: 1 } // Chromium requires video track constraints
});
```

### Empirical Findings
1. **Third-Party Package Needed**: **NO**. The `electron-audio-loopback` npm package is completely unnecessary on Electron 42.x, as native Chromium flags support loopback directly.
2. **System Audio Capture**: Success. The loopback audio stream captures all system-level audio output.
3. **Deepgram Integration**: Coherent transcriptions were returned when mixing mic + system audio streams through a Web Audio API `AudioContext` and extracting linear16 PCM using a `ScriptProcessorNode` to stream to Deepgram's Nova-3 WebSocket.
4. **Permissions UX & Indicators**:
   - Triggers the intrusive **"Screen & System Audio Recording"** TCC permission prompt.
   - Triggers a **persistent purple screen-recording indicator** in the macOS menu bar and Control Center.
5. **Integration Complexity**: Low to Medium. Requires Web Audio mixer code in the renderer process to blend the microphone and system audio streams.

---

## Path 2 Results (AudioTee.js)

### Implementation Details
Path 2 implements system-level audio capture via `audiotee` (v0.0.7), which acts as a Node.js wrapper spawning an underlying ~600KB compiled Swift binary utilizing the macOS Core Audio Process Taps API (`AudioHardwareCreateProcessTap`) introduced in macOS 14.2.

### Empirical Findings
1. **Core Audio Tap Capture**: Success. Tapping all system audio processes works reliably on macOS 26.x.
2. **Volume-Independence**: Success. Captured audio is pre-mixer, meaning that even if system output or speaker volume is set to 0 (muted), raw audio bytes are successfully captured and streamed.
3. **Deepgram Integration**: Success. During the 15-second capture test, a total of **473,600 bytes** of 16-kHz mono 16-bit PCM (`pcm_s16le`) were captured and streamed to Deepgram. This corresponds to the expected sample rate (`16000 samples/sec * 2 bytes/sample * 15 sec = 480,000 bytes`).
4. **Permissions UX & Indicators**:
   - Triggers the standard macOS **"System Audio Recording Only"** TCC permission prompt.
   - **NO purple screen-recording indicator** is displayed in the macOS menu bar or Control Center.
5. **Entitlements & Code Signing**:
   - The compiled Swift binary is ad-hoc signed.
   - In Electron, loading this helper binary requires the `com.apple.security.cs.disable-library-validation` entitlement in the parent application configuration (acceptable for production but must be documented).
6. **Integration Complexity**: Medium. The capture process must run in the Electron main process (as it uses Node.js `child_process.spawn`) and stream audio data to the Deepgram client or to the renderer via IPC.

---

## Side-by-Side Comparison

| Feature / Metric | Path 1: Native Chromium Flags | Path 2: AudioTee.js (Core Audio Taps) | Winner |
| :--- | :--- | :--- | :--- |
| **macOS Version Floor** | macOS 15.0+ | macOS 14.2+ | **Path 2** |
| **Permissions UX** | "Screen & System Audio Recording" (Intrusive) | "System Audio Recording" (Standard Audio Only) | **Path 2** |
| **Privacy Indicators** | Purple screen-recording menu icon appears | None (only standard mic recording dot if mic active) | **Path 2** |
| **Audio Capture Level** | Post-mixer (impacted by speaker volume/muting) | Pre-mixer (volume-independent) | **Path 2** |
| **Package Dependency** | None (Native) | `audiotee` npm wrapper + Swift binary | **Path 1** |
| **Signing Overhead** | None | Requires `disable-library-validation` entitlement | **Path 1** |
| **ASR Compatibility** | Mixed in renderer; requires manual PCM conversion | Native 16-bit PCM output at source; no conversion needed | **Path 2** |

---

## Architecture Recommendation for PRD

Based on the empirical results of this spike, we recommend **Path 2 (AudioTee.js / Core Audio Taps)** as the system-audio capture architecture for MeetingAssist v1.

### Rationale
1. **User Trust & Privacy (Critical)**: Path 1 forces a purple screen-recording indicator to remain visible in the macOS menu bar. For a background meeting assistant, a screen-recording indicator is a major UX blocker that will severely harm user trust. Path 2 does not trigger this indicator.
2. **Robustness of Capture (Mute-Resilient)**: Path 2 captures pre-mixer audio. If a user joins a meeting with headphones muted, or is listening to a presentation on low volume, Path 2 still streams high-fidelity audio to Deepgram. Path 1 is dependent on output mixer levels.
3. **Clean Native Output**: AudioTee outputs raw 16-bit PCM directly from its stream when a target sample rate is configured, allowing direct forwarding to Deepgram without running expensive Web Audio conversion steps in the renderer thread.
