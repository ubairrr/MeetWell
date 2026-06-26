---
phase: 05
document: FEATURE-SPEC
version: 1.0
status: final
requirements_covered: PRD-01
created: 2026-06-26
---

# MeetingAssist v1 Feature Specification

## 1. Purpose and Scope

This document fixes the MVP boundary for MeetingAssist v1. No new decisions are made here — all feature classifications derive from locked decisions produced in Phases 1–4.

The four locked-decision sources that drive every row in this spec:

| Source | Decisions Covered |
|--------|------------------|
| `05-CONTEXT.md` | D-01 through D-14 (complete MVP feature boundary), D-15, D-16 (document structure) |
| `RSCH-04` spike report | D-10 — capture path: audiotee (Core Audio Taps) as primary; Chromium loopback as fallback |
| `RSCH-02` diarization report | D-02 — Speaker 1/2/3 labels, v1 cap 8 speakers, v2 named attribution |
| `DEC-01` ADR | D-09 — consent gate as hard precondition; per-meeting, all-party disclosure |

**Consumers of this spec:** `05-ARCHITECTURE.md` (Plan 02) and `05-BUILD-ORDER.md` (Plan 03). Every architecture decision and build phase must be justified by a feature in this document.

---

## 2. MVP Boundary Table

| Feature | Classification | Rationale / Source |
|---------|---------------|-------------------|
| Consent gate — per-meeting, all-party disclosure + checkbox UI | **Table Stakes — v1** | DEC-01 hard precondition; audio capture cannot start until consent is explicitly confirmed |
| Dual-channel audio capture — mic (AudioWorklet) + system audio (audiotee Core Audio Taps primary, macOS 14.2+; Chromium loopback fallback, macOS 15.0+ tested) | **Table Stakes — v1** | D-10; RSCH-04 spike overrides CLAUDE.md default — audiotee preferred over `electron-audio-loopback` |
| Real-time transcription with Speaker 1/2/3 diarization — Deepgram Nova-3, v1 cap 8 speakers | **Table Stakes — v1** | D-02, RSCH-02 — Speaker label format locked; named attribution deferred to v2 (D-14) |
| Persistent side overlay — always-on-top, no dock icon, screen-share-invisible panel | **Table Stakes — v1** | D-01, DNA Technique 5 — core product surface that all other UI features live inside |
| Live summary board — 5-minute interval summary cards stacked in overlay | **Table Stakes — v1** | D-08, 04-AI-SPEC §2.3 — near-zero marginal cost; ContextEngine generates cards as side effect of passive path |
| TranscriptStore — full meeting record encrypted at rest (SQLCipher AES-256) | **Table Stakes — v1** | D-02, DEC-02 — local-first encrypted persistence is a product-level commitment |
| End-of-meeting artifact batch — MOM, key points, summary, action items, dates/events | **Table Stakes — v1** | D-03, D-04, D-05, D-06 — core value of the product; what the user walks out with |
| Citation-backed artifact extraction — proposed-with-confirm UX, verbatim quote anchors, "Verify" toggle | **Table Stakes — v1** | D-03 through D-06, 04-AI-SPEC §1.2–1.5 — faithfulness is a core differentiator; not optional |
| .ics export — confirmed action items exported as iCalendar; zero OAuth required | **Table Stakes — v1** | D-06 — universal calendar compatibility; Google/Outlook direct API deferred to v2 |
| Break assist — manual "Going on Break" / "I'm Back" trigger; shows interval cards missed + "While you were away" digest | **Table Stakes — v1** | D-07, 04-AI-SPEC §2.9 — differentiator unique to bot-free products; near-zero marginal cost after ContextEngine |
| No visible bot — local-first, macOS-native capture; no meeting room invite, no bot account | **Differentiator** | RSCH-01 — 84% of users alter behavior when AI is visibly present; bot-free is a core positioning pillar |
| Pre-mixer system audio via Core Audio Taps — volume-independent, clean PCM; no persistent purple screen-recording indicator | **Differentiator** | RSCH-04 — UX quality advantage; Path 1 (Chromium loopback) triggers a persistent purple indicator that harms user trust |
| Faithfulness-grounded extraction — citation anchors, two-stage extraction, CitationValidator 90% token overlap | **Differentiator** | 04-AI-SPEC §1.2 — direct response to 11–13% speaker attribution error rate in competitor tools (RSCH-01) |
| Live summary board with break assist — the combination does not exist in any bot-free competitor | **Differentiator** | RSCH-06 competitive gap analysis — unique combination |
| Encrypted local-first storage — SQLCipher + safeStorage; addresses the #1 adoption barrier | **Differentiator** | RSCH-01 — 46–50% of workers cite privacy as top concern for AI meeting tools |
| Live assistant interactive chat UI — hotkey/keyword-triggered in-meeting Q&A | **Deferred v2+** | D-11 — ContextEngine architecture is built in v1 (break assist depends on it); interactive chat UI is post-MVP |
| Meeting-type-specific artifact templates — standup, sales call, 1:1, design review | **Deferred v2+** | D-12 — one universal template in v1; template variety needs real usage data to design well |
| Cross-meeting search UX — sqlite-vec semantic search over past meetings | **Deferred v2+** | D-13 — sqlite-vec DB schema is v1 infrastructure; search UX is post-launch |
| Named speaker attribution — "Alice" / "Bob" in place of Speaker 1/2/3 | **Deferred v2+** | D-14 — v1 ships Speaker 1/2/3 labels; name confirmation UX requires additional design work |
| Google Calendar / Outlook direct API integration | **Deferred v2+** | .ics export covers all calendar apps in v1; OAuth adds complexity disproportionate to v1 value |
| Slack, Notion, CRM integrations | **Deferred v2+** | RSCH-06 competitive analysis — post-launch; validated usage data needed before prioritizing integrations |

---

## 3. Feature Details — Table Stakes

### 3.1 Consent Gate

**Description:** A per-meeting disclosure and consent checkpoint that the user must complete before audio capture can begin.

**User story:** As a user, when I click "Start Meeting," I am presented with a disclosure checkbox explaining that the meeting will be recorded and transcribed, and the Start button remains disabled until I check it — so that I confirm my intent to disclose recording before any audio is captured.

**Key behaviors:**
- The consent dialog is shown every time the user starts a new meeting, without exception
- The "Start Capture" button is visually disabled and non-interactive until the disclosure checkbox is checked
- Audio capture cannot start until the consent IPC event has been received by the main process (enforced at the SessionManager FSM level, not only in the UI)
- The consent posture is always-on by default; there is no setting to disable the consent gate
- Consent applies to all-party disclosure (the user commits to informing all meeting participants)

**Source decisions:** DEC-01 (consent gate ADR, all-party-consent design, per-meeting confirmation)

---

### 3.2 Dual-Channel Audio Capture

**Description:** Simultaneous capture of the user's microphone and the system audio (all other meeting participants), producing two independent audio streams for independent transcription.

**User story:** As a user, I want both my voice and the other participants' voices captured separately so that speaker attribution in the transcript accurately distinguishes "You" from "Speaker 1," "Speaker 2," etc.

**Key behaviors:**
- Microphone audio is captured via Web Audio API AudioWorklet in the renderer, with PCM frames streamed to the main process via IPC
- System audio is captured via the primary or fallback path (see Note below)
- Both channels are streamed independently to separate Deepgram Nova-3 WebSocket connections
- The mic channel always maps speaker ID to "You"; the system audio channel has an independent speaker ID space
- The capture health status (silent, healthy, error) is surfaced in the overlay UI for both channels independently

**Note — RSCH-04 spike supersedes CLAUDE.md default:**
The CLAUDE.md recommended `electron-audio-loopback` as the default capture library. The RSCH-04 spike (2026-06-25) found that `audiotee` (Core Audio Taps) is strongly preferred and that `electron-audio-loopback` is unnecessary on Electron 42.x. The CLAUDE.md reference to `electron-audio-loopback` is superseded by the spike finding.

- **Primary path:** `audiotee` npm package (Core Audio Taps, macOS 14.2+). Pre-mixer audio — captures system audio volume-independently before the OS mixer. Does not trigger the persistent purple screen-recording indicator in the macOS menu bar.
- **Fallback path:** Native Chromium loopback flags (`MacLoopbackAudioForScreenShare` / `MacSckSystemAudioLoopbackOverride`), tested on macOS 15.0+. Post-mixer audio. Triggers the persistent purple screen-recording indicator.

**Source decisions:** D-10, RSCH-04 (spike override of CLAUDE.md default)

---

### 3.3 Real-Time Transcription with Diarization

**Description:** Both audio channels are transcribed in real time by Deepgram Nova-3, with speaker diarization producing labeled segments ("You," "Speaker 1," "Speaker 2," …).

**User story:** As a user, I see each speaker's words attributed to a labeled participant in real time in the overlay, so that the transcript I walk out with is an accurate, attributed record of the full conversation.

**Key behaviors:**
- Each speech final event from Deepgram produces a `TranscriptSegment` record with a speaker label, timestamps, and channel identifier
- The mic channel always labels speaker 0 as "You" — the user's voice is always unambiguous
- System audio uses an independent speaker registry; Speaker 1, Speaker 2, etc. are assigned sequentially as new voices appear
- v1 caps diarization at 8 speakers; meetings with more than 8 participants use best-effort attribution
- All transcript segments are persisted to the encrypted TranscriptStore as they arrive
- Deepgram `mip_opt_out=true` is hardcoded in the SDK initialization; it is not a user-configurable setting

**Source decisions:** D-02, RSCH-02 (diarization approach, Speaker 1/2/3 label format, v1 8-speaker cap, v2 named attribution rationale)

---

### 3.4 Persistent Side Overlay

**Description:** The MeetingAssist assistant panel renders as a persistent, always-on-top, right-side overlay that remains visible during the entire meeting without appearing in the user's own screen-share.

**User story:** As a user, I want the assistant panel to stay on my screen during the whole meeting so I can see the live summary board at a glance and interact with break assist — without the panel showing up when I share my screen in the meeting.

**Key behaviors:**
- The overlay is positioned on the right edge of the screen at full screen height, approximately 380px wide
- It remains on top of all other windows, including full-screen applications, throughout the meeting
- No dock icon is shown — the app behaves as a background overlay assistant
- `setContentProtection(true)` prevents the overlay from appearing when the user shares their own screen in a meeting; this is ethically acceptable per DEC-01 §2 (it conceals the panel UI, not the fact of recording)
- Mouse events are disabled by default so the overlay doesn't interfere with click-through; mouse interaction is re-enabled when the user intentionally interacts with the panel

**Source decisions:** D-01, DNA Technique 5 (overlay window configuration: `setAlwaysOnTop`, `setVisibleOnAllWorkspaces`, `setIgnoreMouseEvents`, `app.dock.hide()`)

---

### 3.5 Live Summary Board

**Description:** Every 5 minutes during the meeting, the ContextEngine generates a summary card covering the current interval. Cards stack in the overlay panel, giving the user a running log of meeting progress.

**User story:** As a user, I want to glance at the overlay at any point during the meeting and see a concise summary of what happened in the last 5-minute interval — topic headline, key points, and which speakers contributed.

**Key behaviors:**
- A new summary card is generated automatically at 5-minute intervals from the moment capture starts
- Each card contains: interval time label (e.g., "10:00–10:05"), topic headline, 3–5 key points, and speaker contributions
- Cards stack in the overlay panel with the most recent card at the top
- Cards are persisted to the encrypted database so they survive if the app is restarted
- Card generation reuses the same Deepgram-to-transcript-to-LLM pipeline as the end-of-meeting batch; no additional infrastructure required

**Source decisions:** D-08, 04-AI-SPEC §2.3 (SummaryCardSchema and SummaryCardTimer specification)

---

### 3.6 TranscriptStore

**Description:** All transcript segments and meeting metadata are persisted to a SQLCipher-encrypted local database in real time as the meeting progresses.

**User story:** As a user, I want the complete transcript of every meeting stored securely on my device so that I can access it later, know it cannot be read if someone gains access to my machine, and be confident it is never uploaded to a third-party cloud server.

**Key behaviors:**
- Every `speech_final` segment from Deepgram is written to the `transcript_segments` table as it arrives — no buffering
- Meeting metadata (title, start time, end time) is stored in the `meetings` table
- The database is encrypted with SQLCipher AES-256 full-database encryption; the encryption key is generated on first run and stored in the macOS Keychain via Electron `safeStorage`
- Raw audio files are deleted immediately after Deepgram transcribes them; only the text transcript is retained
- Transcripts are retained indefinitely until the user explicitly deletes them

**Source decisions:** D-02, DEC-02 (local-first storage, SQLCipher + safeStorage, raw audio deletion, indefinite retention)

---

### 3.7 End-of-Meeting Artifact Batch

**Description:** When the user ends the meeting, the ArtifactPipeline processes the full transcript and produces a complete set of structured meeting artifacts: minutes of meeting (MOM), key points, meeting summary, action items, extracted dates/deadlines/events.

**User story:** As a user, when I click "End Meeting," I receive — within a few minutes — a complete, structured record of the meeting: a formal minutes document, a bulleted list of key decisions and takeaways, action items with owners and due dates, and any mentioned deadlines or calendar events, all ready to review and act on.

**Key behaviors:**
- The pipeline triggers automatically when the user ends the meeting
- The full transcript is chunked into 5-minute intervals and processed in parallel (map) then merged (reduce) to produce the final artifact set
- Artifacts include: meeting summary, key points with citations, action items with assignees and due dates, decisions, extracted dates/events, and minutes of meeting
- All artifacts are produced as `status: 'proposed'` — none are automatically written to any external system
- The user can track extraction progress via a progress indicator in the overlay

**Source decisions:** D-03 (MOM), D-04 (key points), D-05 (summary), D-06 (action items / dates)

---

### 3.8 Citation-Backed Artifact Extraction

**Description:** Every extracted artifact — each action item, decision, key point, and date — is anchored to a verbatim quote from the transcript. Users can toggle a "Verify" panel to inspect the source quote for any item.

**User story:** As a user, I want to be able to trust that every action item and decision in my meeting minutes is based on something that was actually said, and I want to be able to see the exact quote so I can correct mistakes — because mis-attributed action items are the main reason I distrust AI meeting notes today.

**Key behaviors:**
- All extracted items are generated via a mandatory two-stage protocol: Stage 1 extracts verbatim quotes from the transcript; Stage 2 generates artifact content constrained to those quotes only
- Every artifact carries at least one `CitationAnchor` containing the verbatim quote, speaker label, and timestamp range
- A "Verify" toggle in the ArtifactReviewPanel reveals the citation panel for any item; it is hidden by default to keep the UI clean
- The `CitationValidator` verifies that each citation has ≥ 90% token overlap with the actual transcript text; items failing this check are rejected before being shown to the user
- All artifacts are shown with `status: 'proposed'`; the user confirms, edits, or dismisses each one before it is finalized

**Proposed-with-confirm contract (per 04-AI-SPEC §1.5):** All extracted items carry `status: 'proposed'`. The user must explicitly confirm an item before it is finalized. No artifact is ever automatically written to any external system — including the calendar, task manager, or any integration. This contract is enforced by the Zod schema (`status: z.literal('proposed')`) and cannot be bypassed.

**Source decisions:** D-03 through D-06, 04-AI-SPEC §1.2 (two-stage extraction), §1.4 (Verify toggle default hidden), §1.5 (proposed-with-confirm contract)

---

### 3.9 .ics Export

**Description:** Confirmed action items and extracted dates are exported as an iCalendar (.ics) file that the user can import into any calendar application.

**User story:** As a user, after I confirm the action items from my meeting, I want to export them as calendar events so I can drop them into my calendar with a single click — without granting the app access to my Google or Outlook account.

**Key behaviors:**
- Only items with `status: 'confirmed'` are included in the export; proposed items are never exported
- The export generates a standards-compliant .ics file using the `ics` npm library
- The user is prompted with a native file-save dialog to choose where to save the .ics file
- The exported .ics file is compatible with Apple Calendar, Google Calendar, Outlook, and any other standards-compliant calendar
- No OAuth, no account linking, no external API calls required for this feature

**Source decisions:** D-06 (action items / dates extraction + .ics export), 04-AI-SPEC §1.5 (proposed-with-confirm — only confirmed items exported)

---

### 3.10 Break Assist

**Description:** When the user steps away from a meeting, they can tap "Going on Break" to mark the break start; when they return and tap "I'm Back," the app presents a digest of all summary cards generated while they were away, plus a "While You Were Away" narrative.

**User story:** As a user who occasionally needs to step out of a meeting, I want to tap a button before I leave and another when I return, and immediately see a concise digest of what I missed — so I can re-engage without interrupting the conversation to ask what happened.

**Key behaviors:**
- The "Going on Break" and "I'm Back" buttons are always visible in the overlay during an active meeting
- Tapping "Going on Break" records the break start timestamp; meeting capture continues running normally
- Tapping "I'm Back" triggers a digest generation using the summary cards produced during the break interval
- The digest includes all interval cards generated while the user was away, plus a "While You Were Away" narrative combining them into a single paragraph
- The user can dismiss the digest and continue the meeting without any additional steps

**Source decisions:** D-07, 04-AI-SPEC §2.9 (Break Assist digest data flow — BreakAssistDigestSchema)

---

## 4. Feature Details — Deferred v2+

### 4.1 Live Assistant Interactive Chat UI

**Why deferred:** The ContextEngine architecture (which powers break assist and the summary board) is built in v1. The interactive chat UI that allows the user to ask questions mid-meeting is deferred because the core pipeline must be validated before adding a real-time conversational layer.

**What is built in v1 as infrastructure:** The ContextEngine, RollingWindow, and ContextComposer modules are implemented in v1 to support break assist and the summary board. These are the exact building blocks the live assistant chat UI would use. The v2 work is the chat UI and hotkey/keyword trigger — not the underlying architecture.

---

### 4.2 Meeting-Type-Specific Artifact Templates

**Why deferred:** One universal template is sufficient for v1. Template variety (standup, sales call, 1:1, design review) requires real-world usage data to understand which template variations provide the most value — data that cannot be designed in advance of launch.

**What is built in v1 as infrastructure:** The MeetingArtifactsSchema and ArtifactPipeline are designed to be extensible. The v2 work is creating variant prompt templates and schema extensions — not restructuring the pipeline.

---

### 4.3 Cross-Meeting Search UX

**Why deferred:** The `sqlite-vec` extension is loaded into the SQLCipher database in v1 and the DB schema includes the `vec_chunks` table for embedding storage. The semantic search UX — the ability to query across past meetings — is deferred to v2 when there is a meeting history large enough to make search valuable.

**What is built in v1 as infrastructure:** The `vec_chunks` table and `sqlite-vec` extension are part of the v1 DB schema (RSCH-05). Epoch summaries are embedded and stored in v1 for the ContextEngine's epoch RAG path. The v2 work is the search UX and cross-meeting query interface.

---

### 4.4 Named Speaker Attribution

**Why deferred:** v1 ships with Speaker 1/2/3 labels. Building a reliable name-attribution UX — where the user can assign real names to speaker labels — requires a confirmation flow that adds UI complexity disproportionate to v1 scope. Deepgram Nova-3 diarization produces speaker IDs; converting those to names in a reliable way is the v2 feature.

**What is built in v1 as infrastructure:** All transcript segments store `speaker_label` as a string field in the schema. The v2 work is a name-assignment UI and a mapping table (speaker_label → display_name) — both additive, not restructuring.

---

### 4.5 Google Calendar / Outlook Direct API Integration

**Why deferred:** .ics export covers all major calendar applications in v1 with zero OAuth complexity. Direct API integration with Google Calendar and Outlook requires OAuth 2.0 flows, token storage, and provider-specific error handling — complexity that is not justified until the .ics workflow is validated with real users.

---

### 4.6 Slack, Notion, CRM Integrations

**Why deferred:** Post-launch per RSCH-06 competitive analysis. Integrations beyond .ics require validated understanding of which integrations users actually need — data available only after launch.

---

## 5. Platform and System Requirements

| Requirement | Specification |
|-------------|---------------|
| macOS minimum (primary capture path) | **macOS 14.2+** — required for `audiotee` Core Audio Taps capture |
| macOS minimum (fallback capture path) | **macOS 15.0+** — tested for native Chromium loopback flags |
| macOS < 14.2 | **Not supported in v1** |
| Architecture | macOS single-user local app; no server-side components in v1 |
| Meeting data storage | Stored locally on-device, encrypted at rest (SQLCipher AES-256); no cloud storage |
| STT data handling | Deepgram `mip_opt_out=true` **hardcoded** in SDK initialization — not a user setting; Deepgram confirmed no-training DPA (RSCH-03) |
| LLM provider requirement | Gemini **paid plan only** — free tier is disqualified because the Gemini free tier explicitly allows training on submitted data (RSCH-03 critical warning). The app validates this at settings time. |
| Audio retention | Raw audio deleted immediately after transcription; text transcripts retained until user deletes |
| Permissions required | "Microphone" (mic capture), "System Audio Recording" (audiotee path) |

---

## 6. Cross-References

| Document | Relationship | Link |
|----------|-------------|------|
| 05-ARCHITECTURE.md | Architecture specification that implements this feature scope | [./05-ARCHITECTURE.md](./05-ARCHITECTURE.md) |
| 05-BUILD-ORDER.md | Build phase sequence derived from this feature scope | [./05-BUILD-ORDER.md](./05-BUILD-ORDER.md) |
| 05-PRD.md | Executive hub document that summarizes this spec | [./05-PRD.md](./05-PRD.md) |
| 04-AI-SPEC.md | Faithfulness contract governing artifact extraction and ContextEngine | [../04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md](../04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md) |
| 02-DEC-01 | Consent gate ADR — all-party disclosure, per-meeting gate design | [../02-foundational-decisions-adrs/02-DEC-01-consent-recording-posture.md](../02-foundational-decisions-adrs/02-DEC-01-consent-recording-posture.md) |
| 02-DEC-02 | Data-handling and privacy ADR — local-first, SQLCipher, raw audio deletion | [../02-foundational-decisions-adrs/02-DEC-02-data-handling-privacy.md](../02-foundational-decisions-adrs/02-DEC-02-data-handling-privacy.md) |
