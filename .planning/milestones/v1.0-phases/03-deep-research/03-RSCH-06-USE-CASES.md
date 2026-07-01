# RSCH-06: Use-Case & Feature Discovery Report

**Phase:** 3 — Deep Research
**Requirement:** RSCH-06
**Status:** Complete
**Date:** 2026-06-25

---

## Overview

RSCH-06 uses two lenses to discover use cases and features for MeetingAssist beyond the starter list in PROJECT.md:

1. **Competitive research lens** — What features do other tools support that our starter list misses? Where are the gaps vs. the competitive field?
2. **Meeting-type discovery lens** — What artifact and format differences do distinct meeting types require? Does a standup need different outputs than a sales call?

This is fully open discovery per D-13 — no pre-specified use cases to validate. The findings feed **PRD-01 (MVP boundary decision)** in Phase 5.

---

## Meeting Type Taxonomy

Nine distinct meeting types, their primary artifact needs, and key differentiators for MeetingAssist.

[CITED: peoplemanagingpeople.com/tools/best-ai-meeting-assistants] [ASSUMED — artifact format mapping]

| Meeting Type | Primary Artifact Need | Secondary Artifact | Key Differentiator |
|-------------|----------------------|-------------------|-------------------|
| **Standup / Sync** | Who said what they'd do (blockers, progress) | Yesterday/today/blockers format | Brevity; structured by speaker; action items by owner |
| **1:1 (Manager-Report)** | Action items + follow-ups + commitments | Private notes | Attribution matters (You vs Them); sensitive content |
| **Design / Tech Review** | Decisions made + rationale + open questions | Action items (who investigates what) | Decision capture is primary; rationale is as important as the decision |
| **Sales Call / Demo** | Objections, commitments, next steps | Internal recap for product/marketing | Quote extraction from prospect; signals for CRM |
| **Client / Stakeholder Briefing** | Key messages delivered + commitments | Follow-up email draft | Professional tone; no jargon; client-facing artifacts |
| **All-hands / Town Hall** | Key announcements + Q&A highlights | Action items by team | High speaker count (>8); summary-heavy; low attribution need |
| **Interview** | Questions asked + candidate responses + assessment | Comparison across candidates | Audio quality critical; multi-speaker; sensitive content |
| **Training / Workshop** | Key concepts + exercises + homework | Follow-up materials | Long-form; content-heavy; reference artifact after session |
| **Retrospective** | What went well / poorly + action items | Trend comparison | Structured format (start/stop/continue); recurring meeting pattern |

### Implications for PRD-01

- **Artifact templates per meeting type** are a clear differentiator — the taxonomy shows that a standup MOM looks fundamentally different from a sales call recap. Meeting-type-specific templates give the user a structured, professional output without manual reformatting.
- **All-hands meetings** (>8 speakers) are the exception where diarization attribution matters less — the primary artifact is a broadcast summary, not a per-speaker action item list. This is a use case where the 8-speaker cap (RSCH-02) gracefully degrades (multiple unlabeled speakers contribute to a summary rather than attributed action items).
- **Interview and 1:1 content is sensitive** — the "private notes" secondary artifact implies per-meeting access controls or at least a "sensitive meeting" flag for the delete/export UX.

---

## Competitive Feature Gap Analysis

[CITED: get-alfred.ai/blog/best-ai-meeting-notetakers] [CITED: useluminix.com/reports]

| Feature | Competitive Standard | MeetingAssist v1 Status | Note |
|---------|---------------------|------------------------|------|
| Real-time transcription | Table stakes (all tools) | ✅ Yes — core | |
| Meeting summary | Table stakes (all tools) | ✅ Yes — core | |
| Action item extraction | Table stakes (all tools) | ✅ Yes — core | |
| Speaker attribution | Table stakes (all tools) | ✅ Yes — Speaker 1/2/3 in v1 | Named attribution is v2 (D-10) |
| Search past meetings | Table stakes (bot-based tools) | ✅ Cross-meeting via sqlite-vec | sqlite-vec infrastructure designed in RSCH-05 |
| Calendar integration / .ics export | Table stakes | ✅ Yes — .ics baseline in v1 | |
| Meeting-type-specific templates | Differentiator (Granola, Fireflies) | 🔶 v1 candidate | PRD-01 MVP boundary decision |
| Cross-meeting search / Q&A | Differentiator (Fireflies AskFred) | 🔶 v1 candidate via sqlite-vec | sqlite-vec makes this feasible in v1 |
| Live in-meeting assistant | **MeetingAssist unique** vs. all bot-free tools | ✅ Yes — core differentiator | Competitors with bots can't offer this cleanly |
| Break assist | **MeetingAssist unique** | ✅ Yes — core differentiator | No competitor offers this |
| Vision / screenshot analysis | Rare (from DNA reference) | ✅ Yes — inherited from DNA | Multimodal round-trip; low marginal cost |
| CRM integration (HubSpot, Salesforce) | Table stakes for sales tools | 🚫 v2 (per D-14) | |
| Slack / Notion export | Standard integration | 🚫 v2 (per D-14) | |
| Named speaker attribution | Differentiator (Fireflies Jamie) | 🚫 v2 (per D-10) | v1 label foundation makes v2 straightforward |
| Cross-platform (Windows, Linux) | Most tools | 🚫 macOS-first for v1 | |
| Multi-language support | Fireflies leads (100+ languages) | ✅ Deepgram 80+ via Nova-3 | No extra development work needed |
| Team collaboration | Most business tools | 🚫 Single-user v1 | v2 |
| On-device / offline mode | Meetily (100% local) | 🚫 v2 deferred (DEC-02 D-09) | SQLCipher persistence layer is compatible |

### v1 Confidence Level

**Confirmed for v1 (no ambiguity):**
- Real-time transcription, summary, action items, speaker attribution (labels), .ics export, live assistant, break assist, vision, multi-language via Deepgram

**Strong v1 candidates (PRD-01 decision):**
- Meeting-type-specific templates — strong differentiator; low implementation complexity once the LLM prompt layer is designed
- Cross-meeting search / Q&A — sqlite-vec infrastructure designed in RSCH-05; feasibility validated at design level

**Explicitly v2 (not in PRD-01 scope):**
- All integrations (Slack, Notion, CRM)
- Named speaker attribution
- Team collaboration
- On-device / offline mode

---

## MeetingAssist's Unique Differentiators

Two features that no competitor currently offers with a fully bot-free, local-first approach:

### 1. Live In-Meeting Assistant

Real-time coaching and Q&A during the meeting. Triggered by hotkey or keyword, the assistant has access to the full rolling transcript context. Use cases:
- "What did she just say?" (instant recap)
- "What's the background on [topic] they just mentioned?" (on-demand research)
- "Can you summarize what we've agreed on so far?" (mid-meeting check-in)
- "What follow-up questions should I ask next?" (coaching)

**Why this is unique:** Bot-based tools (Fireflies, Otter) join as separate participants — they can't provide *private* assistance to one participant in real time without other participants seeing it. MeetingAssist runs as a stealth overlay visible only to the user.

### 2. Break Assist

When the user returns from a break during a meeting, Break Assist summarizes everything said during their absence. This is:
- Activated by hotkey/button ("I'm back")
- Summarizes the period from "break start" timestamp to "break end" (now)
- Delivered as an immediate, brief recap rather than a full summary

**Why this is unique:** No competitor has this feature. It requires real-time transcript access with a timestamp boundary — something only a client-side, local-first tool with continuous capture can do cleanly.

---

## Notable Market Signals for PRD

Five signals that directly inform PRD-01 scope and positioning decisions:

[CITED: useluminix.com/reports] [CITED: granola.ai/blog]

1. **Bot-free is a differentiator becoming table stakes.** Fathom added silent capture in April 2026 in response to user demand. Users strongly prefer no-bot where privacy or social dynamics matter. MeetingAssist's default posture (no bot) will become an expectation, not just a differentiator, as the market matures.

2. **Otter.ai federal class-action (Aug 2025) + Fireflies BIPA lawsuit (Dec 2025).** Both cases cite unauthorized recording practices. MeetingAssist's disclosed-consent-first posture (DEC-01) is both ethically correct and legally safer. The PRD's consent and notification UX should cite these cases as user-protection rationale.

3. **Granola's $43M raise (May 2025)** at a macOS-native, bot-free positioning validates significant investor confidence in exactly MeetingAssist's target market segment. The space is worth building in; the raise validates the differentiation story.

4. **Privacy is the top adoption blocker — 46–50% of workers cite it as their primary reason for not using meeting tools.** MeetingAssist's encrypted local-first storage (DEC-02) directly addresses the single largest adoption barrier in the market. This should be the #1 PRD messaging pillar.

5. **Speaker attribution errors (11–13%) are a major quality pain point.** Meeting tools that get attribution wrong undermine the "trustworthy record" core value. RSCH-02's Deepgram Nova-3 selection (61.5% meeting-domain accuracy improvement) directly addresses this — the PRD should set a quality bar for attribution accuracy and reference RSCH-02 as the technical justification.

---

## V2 Integrations (Not in V1 Scope)

Per D-14, these are surfaced as v2 candidates for PRD awareness. They are not in v1 scope but should be documented so the v1 architecture doesn't inadvertently close the door on them.

| Integration | Use Case | V2 Rationale |
|-------------|----------|-------------|
| **Slack** | Post meeting summary to a channel after meeting ends | Requires OAuth flow; team feature; not in single-user v1 scope |
| **Notion** | Create a meeting page from the MOM automatically | Requires Notion API integration; v2 alongside team features |
| **HubSpot / Salesforce** | CRM sync after sales calls (objections, commitments) | Complex field mapping; requires CRM-specific templates in v1 first |
| **Google Calendar / Outlook** | Direct event creation with attendees (beyond .ics) | .ics covers v1; direct calendar sync requires OAuth and calendar API |
| **Zapier / Make** | Workflow automation (trigger → send summary, create tasks, etc.) | Webhook output; useful but not core to the single-user v1 product |

**Architecture note for PRD:** Keeping .ics export as the v1 calendar integration (rather than direct calendar APIs) is a deliberate simplification. .ics works with every calendar without OAuth. When v2 adds direct calendar integration, it layers on top of .ics rather than replacing it.

---

## Recommendations for PRD-01 (MVP Boundary)

Key inputs to the PRD's feature scoping decision:

### Strong v1 Candidates (Include if Implementation Complexity is Acceptable)

1. **Meeting-type-specific templates** — High differentiation value. Competitive standard (Granola, Fireflies have this). Implementation: a template selector in the meeting setup flow + type-specific LLM prompt variants. Relatively low implementation complexity once the LLM layer is designed.

2. **Cross-meeting Q&A search** — Strong differentiator vs. Granola (which has no cross-meeting memory). The sqlite-vec infrastructure is designed (RSCH-05). Implementation: embedding pipeline + KNN retrieval + a simple Q&A interface. Moderate implementation complexity.

### Confirmed v1 (Non-Negotiable Core)

Transcription, summary, MOM, action items, key points, .ics export, live assistant, break assist, speaker labels (1/2/3), multi-language via Deepgram.

### Explicitly Exclude from v1 PRD Scope

All items marked 🚫 v2 in the competitive feature gap table above. Documenting these exclusions explicitly in the PRD prevents scope creep during the build milestone.
