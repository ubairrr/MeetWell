# Phase 1: DNA Deep-Dive & Project Setup - Research

**Researched:** 2026-06-25
**Domain:** Hands-on read of the Interview Helper DNA reference repo (Electron + React + Deepgram + OpenAI-compatible LLM, macOS overlay) — plus this repo's SETUP baseline
**Confidence:** HIGH (all findings are direct reads of local source with `file:line` citations; no external package research needed for a docs-only phase)

## Summary

Phase 1 is documentation/analysis only — no product code, no package installs. The "research" here is a hands-on read of the local, git-ignored `DNA/` repo (Interview Helper v1.0.0) so the planner can write concrete, citable plans for the four Phase 1 deliverables. I located every file the catalogue needs, extracted the real mechanisms with `file:line` evidence, and reconciled several places where the DNA's own README/CLAUDE.md overstate or misdescribe what the code actually does.

The single most important structural correction: **the OpenAI-`baseURL` provider seam does NOT live in `DNA/adapters/`.** `DNA/adapters/` is GSD-tooling documentation for AI coding assistants (CLAUDE.md / GEMINI.md / GPT_OSS.md), not LLM code. The real seam is one function — `getLLMClient()` in `DNA/src/main.js:22-26` — plus four `electron-store` settings surfaced by `DNA/src/renderer/components/SettingsPanel.jsx`. Two other doc-vs-code gaps matter for the catalogue: the DNA does **not** use the `sharp` library (it downscales with Electron's built-in `thumbnail.resize()`), and it does **not** set `LSUIElement` (the built `Info.plist` has no such key; only `app.dock.hide()` runs). Stealth "window sharing exclusion" is real but implemented via Electron's `setContentProtection(true)`, which maps to `NSWindowSharingNone` internally — the code never names that constant.

**Primary recommendation:** Plan four separate focused docs inside the phase folder (per D-01/D-02). Use this RESEARCH.md's "Catalogue Source Map" and "DNA-04 Audio-Capture Assessment" sections as the citation backbone — they already carry the `file:line` evidence the build milestone will need. Flag the audio approach (Chromium ScreenCaptureKit loopback via `desktopCapturer` + `chromeMediaSource:'desktop'` + the `--enable-features=MacLoopbackAudioForScreenShare` flag) as the DNA's *real* method and the effective macOS floor as **12.0** (from the shipped binary's `Info.plist`), feeding RSCH-04 and the supported-OS-floor decision.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Produce **separate, focused docs** rather than one consolidated file — each output is independently citable by later phases (audio assessment → RSCH-04; catalogue + conventions → Phase 5 PRD).
- **D-02:** All Phase 1 docs live **inside the phase folder** (`.planning/phases/01-dna-deep-dive-project-setup/`). The two durable references (dev-baseline/conventions and the selective-adoption catalogue) are the long-lived pair the build milestone will lean on; no separate top-level `docs/` folder this phase.
- **D-03:** Verdict taxonomy = the roadmap's **three verdicts**: `borrow-and-adapt`, `design-reference`, `leave-behind`. Add a fourth `defer/undecided` ONLY if a technique genuinely cannot be classified yet.
- **D-04:** Each catalogue entry uses a **5-field structure**: *what DNA does · why it's valuable · what to change for MeetingAssist · risk/effort · verdict*.
- **D-05:** Techniques catalogued (at minimum): dual-channel real-time STT handling (`speech_final` accumulation state machine), the OpenAI-`baseURL` provider seam, hardened `contextBridge` IPC, the vision screenshot→sharp→model round-trip, and overlay/stealth window setup. The stealth verdict notes the consent/ethics question is decided in Phase 2 (DEC-01), not here.
- **D-06:** **Code-level evidence** (`file:line` citations + real mechanism writeups) for `borrow-and-adapt` candidates; **conceptual summaries** suffice for `leave-behind` techniques — do not over-invest in things we won't take.
- **D-07:** The dev-baseline doc **records direction + rationale, it does not final-pin**. Capture the Node/Electron line, toolchain, and a *proposed* `main/<domain>/` repo layout — but mark exact-version pinning and the final layout as **PRD (Phase 5) / build-time decisions**.

### Claude's Discretion
- The user delegated all four gray areas ("go with your defaults"). Latitude on exact doc filenames, section ordering, and table vs. prose formatting within each deliverable, as long as the decisions above hold.

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope. (Stack ratification → Phase 5 PRD; consent/stealth posture → Phase 2 DEC-01; audio-capture validation spike → Phase 3 RSCH-04. These are roadmap-scheduled, not deferred ideas.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SETUP-01 | Private repo `ubairrr/MeetingAssist` connected; auto-commit + push (Stop hook) | Confirmed: `git remote -v` → `https://github.com/ubairrr/MeetingAssist.git`; auto-push is a Claude Code Stop hook wired at init (documented in PROJECT.md/STATE.md/CLAUDE.md; hook config lives under `.claude/` which is sandbox-read-denied — document as-is, do not re-verify the hook script) |
| SETUP-02 | `.gitignore` excludes `DNA/`, GSD tooling, secrets; `.planning/` tracked | Confirmed: read `/Users/ubair/Gits/MeetingAssist/.gitignore` — `DNA/` ignored; `.claude/ .agents/ .gsd/ .codex/ .gemini/ .cursor/` ignored; `.env` + `.env.*` (with `!.env.example`) ignored; `.planning/` is NOT listed (tracked). See "SETUP Baseline Facts". |
| SETUP-03 | Project conventions + dev baseline documented (toolchain, Node/Electron line, repo layout) | DNA stack versions extracted from `DNA/package.json`; bump direction from `.claude/CLAUDE.md` §Recommended Stack. See "Dev-Baseline Inputs" + D-07 posture. |
| DNA-01 | Relevant DNA modules read & understood | All read with `file:line` citations: `DNA/src/main.js`, `DNA/src/preload.js`, `DNA/src/renderer/audio.js`, `DNA/src/audio.js` (legacy), `DNA/src/renderer/public/audio-processor.js`, `DNA/src/renderer/App.jsx`, `DNA/src/renderer/components/SettingsPanel.jsx`, `DNA/package.json`, `DNA/build/entitlements.mac.plist`. See "DNA Repo Structure Map". |
| DNA-02 | Catalogue of proven techniques + explicit leave-behind list | 5 techniques located with mechanisms. See "Catalogue Source Map". |
| DNA-03 | Selective-adoption plan (lift-and-adapt vs design reference; not a wholesale port) | Per-technique verdict recommendations seeded in "Catalogue Source Map" (planner finalizes 5-field entries per D-04). |
| DNA-04 | DNA's real audio-capture approach + effective minimum macOS version | Resolved: Chromium ScreenCaptureKit loopback; effective floor **macOS 12.0** (shipped binary `Info.plist`). See "DNA-04 Audio-Capture Assessment". |
</phase_requirements>

## Architectural Responsibility Map

This phase ships documents, not code — so the "tiers" below describe where each *catalogued DNA technique* lives in the DNA's process model. The planner uses this to keep the catalogue's mechanism descriptions tier-accurate (e.g., do not describe Deepgram SDK calls as "renderer" when they run in main).

| Capability | Primary Tier (in DNA) | Secondary Tier | Rationale |
|------------|----------------------|----------------|-----------|
| System/mic audio capture | Renderer (`getUserMedia` / `desktopCapturer`) | AudioWorklet | Web Audio + Chromium loopback APIs are renderer-only; `DNA/src/renderer/audio.js` |
| PCM downsample (Float32→IPC) | AudioWorklet thread | — | `audio-processor.js` runs off the renderer main thread; posts Float32 over IPC |
| Float32→Int16 conversion + Deepgram WS | Main process | — | Deepgram SDK + WebSocket live in Node/main; `DNA/src/main.js:28-35, 79-123` |
| `speech_final` accumulation state machine | Main process | — | Buffered in main module-scope vars; `DNA/src/main.js:38-39, 102-109` |
| LLM provider seam (`baseURL`) | Main process | — | `OpenAI` SDK call in main; `DNA/src/main.js:22-26, 41-77` |
| Vision screenshot → downscale → model | Main process | — | `desktopCapturer` + `thumbnail.resize()` + LLM all in main; `DNA/src/main.js:295-340` |
| `contextBridge` IPC allowlist | Preload (isolated) | — | `DNA/src/preload.js:1-54` — the only renderer↔main surface |
| Overlay / stealth window setup | Main process | — | `BrowserWindow` flags + `app.dock.hide()`; `DNA/src/main.js:183-286` |
| Settings / API-key persistence | Main process (`electron-store`) | Renderer UI | Keys saved via `set-setting` IPC; `SettingsPanel.jsx` + `main.js:260-271` |

## DNA Repo Structure Map

> Real layout, enumerated from disk (`DNA/`, git-ignored, local-only). `node_modules/`, `.git/`, `release/` artifacts, and `.gsd/`/`.agent/` GSD-tooling trees omitted as not relevant.

```
DNA/
├── package.json              # name "interview-helper", version 1.0.0; main = src/main.js; deps + electron-builder config  [VERIFIED]
├── VERSION                   # "1.4.0" — but this is the GSD-TOOLING version, NOT the app (CHANGELOG is "GSD for Antigravity")  [VERIFIED]
├── CHANGELOG.md              # changelog of the GSD tooling, not the app  [VERIFIED]
├── vite.config.js            # Vite 7 + @vitejs/plugin-react; port 5173; manualChunks vendor=react  [VERIFIED]
├── main.js                   # ROOT copy — near-duplicate of src/main.js (one-line diff, line 241). NOT the packaged entry  [VERIFIED]
├── README.md                 # narrative architecture doc — overstates LSUIElement & names "sharp" (see Doc-vs-Code Gaps)  [VERIFIED]
├── build/
│   └── entitlements.mac.plist  # allow-jit, allow-unsigned-executable-memory, device.audio-input  [VERIFIED]
├── release/                  # built artifacts (git-ignored)
│   ├── Interview Helper-1.0.0-arm64.dmg / .zip   # app version = 1.0.0  [VERIFIED]
│   ├── latest-mac.yml        # version: 1.0.0, releaseDate 2026-06-15  [VERIFIED]
│   └── mac-arm64/Interview Helper.app/Contents/Info.plist  # LSMinimumSystemVersion = 12.0; usage descriptions  [VERIFIED]
├── adapters/                 # ⚠ NOT an LLM provider seam — GSD AI-assistant docs (CLAUDE.md/GEMINI.md/GPT_OSS.md)  [VERIFIED]
└── src/                      # PACKAGED SOURCE (package.json files[] ships only src/* + renderer/dist)
    ├── main.js               # Electron main: window/overlay, IPC, Deepgram, LLM seam, vision  (404 lines)  [VERIFIED]
    ├── preload.js            # contextBridge allowlist — the single renderer↔main surface (54 lines)  [VERIFIED]
    ├── audio.js              # ⚠ LEGACY/orphaned — mixes streams, renderer-side Deepgram, nodeIntegration assumption; NOT imported by the shipped renderer  [VERIFIED]
    ├── index.html            # legacy entry for src/audio.js path (unused by build)  [VERIFIED]
    └── renderer/             # the actual React app (Vite root)
        ├── main.jsx          # boots React + imports ./audio.js (the REAL audio module)  [VERIFIED]
        ├── App.jsx           # overlay UI, IPC event subscriptions, transcript log  [VERIFIED]
        ├── audio.js          # ⭐ REAL dual-pipeline capture: mic + system as SEPARATE streams over IPC  [VERIFIED]
        ├── index.html        # Vite renderer entry (loads /main.jsx)  [VERIFIED]
        ├── index.css
        ├── public/audio-processor.js  # ⭐ AudioWorklet: posts Float32 frames to renderer over port  [VERIFIED]
        ├── dist/             # built renderer (contains a copy of audio-processor.js)
        └── components/       # Header.jsx, TranscriptLog.jsx, SettingsPanel.jsx, VisionPanel.jsx
```

**Two traps for the planner (both VERIFIED):**

1. **Two `main.js` and two `audio.js` exist.** The canonical, packaged ones are `src/main.js` and `src/renderer/audio.js` (per `package.json` `main: "src/main.js"` and `files[]` shipping `src/*` + `renderer/dist`). `DNA/main.js` is a near-identical root copy (only difference: line 241 uses `process.env.NODE_ENV !== 'production'` vs `src/main.js`'s `!app.isPackaged`). `DNA/src/audio.js` is **legacy/orphaned** — it mixes both audio sources into one stream and runs Deepgram in the renderer; the shipped app instead uses `src/renderer/audio.js`, which keeps the two channels **separate** and runs Deepgram in main. **Cite `src/...` paths only.**

2. **`DNA/VERSION` (1.4.0) is the GSD tooling version, not the app.** The Interview Helper app is **v1.0.0** (package.json + every release artifact). PROJECT.md/CONTEXT.md's "v1.1.0" claim is inaccurate — the dev-baseline doc should record **1.0.0** as the DNA app version and note `VERSION`/`CHANGELOG.md` belong to vendored GSD tooling.

## Catalogue Source Map (the 5 D-05 techniques)

> This is the citation backbone for the selective-adoption catalogue. The planner expands each into the D-04 5-field entry. Verdict column is a **recommendation** grounded in `.claude/CLAUDE.md`'s Executive Verdict; the planner/Phase-5 PRD ratify.

### 1. Dual-channel real-time STT + `speech_final` accumulation state machine
**Mechanism (real):** Renderer opens TWO independent capture streams — mic via `getUserMedia({audio:true})` and system audio via `desktopCapturer` source id + `chromeMediaSource:'desktop'` — and routes each through its own `AudioWorkletNode('deepgram-audio-processor')`. The worklet (`audio-processor.js:1-16`) posts raw Float32 frames; the renderer forwards them over two IPC channels (`sendMicAudioChunk` / `sendSystemAudioChunk`). Main converts Float32→Int16 PCM at 16 kHz mono (`main.js:28-35`) and feeds two separate Deepgram `listen.live` WebSocket connections labeled `mic`/`system` (`main.js:79-123, 125-181`). The **state machine**: only the *system* channel accumulates — `currentQuestion += ' ' + transcript`, and when `data.speech_final && currentQuestion.trim().length > 10` it fires `triggerLLM(question)` and resets the buffer (`main.js:38-39, 102-109`). 10 s keep-alive pings guard both sockets (`main.js:147-152`).
**Evidence:** `DNA/src/renderer/audio.js:1-69`; `DNA/src/renderer/public/audio-processor.js:1-16`; `DNA/src/main.js:28-35, 79-123, 95-111, 125-181`.
**Recommended verdict:** `borrow-and-adapt` (separate-channels design + speech_final buffering is exactly MeetingAssist's "You vs Others" need; adapt Nova-2→Nova-3, generalize "Interviewer" → N speakers, move the trigger from "answer interview question" to artifact pipeline). **Deep evidence per D-06.**

### 2. OpenAI-`baseURL` provider seam
**Mechanism (real):** A single factory `getLLMClient()` returns `new OpenAI({ apiKey, baseURL })` where both come from `electron-store` (falling back to env) — `main.js:22-26`. Every LLM call (text answer `main.js:46-69`; vision `main.js:310-332`) goes through it via `chat.completions.create`. Provider is swapped purely by changing `llmApiUrl`/`llmModel`/`llmApiKey` in the Settings UI (`SettingsPanel.jsx:3-9`) — placeholders literally show Gemini and NVIDIA endpoints, proving the swap works with no code change.
**Evidence:** `DNA/src/main.js:22-26, 46-69, 309-332`; `DNA/src/renderer/components/SettingsPanel.jsx:3-9`; `DNA/src/main.js:260-271` (get/set settings IPC).
**⚠ Correction:** This seam is **NOT** in `DNA/adapters/` (that dir is GSD AI-assistant docs). Catalogue must point at `src/main.js`, not `adapters/`.
**Recommended verdict:** `borrow-and-adapt` (proven, trivially provider-agnostic — matches CLAUDE.md's KEEP verdict; for MeetingAssist add strict Structured Outputs + Zod, which the DNA lacks). **Deep evidence per D-06.**

### 3. Hardened `contextBridge` IPC (preload allowlist)
**Mechanism (real):** `BrowserWindow` is created with `nodeIntegration:false, contextIsolation:true, preload:preload.js` (`main.js:234-238`). `preload.js` exposes a single `window.electron` object with a **hard-coded channel allowlist** for inbound events — `on(channel, cb)` checks `allowed.includes(channel)` against a fixed array of 13 channels before subscribing (`preload.js:10-29`), and exposes a fixed set of outbound `invoke`/`send` wrappers (`preload.js:36-53`). No raw `ipcRenderer` leaks to the renderer.
**Evidence:** `DNA/src/main.js:234-238`; `DNA/src/preload.js:1-54` (allowlist at `10-29`).
**Recommended verdict:** `borrow-and-adapt` (the allowlist pattern is the correct hardened-IPC baseline; lift the pattern, redefine the channel set for MeetingAssist's domains). **Deep evidence per D-06.** Note the legacy `src/audio.js:3` assumes `nodeIntegration: true` — that orphaned file is the *insecure* path the shipped app abandoned; cite it as the "what we left behind" contrast.

### 4. Vision screenshot → downscale → model round-trip
**Mechanism (real):** Global hotkey `⌘⇧⌥M` (`main.js:291`) calls `desktopCapturer.getSources({types:['screen'], thumbnailSize:1920×1080})`, takes `sources[0].thumbnail`, downscales to **half width** with Electron's built-in `nativeImage.resize()` (`thumbnail.resize({width: size.width/2})`, `main.js:303`), `toDataURL()`s it, and sends it as an `image_url` in a multimodal `chat.completions.create` through the same provider seam (`main.js:295-340`).
**Evidence:** `DNA/src/main.js:291-346` (resize at `303`, LLM call at `310-332`).
**⚠ Correction:** The DNA does **NOT** use the `sharp` library — `sharp` is absent from `package.json` deps and never imported; downscaling is Electron's native `thumbnail.resize()`. The D-05 phrase "screenshot→sharp→model" describes the *recommended MeetingAssist* path (CLAUDE.md lists `sharp`), not the DNA's actual implementation. The catalogue must say: *DNA uses native `thumbnail.resize()`; MeetingAssist recommends `sharp` for finer control.*
**Recommended verdict:** `design-reference` (the round-trip shape is reusable, but it's a differentiator, low-volume, and MeetingAssist would swap native resize → `sharp` and add structured prompts; learn from it, re-implement clean). **Conceptual depth acceptable per D-06** (not a high-value borrow).

### 5. Overlay / stealth window setup
**Mechanism (real):** `BrowserWindow` created `transparent:true, frame:false, hasShadow:false` (`main.js:226-239`). At creation it calls `setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true})`, `setAlwaysOnTop(true,'screen-saver')`, `setContentProtection(true)`, `setIgnoreMouseEvents(true,{forward:true})` (`main.js:247-253`), and `app.dock.hide()` (`main.js:286`). A `⌘⇧⌥H` toggle swaps stealth (`opacity 0.95`, click-through) vs normal (`opacity 1.0`, interactive) modes (`main.js:183-199, 350-357`).
**Evidence:** `DNA/src/main.js:225-286` (flags `247-253`, dock `286`, mode fns `183-199`).
**⚠ Corrections:** (a) The code uses Electron's `setContentProtection(true)` — which **internally maps to `NSWindowSharingNone`** — but never names that constant; the README's "uses `NSWindowSharingNone`" is conceptually right, mechanically indirect. (b) **`LSUIElement` is NOT set** — the shipped `Info.plist` has no `LSUIElement` key; only `app.dock.hide()` (a runtime equivalent for the Dock) is present. The README's claim that `LSUIElement=true` is set "in Electron app init" is **inaccurate vs the shipped binary**. The catalogue must record the technique honestly: content-protection + screen-saver level + dock-hide are real; `LSUIElement` is documented-but-not-implemented.
**Recommended verdict:** `borrow-and-adapt` **for the technique** (overlay/click-through/always-on-top is core to MeetingAssist's side panel; `setContentProtection` to hide the user's *own* panel from their *own* screen-share is legitimate). **The keep-vs-drop ethics call (concealing the fact of recording) is DEFERRED to Phase 2 DEC-01** — Phase 1 documents mechanism only, not product posture (per D-05). **Deep evidence per D-06** for the overlay primitives; conceptual for the stealth-ethics dimension.

### Explicit leave-behind candidates (conceptual depth only, per D-06)
| Technique / asset | Why leave behind |
|-------------------|------------------|
| `DNA/src/audio.js` (legacy mixed-stream + renderer-side Deepgram + `nodeIntegration`) | Superseded by `src/renderer/audio.js`; mixing channels destroys "You vs Others"; renderer-side Deepgram + nodeIntegration is the insecure pattern |
| `DNA/main.js` (root duplicate) | Dead duplicate of `src/main.js`; ship from one entry |
| Interview-specific LLM prompts ("answer at fresher level", `main.js:51-61`) | Wrong domain; MeetingAssist needs artifact-extraction prompts, not interview-cheat prompts |
| `electron-store` for API keys (plaintext) | Keys stored unencrypted (`SettingsPanel.jsx` → `set-setting` → `store.set`); MeetingAssist must use `safeStorage`/Keychain (CLAUDE.md + DEC-02) |
| Nova-2 model literal | Upgrade to Nova-3 (CLAUDE.md) |
| `DNA/adapters/`, `.gsd/`, `.agent/`, scripts | GSD tooling, not product code |

## DNA-04 Audio-Capture Assessment

> Feeds Phase 3 RSCH-04 (capture spike) and the supported-OS-floor decision. All claims VERIFIED from source/binary.

**Real capture method:** Chromium **ScreenCaptureKit loopback** via Electron's `desktopCapturer`. The renderer obtains a screen source id (`get-desktop-source-id` IPC → `desktopCapturer.getSources({types:['screen']})`, `main.js:202-207`) and calls `getUserMedia` with `mandatory:{ chromeMediaSource:'desktop', chromeMediaSourceId: sourceId }` for BOTH audio and video, then **discards the video tracks** and keeps only audio (`renderer/audio.js:11-37`). This is the **post-mixer** loopback path (the `electron-audio-loopback`-style approach in CLAUDE.md), implemented hand-rolled rather than via the npm package.

**The mandatory enabling flag:** Capture silently fails (no error) without the Chromium flag `--enable-features=MacLoopbackAudioForScreenShare` — passed on the Electron launch line in `package.json` scripts (`dev:electron`, `start:prod`). **VERIFIED** in `DNA/package.json:8,11` and corroborated by `README.md:161`.

**Channel handling:** mic and system audio stay **separate** end-to-end (two streams → two worklets → two IPC channels → two Deepgram sockets). No diarization is used; "You vs Interviewer" labeling is purely *which physical channel* the audio came from (`App.jsx:66-71`). This is the cheap, reliable baseline RSCH-02 should build "You vs Others" on.

**Permission model (as shipped):** Triggers the macOS **Screen Recording** permission (the purple indicator path). On failure the renderer calls `requestScreenPermission()` → main shows a dialog and deep-links to `x-apple.systempreferences:...Privacy_ScreenCapture` (`main.js:209-223`; `renderer/audio.js:33-37`).

**Effective minimum macOS version — assessment:**
| Evidence source | Value | Confidence |
|-----------------|-------|------------|
| Shipped binary `Contents/Info.plist` → `LSMinimumSystemVersion` | **12.0** | HIGH (read from the actual built `.app`) |
| Electron 40.6.1 (`electron-builder` baseline) | Electron sets the floor; 12.0 is what builder stamped | HIGH |
| README platform claims | "macOS only"; no explicit numeric floor | MEDIUM |

**Effective floor = macOS 12.0 (Monterey)** as stamped in the shipped binary. **Caveat for RSCH-04:** 12.0 is the *packaging* floor, but the loopback feature's real-world reliability differs by OS — `MacLoopbackAudioForScreenShare`/ScreenCaptureKit behavior is materially better on 13.x+, and CLAUDE.md's premium AudioTee path needs **14.2+**. So the spike must validate the loopback path across 12 / 13 / 14 / 15 and *declare* the supported floor — the binary's 12.0 is a starting hypothesis, not a guarantee. The DNA's 1:1 interview use also never stress-tested multi-speaker full-meeting capture.

**Entitlements as shipped:** `build/entitlements.mac.plist` contains only `cs.allow-jit`, `cs.allow-unsigned-executable-memory`, `device.audio-input`. The built `Info.plist` carries `NSMicrophoneUsageDescription`, `NSAudioCaptureUsageDescription`, `NSCameraUsageDescription` — but **no `NSScreenCaptureUsageDescription`** and no `disable-library-validation` (the DNA bundles no Swift binary; the AudioTee path in CLAUDE.md would add that entitlement).

## Dev-Baseline Inputs (SETUP-03 — direction only, per D-07)

> Record direction + rationale; do **NOT** final-pin (Out-of-Scope: "re-verify and pin at build time"; final stack ratified in Phase 5 PRD).

**DNA's actual stack (VERIFIED from `DNA/package.json`):**
| Layer | DNA version (as-is) | Recommended direction (CLAUDE.md, not final) |
|-------|---------------------|-----------------------------------------------|
| App version | interview-helper **1.0.0** | (new product) |
| Electron | `^40.6.1` | bump to **41.x LTS** (Chromium 146 / Node 24 LTS) line; 42 latest stable |
| React | `^19.2.4` (hooks-only) | keep 19.x |
| Vite | `^7.3.1` | keep 7.x |
| `@vitejs/plugin-react` | `^5.1.4` | keep current |
| `@deepgram/sdk` | `^4.11.3` (model `nova-2`) | keep SDK; **Nova-2 → Nova-3** |
| `openai` | `^6.25.0` (used as baseURL adapter) | keep; add Structured Outputs + Zod |
| `electron-store` | `^8.2.0` | keep for **small prefs only**; secrets → `safeStorage`; transcripts → SQLCipher |
| `electron-builder` | `^26.8.1` | keep |
| `react-markdown` / `react-syntax-highlighter` | `^10.1.0` / `^16.1.1` | UI; re-evaluate at build |
| `dotenv` | `^17.3.1` | dev only |
| Node line | (Electron 40 → Node 20 ABI) | Electron 41 → **Node 24 LTS** |

**Proposed repo layout (direction, not final — Phase 5 PRD owns `main/<domain>/`):**
```
src/
├── main/            # Electron main: per-domain services (capture, transcript, llm, session, artifacts)
│   ├── capture/     # audio loopback + worklet bridge (from DNA renderer/audio.js + main Deepgram glue)
│   ├── stt/         # Deepgram adapter (Nova-3) behind a provider seam
│   ├── llm/         # OpenAI-baseURL seam (from DNA getLLMClient) + Structured Outputs/Zod
│   ├── store/       # SQLCipher (better-sqlite3-multiple-ciphers) + electron-store prefs + safeStorage
│   └── session/     # SessionManager FSM, consent gate (DEC-01)
├── preload/         # hardened contextBridge allowlist (from DNA preload.js)
└── renderer/        # React 19 overlay + chat (from DNA renderer/)
```
Mark `main/<domain>/` boundaries and exact versions as **PRD/build-time decisions** (PRD-02).

## SETUP Baseline Facts (SETUP-01 / SETUP-02 — document as-is)

**SETUP-02 — `.gitignore` (VERIFIED, read from `/Users/ubair/Gits/MeetingAssist/.gitignore`):**
- `DNA/` ignored (reference repo, contains live `.env` + node_modules).
- GSD tooling ignored: `.claude/`, `.agents/`, `.gsd/`, `.codex/`, `.gemini/`, `.cursor/`.
- Secrets ignored: `.env`, `.env.*` (with `!.env.example` un-ignored), `*.pem`, `*.key`, `.secrets`.
- Build/OS junk ignored: `node_modules/`, `dist/`, `build/`, `out/`, `release/`, `.DS_Store`, etc.
- `.planning/` is **NOT** in `.gitignore` → tracked (intentional; the comment in the file states research/PRD/roadmap are the deliverables and belong on GitHub).

**SETUP-01 — repo + auto-push (VERIFIED where possible):**
- `git remote -v` → `origin = https://github.com/ubairrr/MeetingAssist.git` (fetch + push). **VERIFIED.**
- Auto-push is a Claude Code **Stop hook** that commits + pushes every turn; wired at init. Hook config lives under `.claude/` (sandbox-read-denied this session). Recent commit history (`docs(...)`, `chore: auto-sync working tree`) corroborates the hook is active. **[CITED: PROJECT.md/STATE.md/CLAUDE.md "Process / version control"]** — document as-is; SETUP-01 is satisfied at init, this phase records it as a convention, it does not re-wire it.

## Doc-vs-Code Gaps (reconciliations the catalogue must carry)

| DNA doc claim | Code reality | Catalogue treatment |
|---------------|--------------|---------------------|
| Provider seam in `DNA/adapters/` (implied by CONTEXT/roadmap) | `adapters/` = GSD AI-assistant docs; seam is `getLLMClient()` in `src/main.js:22-26` | Cite `src/main.js`, not `adapters/` |
| Vision uses `sharp` (D-05 phrasing + CLAUDE.md stack) | Code uses native `thumbnail.resize()` (`main.js:303`); `sharp` not in deps | "DNA uses native resize; MeetingAssist recommends `sharp`" |
| Stealth uses `NSWindowSharingNone` (README) | Code calls `setContentProtection(true)` which *maps to* `NSWindowSharingNone` internally; constant never named | "via setContentProtection → NSWindowSharingNone" |
| `LSUIElement = true` set in app init (README:266) | No `LSUIElement` key in shipped `Info.plist`; only `app.dock.hide()` runs | "Dock hidden at runtime; LSUIElement documented but not implemented" |
| App version 1.1.0 (PROJECT/CONTEXT) | package.json + all artifacts = **1.0.0**; `VERSION`(1.4.0) is GSD tooling | Record DNA app = 1.0.0 |
| `audio.js` is "the" audio module | Two exist; shipped one is `src/renderer/audio.js`; `src/audio.js` is legacy | Cite `src/renderer/audio.js` |

## Don't Hand-Roll

| Problem | Don't (re)build | Use Instead | Why |
|---------|-----------------|-------------|-----|
| Doc structure / catalogue format | A bespoke schema | The D-04 5-field structure + this RESEARCH's "Catalogue Source Map" | Already mandated by CONTEXT; consistency = citability |
| Re-confirming the SETUP baseline | Re-running git/hook setup | Just *document* the verified `.gitignore` + remote facts above | Repo/auto-push wired at init; SETUP-01/02 are documentation tasks |
| Re-deriving DNA file locations | Re-grepping the tree | The "DNA Repo Structure Map" + the two traps | Already enumerated with the legacy/duplicate gotchas resolved |

**Key insight:** This phase's failure mode is *citing the wrong file* (root vs `src/`, legacy `audio.js`, `adapters/` as a seam) and *repeating the DNA's own doc overstatements* (`sharp`, `LSUIElement`, version 1.1.0). The catalogue's value is being more accurate than the DNA's README — this RESEARCH already did that reconciliation.

## Runtime State Inventory

> Phase 1 writes documentation only — it changes no code and no runtime state. Inventory included because it touches the *idea* of renaming (Interview Helper → MeetingAssist) in docs, but no migration occurs this phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no datastore created or modified this phase | None — verified (planning-only repo) |
| Live service config | None — no external service touched | None — verified |
| OS-registered state | None — no OS registrations created | None — verified |
| Secrets/env vars | DNA's `.env` exists locally (git-ignored); never read into product code this phase | None — `.gitignore` already excludes it (verified) |
| Build artifacts | DNA `release/` artifacts exist (git-ignored, reference only) | None — not consumed by Phase 1 outputs |

## Common Pitfalls

### Pitfall 1: Citing `DNA/main.js` or `DNA/src/audio.js`
**What goes wrong:** Plans reference the root duplicate or the orphaned legacy audio file, so the build milestone copies the wrong (or insecure) pattern.
**Why it happens:** Two `main.js` and two `audio.js` exist; the legacy one is shorter and "looks simpler."
**How to avoid:** Cite only `src/main.js` and `src/renderer/audio.js` (the packaged entries per `package.json`).
**Warning signs:** Any citation to `adapters/` as a seam, `src/audio.js`, or root `main.js`.

### Pitfall 2: Repeating the README's overstatements as fact
**What goes wrong:** Catalogue says DNA "uses sharp / sets LSUIElement / names NSWindowSharingNone," which the build milestone then can't find in code.
**Why it happens:** The README is aspirational/marketing-toned and diverges from the shipped binary.
**How to avoid:** Use the "Doc-vs-Code Gaps" table verbatim.
**Warning signs:** A catalogue claim with no `file:line` to back it.

### Pitfall 3: Final-pinning the stack
**What goes wrong:** Dev-baseline doc locks Electron 41 / Nova-3 / exact versions, contradicting D-07 and the milestone's Out-of-Scope.
**How to avoid:** Record *direction + rationale*; explicitly mark exact pinning and the final `main/<domain>/` layout as Phase 5 PRD / build-time decisions.

## State of the Art

| Old (in DNA) | Current direction (CLAUDE.md / this milestone) | Why |
|--------------|-----------------------------------------------|-----|
| Deepgram Nova-2 | Nova-3 | Better multi-speaker streaming accuracy/diarization |
| Electron 40 | 41 LTS (Node 24) | Current LTS line |
| `electron-store` for keys (plaintext) | `safeStorage`/Keychain + SQLCipher for data | Encryption at rest (DEC-02) |
| Hand-rolled loopback via `desktopCapturer` | `electron-audio-loopback` (default) / AudioTee.js (premium) | Packaged, maintained; AudioTee = pre-mixer, cleaner UX (14.2+) |
| Native `thumbnail.resize()` | `sharp` | Finer downscale control for vision |

**Deprecated/outdated in DNA:** `src/audio.js` (mixed-stream + renderer Deepgram + nodeIntegration), root `main.js` duplicate, interview-specific prompts.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The auto-push Stop hook is currently active and wired correctly | SETUP Baseline Facts | LOW — `.claude/` is read-denied this session; corroborated by remote + commit history + CLAUDE.md. If wrong, SETUP-01's "auto-push" claim is overstated; planner can add a one-line human-verify of the hook config |
| A2 | `desktopCapturer`+`chromeMediaSource:'desktop'` = the ScreenCaptureKit loopback path CLAUDE.md calls `electron-audio-loopback`-equivalent | DNA-04 | LOW — code + README agree; RSCH-04 validates the actual path/floor anyway |

**Everything else in this research is VERIFIED from local source/binary with `file:line` citations.**

## Open Questions

1. **Auto-push hook exact config**
   - What we know: remote is correct; commit history shows auto-sync commits; CLAUDE.md describes a Stop-hook auto-push.
   - What's unclear: the hook script under `.claude/` is sandbox-read-denied this session.
   - Recommendation: document SETUP-01 from the verified facts (remote + history + CLAUDE.md); if the planner wants belt-and-suspenders, add a trivial human-verify task to eyeball `.claude/settings*.json`. Not blocking.

2. **Real supported-macOS floor for full-meeting loopback**
   - What we know: shipped binary stamps `LSMinimumSystemVersion 12.0`; flag-gated loopback.
   - What's unclear: real reliability across 12/13/14/15 under multi-speaker load (DNA only tested 1:1).
   - Recommendation: this is precisely RSCH-04's job — Phase 1's audio doc states 12.0 as the *packaging floor / starting hypothesis* and hands the validation to the spike.

## Environment Availability

> This phase has no external runtime dependencies — it reads local files and writes Markdown. The only "dependency" is read access to the local `DNA/` tree, which is present.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Local `DNA/` repo | DNA-01..04 reads | ✓ | app 1.0.0 | — |
| `git` (remote check) | SETUP-01 | ✓ | — | — |
| `.claude/` hook config read | SETUP-01 verification | ✗ (sandbox-denied) | — | Document from PROJECT.md/STATE.md/CLAUDE.md (A1) |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** `.claude/` hook config (fallback: documented facts; see A1).

## Package Legitimacy Audit

**Not applicable.** Phase 1 installs **zero** packages — it produces Markdown documentation/analysis only. No new dependencies are added to any manifest. The DNA's existing dependencies are *analyzed* (read from `DNA/package.json`), not installed into this repo. Stack recommendations in the dev-baseline doc are explicitly *direction, not pins* (D-07) and will be re-verified + legitimacy-checked at build time (next milestone). No SLOP/SUS verdicts to report.

## Validation Architecture

> `nyquist_validation` is `true` in config, so this section is included. **This phase has no runtime code and therefore no executable tests** — its "validation" is doc-quality / citation-accuracy, checked manually, not via a test framework.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — docs-only phase; no product code to test |
| Config file | none |
| Quick run command | n/a (citation spot-check, see below) |
| Full suite command | n/a |

### Phase Requirements → Validation Map
| Req ID | Behavior | Validation Type | Check |
|--------|----------|-----------------|-------|
| DNA-01 | Modules read | manual | Each catalogue claim has a resolvable `file:line` in `DNA/src/...` |
| DNA-02/03 | Catalogue + verdicts exist | manual | 5 techniques present, each with the D-04 5-field structure + a verdict from D-03's taxonomy |
| DNA-04 | Audio approach + macOS floor written | manual | Doc states method (loopback via desktopCapturer + flag) + floor (12.0) + RSCH-04 handoff |
| SETUP-01/02 | Baseline documented | manual | `.gitignore` rules + remote recorded as conventions (match verified facts) |
| SETUP-03 | Dev baseline documented | manual | Toolchain/Node-Electron line/layout captured as *direction* (not pinned) |

### Sampling Rate
- **Per doc:** spot-check 2–3 `file:line` citations resolve to the claimed mechanism.
- **Phase gate:** all four deliverables exist in the phase folder; every `borrow-and-adapt` entry carries code-level evidence (D-06); no claim repeats a Doc-vs-Code gap as fact.

### Wave 0 Gaps
- None — no test infrastructure is needed for a documentation phase. (If the planner wants a lightweight automated guard, a grep that every `file:line` citation in the catalogue points to an existing line in `DNA/src/*` would suffice, but it is optional and operates on a git-ignored tree.)

## Security Domain

> `security_enforcement` is enabled. Phase 1 ships **no product code and no runtime** — there is no attack surface to mitigate this phase. The relevant security work is to *capture security-relevant DNA findings as inputs* for Phase 2 (DEC-02) and the build milestone, not to implement controls.

### Applicable ASVS Categories (for the DOCUMENTATION, not running code)
| ASVS Category | Applies this phase | Note |
|---------------|--------------------|------|
| V2 Authentication | no | No auth in scope |
| V3 Session Mgmt | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | no (no runtime input) | Catalogue should flag DNA lacks Structured-Output/Zod validation on LLM responses (a build-milestone control) |
| V6 Cryptography | no (this phase) | **Capture for DEC-02:** DNA stores API keys via `electron-store` in **plaintext** (`SettingsPanel.jsx` → `set-setting` → `store.set`); MeetingAssist must use `safeStorage`/Keychain + SQLCipher. Document as a leave-behind. |

### Security findings to hand downstream (not fixed this phase)
| Finding (in DNA) | Evidence | Hand to |
|------------------|----------|---------|
| API keys stored unencrypted in electron-store | `src/main.js:260-271`, `SettingsPanel.jsx:3-9` | DEC-02 / build milestone (use safeStorage) |
| Legacy `src/audio.js` assumes `nodeIntegration:true` | `src/audio.js:3` | Leave-behind; shipped app already uses contextIsolation |
| No Structured-Output/Zod validation of LLM output | `src/main.js:46-69` | Phase 4 GRND / build milestone |
| Stealth/content-protection raises a consent/ethics question | `src/main.js:247-253` | **Phase 2 DEC-01** (Phase 1 documents mechanism only, per D-05) |

## Sources

### Primary (HIGH confidence — direct local reads)
- `DNA/src/main.js` (404 lines) — main process: window/overlay, IPC, Deepgram dual-WS, `speech_final` state machine, LLM seam, vision
- `DNA/src/preload.js` — contextBridge allowlist (the IPC surface)
- `DNA/src/renderer/audio.js` — real dual-pipeline capture; `DNA/src/renderer/public/audio-processor.js` — AudioWorklet
- `DNA/src/renderer/App.jsx`, `DNA/src/renderer/components/SettingsPanel.jsx`
- `DNA/src/audio.js` (legacy) — read to confirm it's orphaned/insecure
- `DNA/package.json`, `DNA/vite.config.js`, `DNA/build/entitlements.mac.plist`
- `DNA/release/mac-arm64/Interview Helper.app/Contents/Info.plist` — `LSMinimumSystemVersion 12.0`, usage descriptions (the authoritative shipped floor)
- `DNA/release/latest-mac.yml`, `DNA/release/builder-effective-config.yaml` — app version 1.0.0, Electron 40.6.1
- `/Users/ubair/Gits/MeetingAssist/.gitignore` + `git remote -v` — SETUP-01/02 facts

### Secondary (MEDIUM confidence — DNA narrative docs, cross-checked against code)
- `DNA/README.md` — architecture narrative (used for intent; corrected where it diverges from code — see Doc-vs-Code Gaps)
- `.claude/CLAUDE.md` §Executive Verdict / §Recommended Stack / §macOS System-Audio Capture — recommended direction
- `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, CONTEXT.md

### Tertiary (LOW confidence)
- None. (`.claude/` auto-push hook config was read-denied; see A1 — documented from project files, not assumed from training.)

## Metadata

**Confidence breakdown:**
- DNA repo structure & file locations: HIGH — enumerated from disk; duplicates/legacy resolved
- Catalogue mechanisms (5 techniques): HIGH — every borrow-and-adapt has `file:line` evidence
- DNA-04 audio approach + macOS floor: HIGH for method + packaging floor (binary `Info.plist`); MEDIUM for real-world reliability across OS range (RSCH-04 to validate)
- SETUP baseline: HIGH for `.gitignore` + remote (verified); A1 (hook) is LOW-risk documented-not-verified
- Doc-vs-code reconciliations: HIGH — each is code/binary-backed

**Research date:** 2026-06-25
**Valid until:** Stable for this phase (analyzing a frozen local reference repo). Stack-direction figures should be re-verified at build time per D-07.
