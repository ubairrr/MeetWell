# DEC-02: Data-handling & Privacy

**Status:** Accepted (pending RSCH-03 vendor confirmation — see Open Dependencies)
**Decided:** 2026-06-25
**Deciders:** Product (ubair)
**Supersedes:** —
**Superseded by:** —

---

This ADR satisfies requirement [DEC-02](../../REQUIREMENTS.md) — Data-handling & Privacy ADR.

---

## Status

Accepted — 2026-06-25 (pending RSCH-03 vendor confirmation — see Open Dependencies)

---

## Context / Problem Statement

MeetingAssist captures, transcribes, and stores audio and generated artifacts (minutes, summaries, action items) that contain sensitive meeting content. Before any persistence architecture is specified, the product must fix its data-handling posture — how data is stored, encrypted, retained, and deleted — because these choices gate the storage spec, vendor contract negotiations, and the product's privacy claims. Without this locked posture, downstream phases (Phase 3 RSCH-03 vendor research, Phase 5 PRD storage spec) cannot proceed from a consistent baseline.

---

## Decision Drivers

- **User privacy:** meeting content is sensitive; it must not be readable without the user's explicit access
- **Legal / regulatory defensibility:** encryption at rest and clear retention policies are baseline privacy hygiene
- **Core product value:** "trustworthy record" — data must persist as long as the user needs it, not be purged automatically
- **Storage efficiency:** raw audio (large) need not be kept once transcription is complete; artifacts (small) should persist indefinitely
- **Data minimisation:** retain only what is necessary; raw audio is an intermediate artifact, not a product deliverable
- **Future privacy-tier path:** on-device / fully offline mode must be architecturally possible without redesigning persistence

---

## Options Considered

### Raw Audio Retention

| Option | Behaviour | Verdict |
|--------|-----------|---------|
| Delete after transcription (default) | Raw audio purged once transcript is written; user can opt-in via settings toggle to retain | **Chosen** (D-06) |
| Keep raw audio always | Raw audio retained indefinitely; higher storage cost; larger privacy surface | Rejected as default — available as opt-in only |
| Configurable retention window (N days) | Auto-expiry after N days | Not adopted — adds complexity without clear user need |

### Transcript & Artifact Retention

| Option | Behaviour | Verdict |
|--------|-----------|---------|
| Keep until user deletes | Indefinite retention; user deletes per-meeting or all data via explicit in-app action | **Chosen** (D-07) |
| Auto-expiry (N days) | Automatic purge after configured period | Rejected — directly contradicts the "trustworthy record" core value |

### Encryption at Rest

| Option | Behaviour | Verdict |
|--------|-----------|---------|
| SQLCipher (better-sqlite3-multiple-ciphers) + safeStorage | Full-database AES-256 encryption; key generated on first run and stored in macOS Keychain via Electron safeStorage | **Chosen** (ratified by CLAUDE.md §"Local Persistence & Encryption") |
| Plain SQLite + field-level app-layer encryption | Application-layer encryption only; more complex key management | Rejected — full-DB encryption is cleaner and provides the same protection without additional complexity |
| No encryption | Plaintext on disk | Rejected — privacy non-starter; meeting content is sensitive |

---

## Decision Outcome

**MeetingAssist stores all meeting data locally, encrypted at rest, retained indefinitely until the user deletes it, with raw audio deleted by default after transcription.**

### D-06 — Raw Audio Retention

Per D-06, raw audio is deleted by default once the transcript is written. A settings toggle lets users opt-in to keeping the raw audio file. "Delete after transcription" is the default stance; "keep audio" is an explicit opt-in, not the default. This is the transcribe-then-delete-raw-audio stance required by [REQUIREMENTS.md DEC-02](../../REQUIREMENTS.md).

### D-07 — Transcript and Artifact Retention

Per D-07, transcripts, minutes of meeting (MOM), summaries, and action items are kept indefinitely until the user explicitly deletes them. There is no automatic expiry. The user deletes individual meetings or all data via an explicit in-app action. This directly supports the core product value: "a user walks out of any meeting with an accurate, trustworthy record."

### D-08 — Data After Uninstall

Per D-08, meeting data persists on disk after the app is uninstalled unless the user explicitly deletes it first. This ADR recommends the app surface a prominent "Delete All Meeting Data" action in its settings, giving users a clean-delete path before uninstalling. No automatic cleanup mechanism is introduced at uninstall time. The exact settings surface will be specified in Phase 5 PRD.

### D-09 — On-Device / Offline Mode

Per D-09, on-device / offline mode (whisper.cpp + local LLM for fully private, no-cloud recording) is a planned future capability. Its scope (full offline vs. partial) and implementation details are deferred to a later phase. DEC-02 notes its existence as a future privacy-tier option without committing to implementation specifics. The persistence layer (SQLCipher local storage) is architecturally compatible with an on-device mode without requiring redesign.

### Persistence Stack (ratified from CLAUDE.md §"Local Persistence & Encryption")

The following locked technical stack is established in CLAUDE.md and ratified as authoritative by this ADR:

| Data | Store | Encryption |
|------|-------|------------|
| Transcripts, MOM, summaries, action items, meeting metadata | `better-sqlite3-multiple-ciphers` (SQLCipher, AES-256, full-DB) | Key generated on first run; stored via Electron `safeStorage` (macOS Keychain-backed) |
| Small prefs / settings (API keys go via safeStorage) | `electron-store` | `safeStorage` for secrets |
| Vector embeddings (cross-meeting search) | `sqlite-vec` table inside the same SQLCipher DB | Inherits DB encryption |

---

## Consequences

**Positive:**

- **Privacy-defensible:** meeting content is never in plaintext on disk; the macOS Keychain backs the encryption key via Electron `safeStorage`
- **Data minimisation:** raw audio (the largest, most sensitive intermediate) is purged by default once transcription completes
- **User control:** indefinite retention plus explicit delete gives users full ownership of their meeting record
- **Architectural path to on-device mode:** SQLCipher local storage means the persistence layer does not need to change when an on-device privacy tier is introduced
- **Single encrypted DB:** `sqlite-vec` vector embeddings live inside the same SQLCipher DB, inheriting encryption with no additional key management

**Negative / Tradeoffs:**

- **safeStorage is macOS-specific:** cross-platform key management (Windows/Linux Keychain equivalents) is future work if cross-platform support is added
- **Data persists after uninstall:** users who do not use the "Delete All Meeting Data" action before uninstalling leave data on disk; mitigated by surfacing a prominent delete action in settings (Phase 5 PRD will specify)
- **On-device mode is deferred:** users who want fully private, no-cloud recording cannot get it in the initial release; this is a known and accepted tradeoff

---

## Open Dependencies

**OPEN: [RSCH-03](../../REQUIREMENTS.md) — Vendor DPA / no-training terms for Deepgram and the chosen LLM provider(s) must be confirmed before this ADR is fully closed. Until RSCH-03 completes, the data-handling ADR operates on the reasonable assumption that enterprise/API tiers exclude training on customer data; Phase 3 RSCH-03 will verify and update this ADR if needed.**

The consent posture governing who is informed that recording is happening is governed by [DEC-01](./02-DEC-01-consent-recording-posture.md). DEC-02 governs what happens to the data once captured.
