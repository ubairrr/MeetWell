# Phase 1 Dev Baseline — MeetingAssist Toolchain & Conventions

**Domain:** Toolchain, Node/Electron line, and proposed repo layout as DIRECTION for the MeetingAssist build milestone
**Recorded:** 2026-06-25
**Confidence:** HIGH — DNA stack versions verified from `DNA/package.json` (direct read); direction from `.claude/CLAUDE.md` §"Executive Verdict on the Inherited DNA" + §"Recommended Stack"

> **Planning-only document — no code is final-pinned here.**
> This document records direction + rationale for the toolchain. Exact version pinning and the final `src/main/<domain>/` repo layout are **Phase 5 PRD (PRD-02) / build-time decisions** (D-07). Re-verify all versions and re-validate the layout against then-current Electron compatibility before writing any build-milestone code.
>
> Requirements satisfied by this document: **SETUP-03**

---

## DNA App Version Accuracy Note

**The Interview Helper (DNA) app version is `1.0.0`**, confirmed from `DNA/package.json` (`"version": "1.0.0"`) and all release artifacts (`release/Interview Helper-1.0.0-arm64.dmg`, `release/latest-mac.yml: version: 1.0.0`, release date 2026-06-15).

**`DNA/VERSION` reads `1.4.0` — this is the GSD-tooling version, not the app.** `DNA/CHANGELOG.md` is the changelog for "GSD for Antigravity" (the AI-coding assistant framework), not for Interview Helper. Any reference to a DNA app version of `1.1.0` (e.g., in `.planning/PROJECT.md`) is inaccurate vs. the shipped artifacts.

---

## Executive Verdict on the Inherited DNA

DNA version `1.0.0` was built on the following stack. The table records what it uses today and the recommended direction for MeetingAssist (not final — see posture note above).

| DNA Choice | DNA Version (as-is) | Verdict | Direction (not pinned) |
|------------|---------------------|---------|------------------------|
| Electron | `^40.6.1` | **KEEP, bump** | Move to **41.x LTS** (Chromium 146 / Node 24 LTS); 42.x is latest stable |
| React | `^19.2.4` (hooks-only) | **KEEP** | Stay on 19.x — current and stable |
| Vite | `^7.3.1` | **KEEP** | Stay on 7.x — current, smooth from 6 |
| `@vitejs/plugin-react` | `^5.1.4` | **KEEP** | Stay on current |
| `@deepgram/sdk` | `^4.11.3` (model `nova-2`) | **AUGMENT** | Keep SDK; upgrade model `nova-2` → **nova-3** |
| `openai` | `^6.25.0` (provider-agnostic `baseURL` adapter) | **KEEP** | Keep; add **Structured Outputs** + Zod schema validation |
| `electron-store` | `^8.2.0` | **REPLACE (for secrets + transcripts)** | Keep for small UI prefs only; API keys → `safeStorage` (macOS Keychain-backed); transcripts/artifacts → **`better-sqlite3-multiple-ciphers`** (SQLCipher AES-256) |
| `electron-builder` | `^26.8.1` | **KEEP** | Stay on current; ensure `hardenedRuntime: true`, correct entitlements |
| `react-markdown` | `^10.1.0` | Re-evaluate | UI library; re-evaluate at build time |
| `react-syntax-highlighter` | `^16.1.1` | Re-evaluate | UI library; re-evaluate at build time |
| `dotenv` | `^17.3.1` | **KEEP (dev only)** | Dev-time env loading; not shipped |
| **System-audio capture** | Hand-rolled Chromium loopback (`desktopCapturer` + flag) | **REPLACE with packaged library** | Use **`electron-audio-loopback`** (default, macOS 13.2+) or **AudioTee.js** (premium, macOS 14.2+, pre-mixer) |

All version numbers above are verified against `DNA/package.json` (direct read). The direction column reflects `.claude/CLAUDE.md` §"Executive Verdict on the Inherited DNA".

---

## Node / Electron Line

| Baseline (DNA) | Direction (MeetingAssist) | Rationale |
|----------------|--------------------------|-----------|
| Electron `^40.6.1` → Node 20 ABI | Electron **41.x LTS** → **Node 24 LTS** | 41 is the current LTS line; Node 24 LTS gives long-term ABI stability for native modules (`better-sqlite3-multiple-ciphers` must be rebuilt against Electron's Node ABI via `electron-rebuild`) |
| Chromium 130 (Electron 40) | Chromium 146 (Electron 41) | Needed for ScreenCaptureKit loopback reliability; `electron-audio-loopback` targets 13.2+ |

**Build-time decision:** Confirm Electron 41 vs. 42 (latest stable) at build time. Pin to the version that is LTS-stable at that moment.

---

## New Dependencies to Add (direction, not final)

These are capabilities the DNA lacks that MeetingAssist requires. The packages are not installed yet — this is directional only. Legitimacy will be re-verified at build time per the REQUIREMENTS.md Out-of-Scope clause.

| Need | Recommended Library | Why |
|------|---------------------|-----|
| Encrypted transcript/artifact DB | `better-sqlite3-multiple-ciphers` | SQLCipher AES-256; full-DB encryption; key via `safeStorage`/Keychain |
| Local vector search (cross-meeting recall) | `sqlite-vec` extension | Zero extra service; same SQLite DB |
| Default macOS system-audio capture | `electron-audio-loopback` | Packaged ScreenCaptureKit loopback; macOS 13.2+ |
| Premium macOS system-audio capture | `audiotee.js` | Core Audio Taps; pre-mixer; macOS 14.2+; cleaner permissions UX |
| Schema validation + Structured Outputs | `zod` | Define once, validate LLM output across providers |
| Calendar export (baseline) | `ics` or `ical-generator` | `.ics` generation with zero OAuth |
| Google Calendar (differentiator) | `googleapis` | Direct event insertion via OAuth 2.0 |
| Outlook/M365 calendar (differentiator) | `@microsoft/microsoft-graph-client` | Graph API calendar events |
| Screenshot downscale (vision) | `sharp` | Finer control than DNA's native `thumbnail.resize()` |
| Notarization | `@electron/notarize` → `notarytool` | `altool` is deprecated since late 2023 |

---

## DNA Techniques to Leave Behind

These DNA patterns are explicitly NOT carried forward to MeetingAssist:

| DNA Pattern | Reason to Leave Behind |
|-------------|------------------------|
| `electron-store` for API keys (plaintext) | Keys stored unencrypted; MeetingAssist must use `safeStorage`/Keychain |
| `electron-store` for transcripts/artifacts | JSON blob, no encryption-at-rest, doesn't scale; use `better-sqlite3-multiple-ciphers` |
| Deepgram model literal `nova-2` | Upgrade to `nova-3` for better multi-speaker accuracy/diarization |
| Hand-rolled Chromium loopback (no `electron-audio-loopback` package) | Packaged library is maintained; premium path (AudioTee) gives pre-mixer audio |
| Interview-specific LLM prompts (`DNA/src/main.js:51-61`) | Wrong domain; MeetingAssist needs artifact-extraction prompts |
| `DNA/src/audio.js` (legacy mixed-stream + renderer-side Deepgram + `nodeIntegration:true`) | Insecure; superseded by the dual-channel `src/renderer/audio.js` approach |
| `DNA/main.js` root duplicate | Dead copy of `src/main.js`; ship from one canonical entry |

---

## Proposed Repository Layout (direction)

The layout below is PROPOSED as a starting point for the build milestone. The exact `src/main/<domain>/` boundaries and final structure are **Phase 5 PRD (PRD-02) / build-time decisions**.

```
MeetingAssist/
├── src/
│   ├── main/                    # Electron main process: per-domain service modules
│   │   ├── capture/             # Audio loopback + worklet bridge
│   │   │                        # (based on DNA: renderer/audio.js + main Deepgram glue)
│   │   ├── stt/                 # Deepgram Nova-3 adapter behind a provider seam
│   │   ├── llm/                 # OpenAI-baseURL seam (from DNA getLLMClient) +
│   │   │                        # Structured Outputs / Zod
│   │   ├── store/               # SQLCipher (better-sqlite3-multiple-ciphers) +
│   │   │                        # electron-store prefs + safeStorage key management
│   │   └── session/             # SessionManager FSM, consent gate (DEC-01)
│   ├── preload/                 # Hardened contextBridge allowlist
│   │                            # (from DNA preload.js — redefine channels for MeetingAssist)
│   └── renderer/                # React 19 (hooks-only) overlay + chat UI
│                                # (from DNA renderer/ — new components for meetings)
├── build/                       # Entitlements plist, icons
├── .planning/                   # Planning deliverables (tracked in git)
└── package.json                 # app name "meeting-assist" (new product)
```

**Key structural difference from DNA:** DNA keeps all Electron-main logic in a single `src/main.js` (404 lines). MeetingAssist splits this into domain modules under `src/main/<domain>/` for maintainability. The exact module boundaries are a Phase 5 PRD design decision — the directory names above are illustrative.

---

## Packaging & Distribution Direction

| Concern | Direction |
|---------|-----------|
| Build tool | `electron-builder` (keep from DNA); `hardenedRuntime: true`; correct entitlements plist |
| Notarization | `@electron/notarize` → `notarytool` (DNA does not notarize; `altool` is deprecated) |
| Native module rebuild | `electron-rebuild` required for `better-sqlite3-multiple-ciphers` and any native `.node` |
| ASAR unpack | `asarUnpack` for native `.node` files and any bundled Swift binary (AudioTee path) |
| Entitlements | `cs.allow-jit`, `cs.allow-unsigned-executable-memory`; add `cs.disable-library-validation` only if bundling AudioTee binary |

---

## Stack Posture — re-verify and pin at build time

This document records DIRECTION. The versions above reflect the DNA baseline and the recommended upgrade direction as of 2026-06-25. Before writing any production code in the build milestone:

1. Re-verify all package versions against their registries (npm, GitHub releases).
2. Confirm Electron 41 LTS vs. 42 stable at that moment.
3. Verify `better-sqlite3-multiple-ciphers` + `sqlite-vec` build correctly against the chosen Electron ABI.
4. Re-check `electron-audio-loopback` and `audiotee.js` packaging requirements.
5. Run the RSCH-04 audio spike to validate the actual macOS floor before declaring it.

Final stack versions, final module boundaries, and the supported-macOS floor are all **Phase 5 PRD / build-time decisions (D-07)**.

---

*Requirements satisfied by this document: SETUP-03*
*Stack versions verified from: `DNA/package.json` (version 1.0.0, direct read 2026-06-25)*
*Direction source: `.claude/CLAUDE.md` §"Executive Verdict on the Inherited DNA", §"Recommended Stack", §"macOS System-Audio Capture"*
