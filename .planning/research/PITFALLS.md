# Pitfalls Research

**Domain:** macOS AI meeting-assistant desktop overlay (live transcription → MOM/summary/action-items + in-meeting assistant)
**Researched:** 2026-06-25
**Confidence:** MEDIUM (legal/consent and AI-hallucination findings cross-verified across multiple independent legal/industry sources; individual web sources are LOW tier and corroborated, not authoritative — treat specific statutes and macOS-version cutoffs as "verify before relying," not legal advice)

> **Single most important takeaway for the PRD:** Two pitfalls below are existential, not cosmetic. (1) **Carrying the DNA's stealth/invisibility capability into a recording context is a direct legal-liability path** — the Otter.ai class action is the cautionary tale. (2) **Fabricated action items and dates are the #1 trust-killer** for meeting tools and will quietly destroy the product's core value ("a record you trust enough not to re-check"). Both demand explicit product decisions, not implementation details.

---

## Critical Pitfalls

### Pitfall 1: Carrying stealth/invisibility into a recording product (the consent landmine)

**What goes wrong:**
The DNA ships `NSWindowSharingNone` + `LSUIElement` + screen-saver-level layering specifically so the overlay is invisible to Zoom/Meet/Teams, Dock, and Cmd+Tab. In an interview-cheating context that invisibility *is* the feature. In a meeting-recording context, an invisible tool that captures audio of other participants without their knowledge is, in many jurisdictions, an illegal wiretap. Otter.ai is currently defending a consolidated federal class action (N.D. Cal., filed Aug–Sep 2025) alleging exactly this: silent/auto-joined capture of participants and third parties without affirmative consent, in violation of the federal ECPA and California's Invasion of Privacy Act (CIPA). The motion-to-dismiss hearing is set for May 2026 — the legal question is live and unresolved.

**Why it happens:**
The stealth machinery is "free" inherited engineering, so the path of least resistance is to keep it. The team conflates two different invisibilities: (a) "the overlay UI doesn't appear on the user's own screen-share" (benign, a UX nicety) vs. (b) "other participants have no way to know they're being recorded" (the legal landmine). Reusing the DNA blurs them.

**How to avoid:**
- Make this an **explicit PRD product decision**, not a default-on inheritance. Recommended default: **MeetingAssist is the *recording party's* tool only — it records the user's own audio + the user's own machine's incoming audio, and it makes recording *disclosable*, never *covert*.**
- Treat the two invisibilities separately. Keeping `NSWindowSharingNone` so the user's private assistant panel doesn't leak onto a screen-share they initiate is defensible. **Removing/keeping any capability whose purpose is to hide the *fact of recording* from other participants must be a deliberate, documented decision.**
- Ship a **consent/disclosure feature as table-stakes**: a one-tap "I have disclosed recording to participants" gate, an optional spoken/posted disclosure snippet, and a per-meeting consent log. Default to "all-party consent" posture (the strictest standard) since the user's counterparties may be in CA/IL/WA/etc. or the EU.
- For any future "auto-join bot" feature: a visible bot/participant tile + an audible/posted disclosure is the legally safer pattern than silent host-side capture. (This is precisely what Otter is accused of skipping.)

**Warning signs:**
- A backlog item reads "reuse stealth overlay" without a consent counterpart.
- Anyone describes a feature as "records without the other side knowing."
- No consent gate exists before the first byte of remote audio is captured.
- Marketing copy implies covert capture.

**Phase to address:**
**PRD / requirements phase (this milestone) — non-negotiable.** Must produce an explicit "Consent & Recording Posture" decision and an ADR. Then enforced in the first build phase (capture pipeline) via a consent gate that blocks capture.

---

### Pitfall 2: Fabricated action items, dates, and decisions (the trust-killer)

**What goes wrong:**
The product's entire value proposition is "a record you trust enough not to re-check." LLM meeting summaries hallucinate in a specific, dangerous way: not obvious fiction, but **subtle, confidence-inspiring distortions**. Documented patterns: **false attribution** (assigning a decision to someone who only asked a question), **temporal smoothing** (turning "maybe next week" into "due Tuesday"), **consensus fabrication** (stating agreement that was never declared), and **topic inflation** (a throwaway comment becomes a "key takeaway"). A single fabricated deadline that a user puts on their calendar destroys trust permanently — and these errors *feel* trustworthy, so users won't catch them.

**Why it happens:**
LLMs optimize fluency over fidelity; "summarize this meeting" is interpreted as "produce a coherent paragraph," with no inherent requirement that commitments be verifiable. Free-form summarization with no grounding constraint produces plausible-but-invented structure. Teams also tend to demo on clean, short transcripts where hallucination is rare, then ship to messy 60-minute cross-talk meetings where it explodes.

**How to avoid:**
- **Ground every structured artifact in the transcript.** Each action item, date, decision, and owner must carry a citation: the transcript span/timestamp it was derived from. If a claim can't be grounded to a span, it doesn't ship as an artifact.
- **Quote-backed extraction prompt design:** require the model to return, per action item, the verbatim supporting quote + speaker + timestamp; reject/flag items where the quote doesn't actually contain a commitment.
- **Surface confidence and make verification one-tap.** Show extracted action items as *proposed* (with the source quote inline) that the user confirms before they leave the meeting or sync to calendar — never auto-write to calendar silently.
- **Be conservative on dates.** Never normalize tentative language into firm deadlines. Preserve hedging ("tentatively next week") rather than inventing "2026-07-02."
- **Evaluate with adversarial transcripts** (cross-talk, tentative language, questions-vs-decisions) and track a faithfulness/grounding metric, not just "looks good."

**Warning signs:**
- Action items appear with no source citation in the UI.
- The summary prompt is a single "summarize this meeting" call with no grounding/quoting constraint.
- QA only ever tests short, clean transcripts.
- Users start re-listening to recordings to double-check — that means trust is already gone.

**Phase to address:**
This is an **AI-system design phase** — warrants a dedicated AI-SPEC contract (grounding strategy, prompt contracts, eval harness, faithfulness metric) **before** the summarization/extraction phase is built. Verification: an eval suite with adversarial transcripts measuring grounded-vs-fabricated rate.

---

### Pitfall 3: macOS system-audio capture is the riskiest technical dependency

**What goes wrong:**
Capturing the *other participants'* audio (system/loopback audio) on macOS is the hardest part of the whole stack and the area most likely to silently fail in production. Loopback capture was historically impossible in Electron; it is now possible via **ScreenCaptureKit** (system audio in `desktopCapturer`) and **Core Audio process taps**, but capturing audio from *all* apps (i.e., the meeting app) via Core Audio taps requires **macOS 14.2+**, and both APIs have well-documented production reliability problems. A "works on my Sequoia machine" capture pipeline can drop audio, capture silence, or fail entirely on older OS versions or under permission edge cases — meaning the transcript (the core deliverable) is incomplete or empty.

**Why it happens:**
The DNA already does dual-channel transcription, so the team assumes audio capture is "solved." But the DNA's exact capture mechanism, its minimum macOS version, and its reliability under real meeting conditions need re-validation — and Apple's APIs shifted recently (Core Audio taps for all-app capture is a macOS 14.2+ feature). Electron inherits every native-layer limitation.

**How to avoid:**
- **Spike system-audio capture early** (a dedicated build-phase-0 or PRD-time technical spike) across the macOS versions you intend to support; document the real minimum version.
- Define a **capture-failure UX contract**: detect dropped/silent system audio and warn the user *during* the meeting ("we're not hearing the other participants") rather than producing a half-empty transcript discovered after the fact.
- Decide the supported-macOS floor explicitly (e.g., "macOS 14.2+ for full system-audio capture; mic-only on older") and degrade gracefully.
- Capture and persist raw audio (subject to the consent/retention policy) so a transcript can be regenerated if real-time STT drops.

**Warning signs:**
- No spike output validating capture on >1 macOS version.
- Transcripts intermittently missing one channel ("Interviewer"/remote side blank).
- Reliance on an undocumented or deprecated loopback hack.
- No in-meeting "audio healthy?" indicator.

**Phase to address:**
**Technical spike at PRD time + first build phase (capture pipeline).** Verification: capture validated on the declared min and current macOS versions, plus an automated silent-audio detector.

---

### Pitfall 4: macOS permission onboarding (TCC) abandonment

**What goes wrong:**
MeetingAssist needs microphone, screen-recording (for ScreenCaptureKit system audio), and likely accessibility (hotkeys) permissions — each a separate TCC prompt, some requiring an app restart to take effect. macOS TCC is notoriously fragile: an app first launched **under quarantine** can hit a "silent denial loop" where TCC caches a failed state and won't re-prompt even after the user wants to grant access; recovery requires `tccutil reset` or manual System Settings surgery. This is a top first-run abandonment point: the user installs, the assistant captures nothing, and they quit.

**Why it happens:**
Teams test on dev machines where permissions were granted long ago and quarantine never applied. The first-run experience of a freshly downloaded, notarized, quarantined app is never exercised. Electron's permission flow doesn't map cleanly to macOS's per-resource, restart-sensitive model.

**How to avoid:**
- Build a **guided permission onboarding** that requests each permission in order, deep-links to the exact System Settings pane, explains *why* each is needed, and detects/handles the restart requirement for Screen Recording.
- **Test the real quarantined first-run** on a clean machine/VM with a notarized, Gatekeeper-checked build — not a `npm run dev` build.
- Detect the silent-denial state and surface recovery instructions (or the `tccutil reset` guidance) instead of failing silently.
- Notarize + sign correctly (valid Developer ID, hardened runtime, proper entitlements + usage-description strings) — missing usage strings cause silent denials.

**Warning signs:**
- First-run tested only on dev machines.
- App captures nothing but shows no permission error.
- No deep-links to System Settings panes.
- Permission state assumed rather than queried at launch.

**Phase to address:**
**First build phase (onboarding + capture).** Verification: clean-machine first-run test from a notarized DMG passes; permission-denied state produces actionable recovery UI.

---

### Pitfall 5: Privacy & data exposure via cloud STT/LLM

**What goes wrong:**
Sending live meeting audio to cloud STT (Deepgram) and transcripts to cloud LLMs means highly sensitive third-party speech leaves the user's machine. Otter's class action specifically attacks **indefinite retention** and **using customer conversations to train the vendor's model**. Enterprise buyers expect data-residency guarantees, no-training assurances, encryption, and defined retention. Getting this wrong is both a trust failure and (with EU participants) a GDPR violation — AI transcription processors require an Article 28 Data Processing Agreement, lawful basis, data minimization, documented retention, and the ability to honor deletion requests.

**Why it happens:**
The provider-agnostic LLM layer makes "just send it to the cloud" frictionless, and the DNA's interview use case never had to honor third-party privacy. No default retention or no-training posture exists.

**How to avoid:**
- Define an explicit **data-handling posture in the PRD**: where transcripts/recordings live (default local-first), default retention, encryption at rest, and a hard "we don't train on your data / our processors don't either" stance — verify Deepgram/LLM-provider terms support no-training.
- Offer **local/on-device STT and local LLM options** (the provider-agnostic layer already supports Ollama/LM Studio) for privacy-sensitive users — a genuine differentiator vs. cloud-only competitors.
- Implement retention controls (auto-delete after N days), encryption at rest, and per-meeting delete.
- For EU/enterprise: surface a DPA, lawful-basis selection, and subject-access/deletion tooling.

**Warning signs:**
- No documented retention default.
- Transcripts stored unencrypted in `electron-store` / plaintext on disk.
- No review of provider data-use/training terms.
- No deletion path for a recorded meeting.

**Phase to address:**
**PRD (data-handling posture + ADR)**, then the storage/persistence build phase. Verification: data-flow diagram reviewed; encryption-at-rest and retention implemented; provider no-training terms confirmed.

---

### Pitfall 6: Cost & performance blow-up on long meetings

**What goes wrong:**
Always-on STT plus repeatedly sending the growing transcript to an LLM scales badly. LLM compute/cost grows roughly quadratically with input length; resending a full 90-minute transcript on every assistant query or summary refresh gets expensive fast (model cost spreads up to ~71x across providers) and *degrades quality* via "lost-in-the-middle" (models attend to start/end, miss the middle). Continuous STT also drains laptop battery and CPU over a long meeting. Context-window overflow on very long meetings can hard-fail the summary/assistant entirely.

**Why it happens:**
The interview DNA dealt with short, bursty Q&A — never a 2-hour continuous transcript. Naive design re-sends the whole transcript per call and assumes the context window is infinite.

**How to avoid:**
- **Hierarchical/rolling summarization:** chunk → summarize chunks → combine (pyramid), with rolling compaction of older transcript (50–70% compression possible at ~98% verbatim) so each LLM call carries a compact running state, not the raw firehose.
- **Semantic/embedding-aware chunking** for retrieval so the live assistant pulls only relevant transcript spans rather than the entire history.
- Incremental processing: update artifacts as the meeting progresses instead of one giant end-of-meeting call.
- Profile battery/CPU during a real long meeting; consider on-device STT to cut both cost and network dependency.
- Set a context-budget guardrail and never exceed the model window.

**Warning signs:**
- Per-query latency/cost climbs as the meeting lengthens.
- Assistant answers get vaguer mid-meeting (lost-in-the-middle).
- Token usage scales linearly-then-painfully with meeting duration.
- Laptop fans spin / battery drains noticeably during meetings.

**Phase to address:**
**AI-system design phase (context/summarization architecture)** + the live-assistant build phase. Verification: cost/latency measured on a synthetic 2-hour transcript stays within budget; no context-overflow failures.

---

### Pitfall 7: Diarization / speaker-attribution errors presented as fact

**What goes wrong:**
"Who said what" is hard: overlapping speech/cross-talk, rapid turn-taking, similar voices/accents, and background noise drive diarization error rates (best-case ~20% DER in noisy far-field). Real-time diarization is materially harder than batch. In long meetings, speaker-label consistency drifts. If MeetingAssist confidently attributes a decision or action item to the wrong person, it compounds Pitfall 2 (false attribution) and erodes trust — and can have real consequences ("you committed to X").

**Why it happens:**
Multi-party diarization is assumed to "just work" from the STT vendor. But the DNA's clean two-channel split (mic = "You", system audio = "Interviewer") only cleanly separates *the user* from *everyone else combined* — it does not distinguish the three other people on the remote call.

**How to avoid:**
- Exploit the **dual-channel advantage**: the user's own mic is a clean, high-confidence "me" channel; reserve diarization uncertainty for the remote side. Always label the local user correctly.
- Treat remote-side speaker labels as **provisional**: let users rename/merge/split speakers and correct attribution; never present labels as authoritative.
- For action-item attribution, prefer "a participant committed to X" with the source quote over a confident-but-possibly-wrong name unless confidence is high.
- Choose an STT/diarization vendor with strong meeting-domain DER and test on cross-talk audio.

**Warning signs:**
- Speaker labels can't be edited by the user.
- Demos only use turn-taking, non-overlapping audio.
- Action items confidently name a person with no correction path.

**Phase to address:**
**Transcription pipeline phase** (labeling model + editable speakers) and **AI extraction phase** (attribution confidence). Verification: diarization tested on overlapping-speech samples; user can correct any label.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reuse stealth/invisibility wholesale from DNA | Free engineering, fast start | Legal liability (wiretap/ECPA/CIPA exposure); brand risk | **Never** without an explicit consent posture decision; UI-only screen-share hiding may be OK if separated from capture-concealment |
| Single "summarize this meeting" LLM call, no grounding | Ships fast, demos well | Hallucinated action items destroy core trust | Never for action items/dates; acceptable only for non-binding "gist" text clearly labeled as draft |
| Re-send full transcript on every LLM call | Simple to build | Quadratic cost, context overflow, lost-in-the-middle | MVP only, for short (<20 min) meetings; must be replaced before GA |
| Store transcripts unencrypted in electron-store | Quick persistence | Privacy breach, GDPR non-compliance | Never for real meeting data |
| Cloud STT/LLM with default vendor terms (no no-training review) | Fastest integration | Data used to train vendor models; enterprise blocker | Only after confirming no-training terms |
| Test capture/permissions only on dev machine | Fast iteration | First-run abandonment from quarantined TCC failures | During early dev only; clean-machine test mandatory before any release |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| ScreenCaptureKit / Core Audio taps | Assuming all-app system-audio capture works on all macOS versions | Require macOS 14.2+ for all-app capture; detect version; degrade to mic-only; spike before committing |
| Deepgram (cloud STT) | Ignoring data-retention/training terms; sending remote audio without consent gate | Confirm no-training terms; gate capture behind consent; offer local STT fallback |
| LLM providers (OpenAI-compatible layer) | Sending raw growing transcript; assuming infinite context | Rolling compaction + retrieval; per-provider context-budget guardrail |
| Calendar (Google/Outlook) | Requesting broad read/write scopes up front | Request minimal scopes (write events only); just-in-time auth when user first syncs an action item; never auto-write events without confirmation |
| macOS TCC permissions | Requesting all permissions at once, no restart handling | Sequential guided requests, deep-link to Settings panes, handle Screen-Recording restart, detect silent-denial loop |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-transcript-per-call LLM usage | Rising latency/cost over a meeting | Rolling summary + retrieval over chunks | ~30–60 min meetings / long sessions |
| Context-window overflow | Summary/assistant hard-fails late in a meeting | Context budget + hierarchical summarization | Multi-hour meetings |
| Continuous STT battery/CPU drain | Fans spin, battery drops during meetings | Profile early; on-device option; efficient streaming | Long back-to-back meetings on battery |
| Lost-in-the-middle quality decay | Assistant gets vaguer mid-meeting | Retrieval of relevant spans, not whole history | As transcript grows past tens of thousands of tokens |
| Diarization drift on long calls | Speaker labels inconsistent over time | Editable speakers; dual-channel anchor for local user | Long, multi-party, cross-talk-heavy meetings |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Covert/stealth capture of third parties | Criminal/civil wiretap liability (ECPA, CIPA, all-party states, GDPR) | Consent gate + disclosure; no capability whose purpose is hiding the *fact* of recording |
| Indefinite retention of transcripts/recordings | Privacy breach, GDPR violation, discovery liability | Default retention limit, per-meeting delete, documented policy |
| Unencrypted transcript storage | Local data theft exposes sensitive meeting content | Encryption at rest; OS keychain for secrets |
| Vendor training on user conversations | Confidential meeting content leaks into a model | Confirm no-training terms; prefer DPAs; offer local processing |
| Leaking the assistant overlay onto a screen-share | User's private notes/queries exposed to participants | Keep `NSWindowSharingNone` for the user's own panel (UI-only, distinct from capture concealment) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Auto-writing action items/dates to calendar | One wrong date erodes trust permanently | Show proposed items with source quotes; require one-tap confirm |
| No in-meeting "audio healthy" indicator | User discovers an empty/half transcript after the meeting | Live capture-health indicator + warning on dropped channel |
| Heavy permission wall at first launch | First-run abandonment | Guided, explained, sequential permission flow with Settings deep-links |
| Presenting speaker labels as authoritative | User trusts wrong attribution | Editable speakers; "me" anchored via local mic channel |
| No clear recording-disclosure affordance | User unknowingly records others illegally | Explicit "disclosed to participants" gate + optional disclosure snippet |
| Polished summary with no citations | Looks trustworthy, may be fabricated | Inline transcript citations/timestamps on every artifact |

## "Looks Done But Isn't" Checklist

- [ ] **System-audio capture:** Often missing reliability across macOS versions — verify on declared min + current macOS from a notarized build, with a silent-audio detector.
- [ ] **Permission onboarding:** Often missing quarantined-first-run handling — verify on a clean machine from a signed/notarized DMG, including the silent-denial recovery path.
- [ ] **Action-item extraction:** Often missing grounding — verify every item carries a transcript citation and adversarial-transcript eval passes.
- [ ] **Long-meeting handling:** Often missing context management — verify a 2-hour transcript doesn't overflow context or balloon cost.
- [ ] **Consent flow:** Often missing entirely — verify capture is blocked until a consent/disclosure step completes.
- [ ] **Data deletion:** Often missing — verify a user can permanently delete a meeting's transcript + recording.
- [ ] **Speaker correction:** Often missing — verify users can rename/merge speakers.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Shipped covert capture (no consent) | HIGH | Immediately gate capture behind consent; remove concealment-of-recording capability; assess legal exposure; notify affected users; revise marketing |
| Fabricated action items in the wild | HIGH | Add grounding/citations; downgrade ungrounded items to "draft"; ship eval harness; communicate fix; rebuild trust slowly |
| System-audio capture unreliable | MEDIUM | Add version detection + mic-only degrade; persist raw audio for re-transcription; add capture-health UI |
| TCC silent-denial loop in field | MEDIUM | Detect denied state; ship in-app recovery (Settings deep-link / tccutil guidance); fix notarization/entitlements |
| Long-meeting cost/overflow | MEDIUM | Introduce rolling compaction + retrieval; cap context budget |
| Unencrypted/retained data | MEDIUM | Add encryption at rest; backfill retention/delete; publish policy |
| Wrong speaker attribution shipped | LOW | Add editable speakers; soften attribution to quote-backed where confidence low |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Stealth/consent landmine (#1) | **PRD: Consent & Recording Posture decision + ADR**; enforced in capture build phase | Capture blocked without consent; no concealment-of-recording capability; documented all-party-consent default |
| Fabricated action items/dates (#2) | **AI-SPEC design phase** before extraction build | Adversarial-transcript eval; every artifact carries a citation; no silent calendar writes |
| System-audio capture reliability (#3) | **PRD-time technical spike** + capture build phase | Validated on min + current macOS from notarized build; silent-audio detector |
| TCC permission abandonment (#4) | **Onboarding build phase** | Clean-machine first-run from notarized DMG passes; recovery UI for denial |
| Privacy/data exposure (#5) | **PRD: data-handling posture + ADR**; storage build phase | Encryption at rest; retention + delete implemented; provider no-training terms confirmed |
| Cost/performance on long meetings (#6) | **AI-SPEC context architecture** + live-assistant phase | 2-hour transcript within cost/latency budget; no context overflow |
| Diarization/attribution errors (#7) | **Transcription pipeline** + AI extraction phase | Tested on overlapping speech; editable speakers; quote-backed attribution |

## Sources

- Recording Law — Two-Party/All-Party Consent States guide: https://www.recordinglaw.com/party-two-party-consent-states/
- Justia — 50-State Survey, Recording Phone Calls and Conversations: https://www.justia.com/50-state-surveys/recording-phone-calls-and-conversations/
- NPR — Class action claims Otter AI secretly records private conversations (Aug 15 2025): https://www.npr.org/2025/08/15/g-s1-83087/otter-ai-transcription-class-action-lawsuit
- Fisher Phillips — New Lawsuit Highlights Concerns About AI Notetakers (7 steps): https://www.fisherphillips.com/en/insights/insights/new-lawsuit-highlights-concerns-about-ai-notetakers
- Workplace Privacy Report — Lessons from the Otter.ai Class Action Complaint: https://www.workplaceprivacyreport.com/2025/08/articles/artificial-intelligence/ai-notetaking-tools-under-fire-lessons-from-the-otter-ai-class-action-complaint/
- tl;dv — AI Meeting Recorder Lawsuits 2026 (Otter, Fireflies): https://tldv.io/blog/ai-meeting-recorder-lawsuits/
- IAPP — How do rules on audio recording change under the GDPR: https://iapp.org/news/a/how-do-the-rules-on-audio-recording-change-under-the-gdpr
- iGlobal Law — Recording and Transcribing Internal Meetings (global employer guidance): https://igloballaw.com/news-and-events/employment-law/global-recording-and-transcribing-internal-meetings-practical-global-guidance-for-employers/
- Alibaba product insights — Fixing LLM hallucination in note-taking tools (false attribution/temporal smoothing/consensus fabrication/topic inflation): https://www.alibaba.com/product-insights/why-is-my-ai-meeting-summary-missing-action-items-fixing-llm-hallucination-in-note-taking-tools.html
- Harvard Misinformation Review — Conceptual framework for AI hallucinations: https://misinforeview.hks.harvard.edu/article/new-sources-of-inaccuracy-a-conceptual-framework-for-studying-ai-hallucinations/
- Electron issue #47490 — desktopCapturer loopback audio via ScreenCaptureKit: https://github.com/electron/electron/issues/47490
- Recall.ai — How to get access to system audio on macOS (Core Audio taps, macOS 14.2+): https://www.recall.ai/blog/how-to-access-to-system-audio
- Apple — Requesting Authorization for Media Capture on macOS: https://developer.apple.com/documentation/bundleresources/information_property_list/protected_resources/requesting_authorization_for_media_capture_on_macos
- DEV — Fixing macOS Microphone & Screen Recording permission failures (TCC quarantine silent-denial, tccutil reset): https://dev.to/am124/im-account-manager-on-macos-fixing-microphone-screen-recording-permission-failures-bld
- AssemblyAI — What is speaker diarization (DER, overlapping speech, cross-talk): https://www.assemblyai.com/blog/what-is-speaker-diarization-and-how-does-it-work
- Recall.ai — Speaker diarization and transcripts with labels: https://www.recall.ai/blog/speaker-diarization
- Atlan — LLM Context Window Limitations: https://atlan.com/know/llm-context-window-limitations/
- Redis — Context Window Overflow / LLM chunking: https://redis.io/blog/context-window-overflow/
- AIveda — Chunking Strategy for LLM Applications (hierarchical/semantic chunking): https://aiveda.io/blog/chunking-strategy-for-llm-application/

---
*Pitfalls research for: macOS AI meeting-assistant desktop overlay (MeetingAssist)*
*Researched: 2026-06-25*
