# Stack Research

**Domain:** macOS desktop AI meeting-assistant overlay (Electron + real-time STT + LLM)
**Researched:** 2026-06-25
**Confidence:** MEDIUM (web-sourced, cross-checked against official docs where possible; pricing/version numbers move fast — re-verify at build time)

---

## Executive Verdict on the Inherited DNA

The Interview Helper DNA is a strong foundation and most of it transfers directly. Net recommendation:

| DNA Choice | Verdict | Action |
|------------|---------|--------|
| Electron 40 | **KEEP, bump** | Move to Electron 41 LTS (Chromium 146 / Node 24 LTS) or 42 stable |
| React 19 (hooks-only) + Vite 7 | **KEEP** | Still the current standard; no change |
| Deepgram Nova-2 streaming STT | **AUGMENT** | Upgrade Nova-2 → **Nova-3**; keep the provider seam so AssemblyAI / on-device whisper.cpp can slot in |
| Provider-agnostic LLM layer (OpenAI SDK `baseURL`) | **KEEP** | Perfect for MeetingAssist; add **strict structured-output** support |
| `sharp` downscale for vision | **KEEP** | Unchanged |
| `electron-store` for *all* persistence | **REPLACE (for transcripts/artifacts)** | Keep electron-store for small prefs only; add **better-sqlite3-multiple-ciphers** (SQLCipher) for transcripts/artifacts |
| macOS stealth APIs (NSWindowSharingNone, LSUIElement) | **KEEP technically, RE-EVALUATE ethically** | Stealth is an ethics/legality decision for the PRD, not a stack gap |
| **System-audio capture method** | **GAP — must specify** | DNA's interview use was 1:1; full-meeting capture needs a robust loopback path. Recommend **`electron-audio-loopback`** as default with **AudioTee.js** (Core Audio Taps) as the higher-fidelity option |

The two genuinely new build areas the DNA does **not** cover: (1) reliable **full-meeting system-audio capture** and its permissions, and (2) **encrypted local persistence** of long transcripts + artifacts. Everything else is configuration and prompt work on top of proven machinery.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Electron | **41.x LTS** (Chromium 146, Node 24 LTS); 42.x is latest stable | Desktop shell, overlay window, native macOS APIs | DNA already on Electron 40; 41 is the current LTS line and gives Node 24 LTS. Provides `desktopCapturer` + the ScreenCaptureKit loopback path needed for system audio |
| React | **19.x** (hooks-only) | Overlay + chat UI | DNA standard; React 19 is current and stable |
| Vite | **7.x** | Renderer build/dev server | DNA standard; Vite 7 is current, smooth from 6 |
| Deepgram SDK | **`@deepgram/sdk` latest**, model **`nova-3`** | Real-time dual-channel STT over WebSocket | Sub-300ms TTFT, ~6.84% streaming WER, diarization up to 12 speakers, per-second billing (~$0.0077/min / ~$0.46/hr streaming). Direct upgrade from DNA's Nova-2 with better multi-speaker meeting accuracy |
| OpenAI SDK | **`openai` latest** (used as the provider-agnostic adapter via `baseURL`) | LLM calls for MOM / summary / action items / in-meeting chat | DNA's existing adapter pattern. Works against OpenAI, Gemini (OpenAI-compat), Groq, OpenRouter, Ollama, LM Studio with no code change. Add **Structured Outputs** (strict JSON schema) for artifact extraction |

### Speech-to-Text — Options & Tradeoffs

This is the most consequential decision. Keep the **provider seam** so STT is swappable; default to Deepgram Nova-3.

| Provider / Model | Latency | Accuracy (streaming WER) | Diarization | Cost | Privacy | Verdict |
|------------------|---------|--------------------------|-------------|------|---------|---------|
| **Deepgram Nova-3** (default) | <300ms TTFT | ~6.84% | Up to 12 speakers, ~$0.001–0.002/min add | ~$0.0077/min streaming (per-second billing) | Cloud | **Primary.** Best balance of latency/accuracy/diarization for multi-speaker meetings |
| **AssemblyAI Universal-Streaming** | ~300ms (claims faster median word emission than Nova-3) | Competitive | Streaming diarization add-on (+$0.06/hr) | $0.15/hr base + $0.06/hr diarization | Cloud | **Strong alternative / fallback.** Cheaper per-hour; good redundancy provider behind the seam |
| **OpenAI Realtime (`gpt-realtime-whisper`) / `gpt-4o-transcribe`** | Tunable (minimal→xhigh) | High | Weak / not first-class | ~$0.017/min streaming; $0.006/min batch | Cloud | **Not recommended as primary.** Pricier streaming, diarization not a strength. Useful only if consolidating on one OpenAI vendor |
| **whisper.cpp (large-v3-turbo, Metal)** | ~10x realtime on M2 Pro (chunked streaming) | Near large-v3 | **No built-in diarization** | $0 marginal (on-device) | **On-device / fully private** | **Optional offline/privacy mode.** Ship as opt-in; pair with a separate diarization step (e.g. pyannote-style) if speaker labels needed |
| Apple `SFSpeechRecognizer` | Low | Lower than Whisper for long-form | No diarization | $0 | On-device (with limits) | **Avoid.** Designed for short dictation, not long multi-speaker meetings; throttling and length limits make it unsuitable |

**Recommendation:** Default **Deepgram Nova-3** (cloud, diarized, low-latency). Keep **AssemblyAI** wired behind the seam as a fallback/redundancy and for cost-sensitive tiers. Offer **whisper.cpp large-v3-turbo** as an explicit "private / offline" mode for privacy-sensitive users — this is also a marketing differentiator. Do **not** rely on `SFSpeechRecognizer` for primary transcription.

### macOS System-Audio Capture (the hard part)

Full-meeting transcription needs the **other participants'** audio (system output / what comes out of Zoom/Meet/Teams), not just the mic. There are two production-viable, notarization-friendly paths in 2026:

| Approach | Library | macOS | Permission / Entitlements | App-Store / Notarization | Tradeoffs | Verdict |
|----------|---------|-------|---------------------------|--------------------------|-----------|---------|
| **Chromium ScreenCaptureKit loopback** | **`electron-audio-loopback`** (npm) | 13.2+ | "Screen & System Audio Recording" TCC; uses Chromium flags `MacLoopbackAudioForScreenShare` / `MacSckSystemAudioLoopbackOverride`; no extra entitlements, no bundled binary | Notarization-clean (no extra binaries) | Triggers the **purple screen-recording indicator** in Control Center; captures **post-mixer** (volume-dependent) audio; PCM handled in renderer via Web Audio | **Default.** Zero packaging overhead, broadest macOS support |
| **Core Audio process taps** | **AudioTee.js** (wraps a ~600KB universal Swift binary using `AudioHardwareCreateProcessTap` + aggregate device) | **14.2+** | "System Audio Recording Only" TCC + `NSAudioCaptureUsageDescription` in Info.plist; requires **`com.apple.security.cs.disable-library-validation`** entitlement to load the bundled Swift binary | Notarization-friendly but you must sign the bundled binary, set `asarUnpack`, and add the entitlement | Captures **pre-mixer** (volume-independent) clean PCM straight to main process; **no misleading screen-recording warning** (cleaner UX); requires bundling/extracting a binary | **Premium path.** Cleaner permissions UX + higher-fidelity audio; choose for 14.2+ users who want the best experience |

**Recommendation:** Ship **`electron-audio-loopback`** as the default capture path (simplest, widest support, no bundled binary), and offer **AudioTee.js** as the preferred path on macOS 14.2+ for cleaner permissions UX and pre-mixer audio quality. For pure Swift reference, `insidegui/AudioCap` documents the raw Core Audio Taps flow.

**Do NOT** ship a virtual-audio-driver/kernel-extension loopback (BlackHole, Soundflower, Loopback by Rogue Amoeba) as a bundled dependency — kexts/drivers break notarization-friendly distribution, require separate installers and user trust prompts, and are now superseded by the Core Audio Taps API.

**Required Info.plist / entitlements summary:**
- `NSMicrophoneUsageDescription` — mic capture ("You" channel)
- `NSAudioCaptureUsageDescription` — system audio (Core Audio Taps / AudioTee path)
- TCC: "System Audio Recording" (and "Screen Recording" for the Chromium loopback path — note the purple indicator)
- Hardened runtime entitlements (see packaging section): `com.apple.security.cs.allow-jit`, `com.apple.security.cs.allow-unsigned-executable-memory`, plus `com.apple.security.cs.disable-library-validation` **only if** bundling the AudioTee Swift binary

### LLM Layer (MOM / summary / action items / in-meeting chat)

| Concern | Recommendation | Why |
|---------|----------------|-----|
| Provider abstraction | **Keep DNA's OpenAI-SDK-`baseURL` adapter** | Already proven; swaps providers with no code change |
| Default artifact model | **Gemini 2.5 Flash** (or GPT-5-class for premium) | 1M-token context fits whole long meetings; Flash is cost-effective (~$0.30/$2.50 per M); Pro (~$1.25/$10 per M) for higher-stakes summaries |
| Structured extraction (MOM, action items, dates) | **Strict Structured Outputs**: OpenAI `response_format` JSON-schema (guaranteed adherence) or Gemini `responseSchema` (now full JSON Schema, works with Zod) | Eliminates parsing failures on action-item/date extraction — define a **Zod** schema once, reuse across providers |
| Long-context handling | **Rolling full-transcript context** into a 1M-token window for in-meeting chat + final summary | A single meeting fits comfortably in long context; no RAG needed for in-meeting use |
| In-meeting live assistant | Same adapter; stream responses; inject rolling transcript + user question | Context-preserving chat = pass accumulating transcript as system/context each turn |

**JSON-schema validation:** use **`zod`** to define artifact schemas and validate model output in the main process even when using strict structured outputs (belt-and-suspenders).

### Meeting Memory / Context Store

**Finding:** With 1M-token context windows, a single meeting does **not** need RAG. Use **rolling-transcript context** for in-meeting chat and final-artifact generation — simpler, lower-latency, no embedding pipeline.

RAG/vector search becomes valuable only for **cross-meeting memory** ("what did we decide about X three meetings ago?") — a clear differentiator, not table stakes.

| Need | Approach | Library |
|------|----------|---------|
| In-meeting chat + summary (single meeting) | Rolling transcript in long context | — (just the LLM adapter) |
| Cross-meeting recall / semantic search (differentiator) | Local vector search over stored chunks | **`sqlite-vec`** extension on the same SQLite DB (no separate vector service) |
| Embeddings for cross-meeting search | Cloud embeddings (OpenAI/Gemini) or on-device via Ollama for privacy mode | Provider-dependent |

**Recommendation:** Start with rolling-context only. Add `sqlite-vec` (loads into the existing better-sqlite3 database) when cross-meeting recall is prioritized — avoids standing up a separate vector DB.

### Local Persistence & Encryption

| Data | Store | Encryption |
|------|-------|------------|
| Transcripts, MOM, summaries, action items, meeting metadata | **`better-sqlite3-multiple-ciphers`** (SQLCipher, AES-256, full-DB encryption) | Key generated on first run, stored via **Electron `safeStorage`** (macOS Keychain-backed) |
| Small prefs / settings (provider keys go in Keychain via safeStorage) | **`electron-store`** (DNA's existing choice) | safeStorage for secrets |
| Vector embeddings (if cross-meeting search) | `sqlite-vec` table inside the same SQLCipher DB | Inherits DB encryption |

**Why SQLite over files/electron-store for transcripts:** long meetings produce large structured, queryable data (timestamps, speakers, segments). `electron-store` (a JSON blob) does not scale to this and has no encryption-at-rest. SQLCipher gives transparent full-DB AES-256 with the same query API. The DB key is sealed by `safeStorage` (Keychain) so it never lives in plaintext on disk.

### Calendar / Action-Item Integration

| Target | Library | Notes |
|--------|---------|-------|
| **Universal export (baseline)** | **`ics`** or **`ical-generator`** | Generate `.ics` from extracted action items/deadlines — works with every calendar app, **zero OAuth**. Ship this first |
| Google Calendar (differentiator) | **`googleapis`** (official Node client) | OAuth 2.0; insert events directly |
| Outlook / Microsoft 365 (differentiator) | **`@microsoft/microsoft-graph-client`** | Graph API `POST /me/events`; OAuth 2.0 / MSAL |

**Recommendation:** Ship **`.ics` export** as the table-stakes path (no auth friction, universal). Add Google Calendar + Microsoft Graph OAuth integrations as differentiators in a later phase.

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@deepgram/sdk` | latest | Streaming STT (Nova-3) | Always (default STT) |
| `assemblyai` | latest | Fallback/redundancy STT | Behind provider seam |
| `openai` | latest | Provider-agnostic LLM adapter | Always |
| `zod` | latest | Schema definition + output validation | Artifact extraction |
| `electron-audio-loopback` | latest | Default macOS system-audio capture | Always (capture path) |
| `audiotee.js` | latest | Core Audio Taps capture (premium path) | macOS 14.2+ premium mode |
| `better-sqlite3-multiple-ciphers` | latest | Encrypted transcript/artifact DB | Always (persistence) |
| `sqlite-vec` | latest | Local vector search | Cross-meeting recall feature |
| `electron-store` | latest | Small prefs (DNA) | Settings only |
| `sharp` | latest | Screenshot downscale (DNA) | Vision assist |
| `googleapis` | latest | Google Calendar | Calendar integration |
| `@microsoft/microsoft-graph-client` | latest | Outlook/M365 calendar | Calendar integration |
| `ics` / `ical-generator` | latest | `.ics` export | Always (baseline calendaring) |

## Development & Packaging Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `electron-builder` | Package/sign/notarize | Set `mac.hardenedRuntime: true`, `mac.entitlements` + `entitlementsInherit` plist |
| `@electron/notarize` | Notarization via `notarytool` | `altool` deprecated late 2023 — must use notarytool. Run in `afterSign` hook with `APPLE_ID` / `APPLE_ID_PASSWORD` (app-specific) / `APPLE_TEAM_ID` |
| Hardened-runtime entitlements | Required for notarization | `com.apple.security.cs.allow-jit`, `com.apple.security.cs.allow-unsigned-executable-memory`; add `com.apple.security.cs.disable-library-validation` only if bundling AudioTee binary |
| `asarUnpack` | Unpack native `.node` / bundled binaries | Required so native modules + the AudioTee Swift binary are signable/loadable; **all** bundled binaries must be individually signed |

---

## Installation

```bash
# Core
npm install electron@^41 react@^19 react-dom@^19 vite@^7

# STT + LLM
npm install @deepgram/sdk assemblyai openai zod

# macOS system-audio capture (default + premium)
npm install electron-audio-loopback audiotee.js

# Persistence + vector search
npm install better-sqlite3-multiple-ciphers sqlite-vec electron-store

# Calendar
npm install googleapis @microsoft/microsoft-graph-client ics

# Vision (DNA)
npm install sharp

# Dev / packaging
npm install -D electron-builder @electron/notarize @vitejs/plugin-react
```

> Pin exact versions at build time — verify each against its registry/release page. Versions here are "current major line as of 2026-06", not lockfile pins.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Deepgram Nova-3 | AssemblyAI Universal-Streaming | Cost-sensitive tier; want cheaper per-hour streaming; or as redundancy provider |
| Deepgram Nova-3 | whisper.cpp large-v3-turbo (on-device) | Privacy/offline mode; no cloud allowed; accept no built-in diarization |
| `electron-audio-loopback` (default) | AudioTee.js (Core Audio Taps) | macOS 14.2+, want cleaner permissions UX + pre-mixer audio quality, willing to bundle a signed binary |
| Rolling long-context | `sqlite-vec` RAG | Cross-meeting semantic recall is a prioritized feature |
| better-sqlite3-multiple-ciphers | Plain better-sqlite3 + app-layer field encryption | If full-DB SQLCipher proves heavy; encrypt only sensitive columns |
| Gemini 2.5 Flash | GPT-5-class / Gemini 2.5 Pro | Higher-stakes summaries where extra accuracy justifies cost |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Apple `SFSpeechRecognizer` for primary STT | Built for short dictation; length limits, throttling, no diarization, weak long-form accuracy | Deepgram Nova-3 (cloud) or whisper.cpp (on-device) |
| BlackHole / Soundflower / virtual audio kexts as bundled dependency | Kexts/drivers break notarization-clean distribution, need separate installers + user trust, superseded by Core Audio Taps | `electron-audio-loopback` or AudioTee.js |
| `electron-store` for transcripts/artifacts | JSON blob, no encryption-at-rest, doesn't scale to large structured queryable data | `better-sqlite3-multiple-ciphers` (SQLCipher) |
| `@journeyapps/sqlcipher` | Unmaintained; breaks on Apple Silicon (M1/M2) | `better-sqlite3-multiple-ciphers` |
| `altool` for notarization | Deprecated by Apple (late 2023) | `@electron/notarize` → `notarytool` |
| Loose JSON-mode prompting for artifact extraction | Models omit keys / hallucinate enums | Strict Structured Outputs (OpenAI `response_format` / Gemini `responseSchema`) + Zod validation |
| OpenAI Realtime as primary streaming STT | Pricier streaming (~$0.017/min), diarization not first-class | Deepgram Nova-3 |
| Standalone vector DB (Pinecone/Chroma server) for a desktop app | Operational overhead for a local-first desktop app | `sqlite-vec` in the existing SQLite DB |

## Stack Patterns by Variant

**If targeting macOS 14.2+ and prioritizing UX/quality:**
- Use AudioTee.js (Core Audio Taps) for capture — pre-mixer audio, "System Audio Recording Only" permission, no purple screen-recording indicator.
- Because the permissions story is cleaner and audio fidelity is higher; accept bundling/signing a Swift binary.

**If supporting macOS 13.2–14.1 or wanting zero bundled binaries:**
- Use `electron-audio-loopback` (Chromium ScreenCaptureKit flags).
- Because it needs no extra binary and works further back; accept the purple recording indicator and post-mixer audio.

**If privacy/offline is a core selling point:**
- Default STT to whisper.cpp large-v3-turbo (Metal) and embeddings to a local Ollama model; keep all data on-device with SQLCipher.
- Because nothing leaves the machine; accept loss of built-in diarization (add a local diarization step if speaker labels are required).

**If shipping a free tier vs paid tier:**
- Free → AssemblyAI streaming (cheaper per-hour) or whisper.cpp; Paid → Deepgram Nova-3 + Gemini 2.5 Pro.
- Because the provider seam lets STT/LLM vary by tier with no code change.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Electron 41 | Chromium 146, Node 24 LTS | Native modules (better-sqlite3*) must be rebuilt against Electron's Node ABI (`electron-rebuild`) |
| better-sqlite3-multiple-ciphers | Electron (native) | Must be rebuilt for Electron's ABI; `asarUnpack` the `.node` |
| sqlite-vec | Node 23.5+ `node:sqlite` or better-sqlite3 | Loadable as SQLite extension into the same DB |
| AudioTee.js | macOS 14.2+ | Requires `disable-library-validation` entitlement + signed bundled binary |
| React 19 + Vite 7 | `@vitejs/plugin-react` current | Smooth; remove deprecated Vite 6 features |

## Sources

- Deepgram Nova-3 (deepgram.com/learn/introducing-nova-3, /pricing, /learn/speech-to-text-benchmarks) — latency/WER/diarization/pricing — MEDIUM
- AssemblyAI Universal-Streaming (assemblyai.com/universal-streaming, /pricing, /blog) — latency/diarization/pricing — MEDIUM
- OpenAI Realtime / gpt-4o-transcribe (developers.openai.com/api/docs/guides/realtime-transcription, /pricing) — pricing/latency tunables — MEDIUM
- whisper.cpp Apple Silicon (github.com/ggml-org/whisper.cpp; promptquorum/fazm/whispernotes benchmarks) — large-v3-turbo Metal performance — MEDIUM
- macOS Core Audio Taps (developer.apple.com/documentation/CoreAudio/capturing-system-audio-with-core-audio-taps; github.com/insidegui/AudioCap) — API + permissions — MEDIUM
- Electron system audio (stronglytyped.uk articles on electron-macos approaches & packaging AudioTee; github.com/alectrocute/electron-audio-loopback; electron/electron#47490) — both capture paths, entitlements — MEDIUM
- electron-builder notarization (electron.build/docs/notarization; @electron/notarize) — hardened runtime/entitlements/notarytool — MEDIUM
- Structured outputs (developers.openai.com/api/docs/guides/structured-outputs; ai.google.dev/gemini-api/docs/structured-output; blog.google JSON Schema announcement) — MEDIUM
- Gemini 2.5 context/pricing (pricepertoken, ai.google.dev) — 1M context, per-M pricing — MEDIUM
- RAG vs rolling context (arxiv 2508.00476 AutoMin; on-device RAG GDE article) — meeting transcript memory patterns — MEDIUM
- SQLite encryption (better-sqlite3-multiple-ciphers; heckmann.app pragmatic Electron architecture; capacitor-community/sqlite docs) — SQLCipher + safeStorage — MEDIUM
- sqlite-vec (github.com/asg017/sqlite-vec; alexgarcia.xyz/sqlite-vec/js.html) — local vector search — MEDIUM
- Calendar (npmjs ics, ical-generator; googleapis; learn.microsoft.com Graph calendar) — MEDIUM
- Electron releases (releases.electronjs.org) — Electron 41 LTS / 42 stable, Chromium 146 / Node 24 — MEDIUM

---
*Stack research for: macOS desktop AI meeting-assistant overlay (MeetingAssist)*
*Researched: 2026-06-25*
