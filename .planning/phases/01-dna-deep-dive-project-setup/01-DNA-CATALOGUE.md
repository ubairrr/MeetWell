# Phase 1: Selective-Adoption Catalogue — Interview Helper DNA Techniques

**Domain:** Code-level analysis of the Interview Helper DNA reference repo — which proven techniques to borrow-and-adapt, design-reference, or leave-behind for MeetingAssist
**Assessed:** 2026-06-25
**Confidence:** HIGH (all mechanism claims are direct reads of local source with `file:line` citations; all code excerpts verified against the live `DNA/src/...` tree)

---

> **This is a selective-adoption analysis. It is explicitly NOT a wholesale port of Interview Helper.**
>
> MeetingAssist is a new product with a different purpose: capturing full-meeting transcripts and generating trustworthy artifacts (minutes, action items, schedules). Interview Helper was purpose-built for 1:1 interview coaching. The techniques catalogued below are borrowed only where they genuinely solve MeetingAssist's problems. Everything else is left behind.
>
> **Requirements satisfied:** DNA-01 (relevant modules read with `file:line` evidence), DNA-02 (catalogue + leave-behind list), DNA-03 (selective-adoption plan with explicit verdicts).

---

## Verdict Taxonomy (D-03)

| Verdict | Meaning |
|---------|---------|
| `borrow-and-adapt` | Lift the technique from DNA; change it to fit MeetingAssist's domain |
| `design-reference` | Re-implement clean from scratch; learn from DNA's design without reusing the code |
| `leave-behind` | Abandon; superseded, wrong domain, or a security anti-pattern |
| `defer/undecided` | Cannot be classified yet — used only when truly unclassifiable |

---

## Catalogue: 5 Techniques (D-04 5-field structure)

---

### Technique 1: Dual-Channel Real-Time STT + `speech_final` Accumulation State Machine

**Verdict: `borrow-and-adapt`** — Deep code-level evidence (D-06)

#### What DNA Does

The renderer opens **two independent capture streams** in `DNA/src/renderer/audio.js:1-69`:
- Microphone: `navigator.mediaDevices.getUserMedia({ audio: true })` → own `AudioWorkletNode`
- System audio: `desktopCapturer` source id → `getUserMedia({ mandatory: { chromeMediaSource: 'desktop' } })` → own `AudioWorkletNode`

Each worklet (`DNA/src/renderer/public/audio-processor.js:1-16`) posts raw Float32 frames back to the renderer, which forwards them over separate IPC channels (`sendMicAudioChunk` / `sendSystemAudioChunk`). Main converts Float32→Int16 PCM at 16 kHz mono (`DNA/src/main.js:28-35`) and feeds two separate Deepgram `listen.live` WebSocket connections, each labeled by channel (`DNA/src/main.js:79-123, 125-181`).

The **state machine** (system channel only) at `DNA/src/main.js:102-109`:
```javascript
if (label === 'system') {
  currentQuestion += ' ' + transcript;
  if (data.speech_final && currentQuestion.trim().length > 10) {
    const question = currentQuestion.trim();
    currentQuestion = '';
    triggerLLM(question);
  }
}
```

Only the system channel accumulates partial transcripts; `speech_final` is the commit signal. Length > 10 guards against noise. Keep-alive pings guard both sockets every 10 s (`DNA/src/main.js:147-152`).

#### Why It Is Valuable

The two-channel-separate-sockets design is non-trivial: a naive mix of both audio sources into one stream (as the abandoned `DNA/src/audio.js` did) destroys speaker attribution. Keeping channels separate end-to-end and buffering only the relevant channel before triggering downstream logic is exactly the pattern MeetingAssist needs for "You vs Others" transcript labeling and artifact generation.

#### What to Change for MeetingAssist

- **Model:** Upgrade `nova-2` → `nova-3` (CLAUDE.md; better multi-speaker streaming accuracy and diarization for meetings).
- **Trigger:** Replace interview-question trigger logic (`triggerLLM` on speech_final after length > 10) with MeetingAssist's artifact pipeline trigger (accumulate full-meeting transcript segments; fire MOM/summary/action-item extraction at end-of-session or on demand).
- **Label generalization:** Replace binary "mic = You, system = Interviewer" with N-speaker attribution — pass Deepgram diarization `speaker` field alongside the channel label; "You vs Others" becomes "speaker_0 vs speaker_N" with role assignment at session start.
- **Keep-alive pings:** Retain the 10 s ping pattern unchanged — it guards long-duration meeting connections effectively.
- **System audio capture path:** The DNA hand-rolls the ScreenCaptureKit loopback; MeetingAssist should use `electron-audio-loopback` (the packaged equivalent) to reduce maintenance burden.

#### Risk / Effort

**Low risk, medium effort.** The channel-separation architecture and `speech_final` accumulation pattern are proven and directly applicable. The adaptation work is domain translation (interview → meeting), not architectural surgery.

#### Citations

- `DNA/src/renderer/audio.js:1-69` — dual-pipeline mic + system capture setup; separate `AudioWorkletNode` instances; video tracks discarded; IPC send via `window.electron.sendMicAudioChunk` / `sendSystemAudioChunk`
- `DNA/src/renderer/public/audio-processor.js:1-16` — `AudioWorkletProcessor` (`deepgram-audio-processor`); posts Float32 frames via `port.postMessage`
- `DNA/src/main.js:28-35` — `convertFloat32ToInt16()`: converts Float32 chunk to Int16 PCM, clamps to [-1, 1]
- `DNA/src/main.js:79-123` — `createDeepgramConnection(apiKey, label, event)`: opens a `deepgram.listen.live` WebSocket, wires `Results` / `error` / `close` handlers, sends the labeled channel transcript to the renderer
- `DNA/src/main.js:102-109` — the `speech_final` accumulation state machine (see excerpt above)
- `DNA/src/main.js:125-181` — `setupDeepgramIPC()`: wires `start-deepgram`, `mic-audio-chunk`, `system-audio-chunk`, `stop-deepgram` IPC handlers; creates both connections; schedules keep-alive timers

---

### Technique 2: OpenAI-`baseURL` Provider Seam

**Verdict: `borrow-and-adapt`** — Deep code-level evidence (D-06)

#### What DNA Does

A single factory function at `DNA/src/main.js:22-26`:
```javascript
function getLLMClient() {
  const apiKey = store.get('llmApiKey') || process.env.LLM_API_KEY;
  const baseURL = store.get('llmApiUrl') || process.env.LLM_API_URL;
  return new OpenAI({ apiKey, baseURL });
}
```

Every LLM call — text answers (`DNA/src/main.js:46-69`) and vision (`DNA/src/main.js:309-332`) — routes through `getLLMClient().chat.completions.create(...)`. Provider is swapped purely by changing `llmApiUrl`, `llmModel`, and `llmApiKey` in the Settings UI. The `SettingsPanel.jsx` placeholder text at `DNA/src/renderer/components/SettingsPanel.jsx:3-9` shows Gemini and NVIDIA endpoints, proving the swap works with no code change. Settings are persisted via `electron-store` and surfaced through the `get-settings` / `set-setting` IPC at `DNA/src/main.js:260-271`.

> **⚠ Correction:** The provider seam is in `DNA/src/main.js`, NOT in `DNA/adapters/`. `DNA/adapters/` contains GSD AI-assistant docs (CLAUDE.md, GEMINI.md, GPT_OSS.md) — it is GSD tooling documentation, not product code. Any plan or build instruction that references `DNA/adapters/` as the LLM seam location is wrong.

#### Why It Is Valuable

The OpenAI SDK's `baseURL` parameter gives true provider-agnostic LLM calls: OpenAI, Gemini (OpenAI-compat endpoint), Groq, OpenRouter, Ollama, LM Studio — swappable with no code change, only settings values. MeetingAssist's artifact pipeline (MOM, summary, action items, in-meeting chat) needs exactly this flexibility to let users choose their provider and tier.

#### What to Change for MeetingAssist

- **Structured Outputs:** DNA sends plain `chat.completions.create` with no schema enforcement. MeetingAssist must add **strict Structured Outputs** (`response_format` JSON schema for OpenAI; `responseSchema` for Gemini) validated with Zod — the DNA's loose prompting is insufficient for reliable action-item/date extraction.
- **API key storage:** DNA stores keys via `electron-store` in plaintext (`main.js:260-271`). MeetingAssist must route secrets through `safeStorage` / macOS Keychain (see leave-behind #4 and DEC-02).
- **Seam location:** Move `getLLMClient()` from `main.js` (monolith) into a dedicated `src/main/llm/` service module.
- **Model selection:** Default to Gemini 2.5 Flash (1M context, cost-effective) rather than a model env var, with a settings override.

#### Risk / Effort

**Near-zero risk, low effort.** The adapter pattern is battle-tested and the SDK API is stable. The main effort is adding Structured Outputs + Zod schemas, which is new work layered on top of the existing pattern, not a replacement of it.

#### Citations

- `DNA/src/main.js:22-26` — `getLLMClient()` factory (see excerpt above)
- `DNA/src/main.js:46-69` — text answer generation via `getLLMClient().chat.completions.create()`; interview-domain system prompt
- `DNA/src/main.js:260-271` — `get-settings` / `set-setting` IPC handlers; plaintext key storage via `store.get`/`store.set`
- `DNA/src/main.js:309-332` — vision LLM call through the same `getLLMClient()` seam
- `DNA/src/renderer/components/SettingsPanel.jsx:3-9` — `llmApiUrl` / `llmModel` / `llmApiKey` fields; Gemini + NVIDIA placeholder values prove the swap works

---

### Technique 3: Hardened `contextBridge` IPC Allowlist

**Verdict: `borrow-and-adapt`** — Deep code-level evidence (D-06)

#### What DNA Does

`BrowserWindow` is created with `nodeIntegration: false`, `contextIsolation: true`, and a `preload` path (`DNA/src/main.js:234-238`):
```javascript
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  preload: path.join(__dirname, 'preload.js')
}
```

`DNA/src/preload.js` exposes a single `window.electron` object. The `on()` method enforces a hard-coded inbound channel allowlist before subscribing (`DNA/src/preload.js:10-29`):
```javascript
on: (channel, callback) => {
  const allowed = [
    'hotkey-triggered', 'capture-success', 'vision-analysis-success',
    'mode-changed', 'mic-transcript', 'system-transcript', 'transcript-error',
    'deepgram-ready', 'llm-answer', 'mic-toggle', 'dismiss-vision',
    'scroll-transcript', 'change-font-size',
  ];
  if (allowed.includes(channel)) {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  }
},
```

No raw `ipcRenderer` is exposed to the renderer. All outbound calls are typed wrappers (`startDeepgram`, `stopDeepgram`, `getSettings`, `setSetting`, etc. — `DNA/src/preload.js:36-53`). The renderer cannot subscribe to arbitrary IPC channels or call arbitrary main-process APIs.

#### Why It Is Valuable

This is the correct Electron security baseline. The allowlist pattern prevents renderer-side code (or injected scripts) from listening to IPC channels they should not see and prevents escalation to arbitrary Node.js access. The DNA shipped with this hardened pattern already in place, which is a non-trivial design decision worth copying exactly.

**Contrast — the insecure leave-behind:** `DNA/src/audio.js:3` (the legacy, orphaned file) assumes `nodeIntegration: true` in its architecture — the old pattern the shipped app correctly abandoned. That file is never imported by the build; it is the cautionary counterexample.

#### What to Change for MeetingAssist

- **Channel set:** MeetingAssist's IPC surface is different — redefine the allowlist to match MeetingAssist's domains (e.g., `transcript-segment`, `artifact-ready`, `session-state`, `assistant-response`). The mechanism is unchanged; only the channel names are.
- **Module location:** Extract to `src/preload/` rather than a root `preload.js`.
- **Typed wrappers:** Expand the typed outbound API to cover MeetingAssist's richer IPC surface (session management, artifact requests, calendar export).

#### Risk / Effort

**Low risk, low effort.** The allowlist pattern is a direct copy; the only work is redefining the channel names to match MeetingAssist's IPC surface.

#### Citations

- `DNA/src/main.js:234-238` — `BrowserWindow` with `nodeIntegration:false, contextIsolation:true, preload:preload.js` (see excerpt above)
- `DNA/src/preload.js:10-29` — the inbound channel allowlist (see excerpt above)
- `DNA/src/preload.js:36-53` — typed outbound wrappers (`startDeepgram`, `stopDeepgram`, `sendMicAudioChunk`, `sendSystemAudioChunk`, `getSettings`, `setSetting`, `getDesktopSourceId`, `requestScreenPermission`, `closeApp`, `resizeWindow`)
- `DNA/src/audio.js:3` (legacy — leave-behind contrast): assumes `nodeIntegration:true`; never imported by the shipped renderer; the insecure path the shipped app correctly abandoned

---

### Technique 4: Vision Screenshot → Downscale → Model Round-Trip

**Verdict: `design-reference`** — Conceptual depth acceptable (D-06)

#### What DNA Does

A global hotkey (`⌘⇧⌥M`) triggers a screen capture via `desktopCapturer.getSources({ types:['screen'], thumbnailSize:{width:1920, height:1080} })` (`DNA/src/main.js:291-300`). The first source's thumbnail is downscaled to **half width** using Electron's built-in `nativeImage.resize()`:
```javascript
const size = primarySource.thumbnail.getSize();
const resized = primarySource.thumbnail.resize({ width: Math.floor(size.width / 2) });
const imageBase64 = resized.toDataURL();
```
(`DNA/src/main.js:302-304`). The base64 data URL is sent as an `image_url` in a multimodal `chat.completions.create` through the same `getLLMClient()` provider seam (`DNA/src/main.js:309-332`).

> **⚠ Correction:** The DNA does **NOT** use the `sharp` library. `sharp` is absent from `DNA/package.json` dependencies and is never imported anywhere in the codebase. The D-05 phrase "screenshot→sharp→model" describes the *recommended MeetingAssist path* (where `sharp` offers finer downscale control), not the DNA's actual implementation. The DNA uses Electron's native `nativeImage.resize()`. MeetingAssist recommends `sharp` for more precise control over output dimensions, format, and quality — that is a MeetingAssist design choice, not a DNA inheritance.

#### Why It Is Valuable

The round-trip shape — capture → downscale → multimodal LLM via the same provider seam → stream result to renderer — is a proven flow. The integration with `getLLMClient()` means vision analysis switches providers with no code change, which is the same flexibility as the text path.

#### What to Change for MeetingAssist

- **Downscale:** Replace `nativeImage.resize()` with `sharp` for finer control over output dimensions, format, quality, and compression. Avoids data-URL size blowup for large screens.
- **Prompts:** Replace the interview-specific vision prompt (`DNA/src/main.js:315-322`) with MeetingAssist's meeting context (e.g., "describe visible slide content," "extract visible action items or dates").
- **Trigger:** Hotkey-on-demand is appropriate for MeetingAssist's on-demand Vision Assist feature. The trigger mechanism itself does not need to change.
- **Implementation:** Re-implement cleanly in `src/main/vision/` rather than inline in the hotkey handler.

#### Risk / Effort

**Low risk, low effort** as a design reference. The flow is short and well-understood; the main adaptation is replacing the downscale method and the prompt. Not a high-value code borrow — re-implementing clean is the right call.

#### Citations

- `DNA/src/main.js:291-346` — full vision hotkey handler: capture, resize (at line 303), LLM call (at lines 309-332), error handling

---

### Technique 5: Overlay / Stealth Window Setup

**Verdict: `borrow-and-adapt` (technique mechanism only) — ethics decision DEFERRED to Phase 2 DEC-01**

#### What DNA Does

`BrowserWindow` is created `transparent:true, frame:false, hasShadow:false` (`DNA/src/main.js:225-239`). Immediately after creation, at `DNA/src/main.js:247-253`:
```javascript
mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
mainWindow.setAlwaysOnTop(true, 'screen-saver');
mainWindow.setContentProtection(true);
mainWindow.setIgnoreMouseEvents(true, { forward: true });
```

And at `DNA/src/main.js:286`:
```javascript
app.dock.hide();
```

A `⌘⇧⌥H` hotkey at `DNA/src/main.js:350-355` toggles between two modes:
- **Stealth mode** (`applyStealthMode`, `main.js:183-190`): opacity 0.95, click-through, `setContentProtection(true)`, `screen-saver` level — the overlay is invisible to screen-share tools
- **Normal mode** (`applyNormalMode`, `main.js:192-199`): opacity 1.0, interactive, same always-on-top level — the overlay is interactable

> **⚠ Corrections (two):**
>
> **(a) `setContentProtection(true)` → `NSWindowSharingNone` (indirect mapping):** The code calls Electron's `setContentProtection(true)`, which *internally maps to* `NSWindowSharingNone` on macOS. The constant `NSWindowSharingNone` is never named in the DNA codebase — the README's phrasing "uses `NSWindowSharingNone`" is conceptually accurate but mechanically indirect. The correct description is: "content protection is activated via `setContentProtection(true)`, which maps to `NSWindowSharingNone` under the hood."
>
> **(b) `LSUIElement` is documented-but-NOT-implemented:** The `DNA/README.md` states `LSUIElement=true` is set in the Electron app init. However, the shipped binary's `Info.plist` (`DNA/release/mac-arm64/Interview Helper.app/Contents/Info.plist`) has **no `LSUIElement` key**. Only `app.dock.hide()` (a runtime call, not a plist key) runs to hide the Dock icon. The README claim is inaccurate versus the shipped binary. The catalogue records the implementation as-shipped: `app.dock.hide()` at runtime; `LSUIElement` is documented but not implemented.

#### Why It Is Valuable

MeetingAssist is a persistent side overlay during live meetings — `setVisibleOnAllWorkspaces`, `setAlwaysOnTop('screen-saver')`, `setIgnoreMouseEvents(forward)`, and `app.dock.hide()` are the exact primitives needed for a non-intrusive always-visible overlay. These are proven to work on macOS and involve non-obvious configuration that DNA has already validated. The stealth/content-protection mechanism (hiding the user's own overlay panel from their own screen-share) is a legitimate feature that respects the user's choice about what they share.

**The ethics decision is separate:** Whether to also hide the *fact of recording* is a product posture decision (consent, disclosure, legality) that Phase 1 does not answer. This catalogue entry documents the *mechanism* (how the overlay is implemented) and assigns a `borrow-and-adapt` verdict for that mechanism. The question of whether to enable `setContentProtection` by default, whether to disclose recording to meeting participants, and how to handle the stealth/normal toggle in a consent-aware way is decided in **Phase 2 DEC-01**.

#### What to Change for MeetingAssist

- **Window geometry:** Resize for a side-panel layout (e.g., full-height right-side strip) rather than the DNA's centered 600×400 overlay.
- **Mode toggle:** Generalize beyond binary stealth/normal to a contextual approach (e.g., "focus mode" where the overlay collapses to an icon, "assist mode" where it's interactive).
- **`LSUIElement`:** Evaluate adding the `LSUIElement` plist key for true agent-mode behavior (no Dock entry even at process start) if Phase 2 DEC-01 decides the Dock-icon-free experience is desirable.
- **Ethics/consent gate:** Phase 2 DEC-01 will determine whether `setContentProtection(true)` is always-on, opt-in, or off — and what disclosure UI is required.

#### Risk / Effort

**Low risk, medium effort.** The overlay primitives are stable macOS APIs. The effort is the layout re-design for a side panel and the Phase 2 DEC-01 ethics work, which is scoped and scheduled.

#### Citations

- `DNA/src/main.js:225-253` — `createWindow()`: `BrowserWindow` creation flags (transparent, frame:false, hasShadow:false at 225-239); stealth setup calls (setVisibleOnAllWorkspaces, setAlwaysOnTop, setContentProtection, setIgnoreMouseEvents at 247-253)
- `DNA/src/main.js:286` — `app.dock.hide()` at the module level
- `DNA/src/main.js:183-199` — `applyStealthMode()` / `applyNormalMode()` mode functions
- `DNA/src/main.js:350-355` — `⌘⇧⌥H` globalShortcut toggle handler

---

## Leave-Behind List

> Conceptual depth only (D-06) — these items do not merit `file:line` deep-dives because we are not borrowing them.

| Asset / Technique | Why Leave Behind |
|-------------------|------------------|
| `DNA/src/audio.js` (legacy orphaned file) | Mixes mic and system audio into one stream (destroys speaker attribution); runs Deepgram SDK in the renderer (should be main); assumes `nodeIntegration:true` (insecure pattern). Superseded by `DNA/src/renderer/audio.js`. Never imported by the shipped build. |
| `DNA/main.js` (root duplicate) | Near-identical duplicate of `DNA/src/main.js` (one-line diff at line 241: `process.env.NODE_ENV !== 'production'` vs `!app.isPackaged`). Dead code. Ship from a single entry point. |
| Interview-specific LLM prompts (`DNA/src/main.js:51-61`) | Domain-specific to interview coaching ("answer at fresher/entry-level," "under 45-60 seconds when spoken aloud"). Wrong domain for MeetingAssist. Replace entirely with artifact-extraction prompts (MOM, summary, action items, dates). |
| Plaintext `electron-store` API key storage | `DNA/src/main.js:260-271` and `SettingsPanel.jsx:3-9` store `llmApiKey`, `deepgramApiKey` via `store.set()` — unencrypted JSON on disk. MeetingAssist must use `safeStorage` / macOS Keychain for secrets (CLAUDE.md, DEC-02). Hand to DEC-02. |
| Nova-2 model literal (`DNA/src/main.js:83`) | Hardcoded `model: 'nova-2'` in `createDeepgramConnection`. Upgrade to Nova-3 (CLAUDE.md §Recommended Stack; better multi-speaker accuracy). |
| `DNA/adapters/`, `.gsd/`, `.agent/` directories | GSD tooling documentation (CLAUDE.md, GEMINI.md, GPT_OSS.md) and AI-assistant scaffolding — not product code. These directories have no role in the MeetingAssist application. |

---

## Doc-vs-Code Gaps

> Copied verbatim from `01-RESEARCH.md` — the reconciliations the catalogue carries so the build milestone cannot be misled.

| DNA doc claim | Code reality | Catalogue treatment |
|---------------|--------------|---------------------|
| Provider seam in `DNA/adapters/` (implied by CONTEXT/roadmap) | `adapters/` = GSD AI-assistant docs; seam is `getLLMClient()` in `src/main.js:22-26` | Cite `src/main.js`, not `adapters/` |
| Vision uses `sharp` (D-05 phrasing + CLAUDE.md stack) | Code uses native `thumbnail.resize()` (`main.js:303`); `sharp` not in deps | "DNA uses native resize; MeetingAssist recommends `sharp`" |
| Stealth uses `NSWindowSharingNone` (README) | Code calls `setContentProtection(true)` which *maps to* `NSWindowSharingNone` internally; constant never named | "via setContentProtection → NSWindowSharingNone" |
| `LSUIElement = true` set in app init (README:266) | No `LSUIElement` key in shipped `Info.plist`; only `app.dock.hide()` runs | "Dock hidden at runtime; LSUIElement documented but not implemented" |
| App version 1.1.0 (PROJECT/CONTEXT) | package.json + all artifacts = **1.0.0**; `VERSION`(1.4.0) is GSD tooling | Record DNA app = 1.0.0 |
| `audio.js` is "the" audio module | Two exist; shipped one is `src/renderer/audio.js`; `src/audio.js` is legacy | Cite `src/renderer/audio.js` |

---

## Verdict Summary Table

| # | Technique | Verdict | Key Change for MeetingAssist |
|---|-----------|---------|------------------------------|
| 1 | Dual-channel STT + `speech_final` state machine | `borrow-and-adapt` | Nova-2→Nova-3; generalize "Interviewer"→N speakers; replace interview trigger with artifact pipeline |
| 2 | OpenAI-`baseURL` provider seam | `borrow-and-adapt` | Add Structured Outputs + Zod; move keys to `safeStorage` |
| 3 | Hardened `contextBridge` IPC allowlist | `borrow-and-adapt` | Redefine channel set for MeetingAssist's IPC surface |
| 4 | Vision screenshot → downscale → model | `design-reference` | Re-implement clean: `sharp` instead of `nativeImage.resize()`; meeting-domain prompts |
| 5 | Overlay / stealth window setup | `borrow-and-adapt` (mechanism) | Side-panel layout; ethics/consent posture → Phase 2 DEC-01 |

---

## Requirement Coverage

| Requirement | Coverage |
|-------------|---------|
| DNA-01 — Relevant DNA modules read with `file:line` evidence | All 5 techniques carry verified `DNA/src/...` citations; four Doc-vs-Code gaps call out README inaccuracies |
| DNA-02 — Catalogue of proven techniques + explicit leave-behind list | 5 techniques catalogued above; 6-item leave-behind list explicitly included |
| DNA-03 — Selective-adoption plan with explicit verdicts; NOT a wholesale port | 4× `borrow-and-adapt`, 1× `design-reference`, 0× `defer/undecided`; stated up-front as selective adoption, not a port |

---

*Phase: 01-DNA Deep-Dive & Project Setup*
*Document: Selective-Adoption Catalogue*
*Assessed: 2026-06-25*
*Valid until: Build milestone (stack pins re-verified at build time per D-07)*
