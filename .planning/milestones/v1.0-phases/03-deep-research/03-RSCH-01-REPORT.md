# RSCH-01: Persona, Positioning & Monetization Report

**Phase:** 3 — Deep Research
**Requirement:** RSCH-01
**Status:** Complete
**Date:** 2026-06-25

---

## Executive Summary

This report synthesizes Phase 3 research findings for RSCH-01, resolving three open TBDs in `PROJECT.md`: Customer (persona), Revenue Model, and Success Metric. All data is sourced from `03-RESEARCH.md §RSCH-01 Findings`. Citations are marked [CITED] (externally verified) or [ASSUMED] (synthesized from competitive data).

---

## Primary Persona

### Primary: Independent Knowledge Workers

The primary MeetingAssist persona is **independent knowledge workers and small teams** — a category that spans:

- **Product Managers** — back-to-back meetings, action items across multiple teams, need accurate records for follow-through
- **Founders & Executives** — high-stakes conversations, no dedicated admin support, every decision needs a reliable paper trail
- **Consultants & Advisors** — client-facing meetings where notes become deliverables; accuracy and professional presentation matter
- **Managers (people leads)** — 1:1s, team syncs, performance conversations; attribution of who said what is critical
- **Privacy-conscious professionals** — have either turned down or would prefer to avoid cloud-recording bots for legal, reputational, or ethical reasons

**Behavioral signature:** Back-to-back meeting schedules; value accurate records over real-time collaboration; blocked by cloud-only or bot-visible tools; macOS users; prefer privacy-forward tooling without sacrificing quality.

[ASSUMED — inferred from competitive positioning data in §RSCH-01]

### Secondary: Remote & Hybrid Teams

The secondary persona is **remote and hybrid teams** that need consistent meeting artifacts across heterogeneous meeting environments (Zoom, Google Meet, Microsoft Teams, in-person). They want:

- Consistent artifact quality regardless of meeting platform
- No bot-visible indicator that creates social friction
- Local storage to satisfy internal data governance policies

---

## Competitive Landscape

Six tools form the primary competitive field. Source data from [CITED: useluminix.com/reports] and [CITED: granola.ai/blog].

| Tool | Approach | Pricing (Business) | Privacy Posture | Key Strength | Weakness |
|------|----------|--------------------|-----------------|--------------|----------|
| **Granola** | Bot-free, macOS-native, local audio capture, SOC 2 Type 2 (Jul 2025), $43M raised May 2025 | $14/user/mo | Best-in-class: audio never uploaded; cloud transcript only; no-training by contract | Hybrid note-taking UX, no visible bot | Mac-only; no cross-meeting memory; 30-day free history cap |
| **Fathom** | Bot-optional (April 2026 update added silent capture mode); unlimited free tier | $15/user/mo | Flexible: 3 capture modes (bot-visible, audio-only, silent) | Unlimited free tier; 5.0 G2 rating (6k+ reviews); 30-sec summaries | Less CRM depth than Fireflies |
| **Fireflies.ai** | "Fred" bot joins calls; CRM-first; 100+ integrations | $19/user/mo | Standard bot model; **BIPA lawsuit filed Dec 2025** for voiceprint collection | Sales team depth; 100+ languages; AskFred cross-meeting search | Visible bot causes social friction; "like removing a deer tick" to cancel |
| **Otter.ai** | OtterPilot bot; real-time live captions | ~$20/user/mo | Standard bot; **federal class-action filed Aug 2025** for unauthorized recording | Real-time collaborative transcription | Litigation risk; bot persistence post-cancellation |
| **Notion AI** | Integrated meeting notes (requires Business plan since Aug 2025) | $20/user/mo (Business required) | Google/Microsoft cloud storage | Seamless for existing Notion users | Requires Business plan upgrade; not standalone |
| **Meetily** | Open-source; 100% local transcription; no bot; offline | Free (individuals) | Maximum: everything local; BYOK | Privacy-maximum; zero cloud dependencies | Less polished UX; no team features |

### Market Size and Dynamics

[CITED: useluminix.com/reports]

- AI meeting assistant market: **USD 3.67 billion in 2024**, projected at **34.7% CAGR through 2034**
- **46–50%** of workers cite privacy/security as their top reason to avoid AI meeting tools
- **84%** of users alter speech when AI is visibly present in the room
- Real-world transcription accuracy in noisy, multi-accent meetings: **~62%** (versus 95%+ marketing claims)
- Speaker attribution errors: **11–13%** cause misattributed action items — the "trustworthy record" failure mode

---

## Positioning

### The Positioning Gap

[ASSUMED — synthesis from competitive data, not a primary source]

The market has a clear underserved segment: **privacy-forward knowledge workers who want local-first capture without a visible bot, on macOS, with production-grade artifact quality and live in-meeting intelligence**. The closest competitor is Granola, but it has meaningful gaps:

- Cloud-stores transcripts (not fully local — only audio stays local)
- No cross-meeting memory or semantic search
- No live assistant or break assist capability
- No encrypted local storage (our DEC-02 posture)
- 30-day free history cap creates friction

### MeetingAssist Differentiation Story

**Five pillars separate MeetingAssist from every current competitor:**

1. **Local-first encrypted storage** — All transcripts and artifacts stored in a SQLCipher-encrypted DB on the user's machine. Not even the audio is uploaded (after transcription). No cloud breach can expose meeting content.
2. **No visible bot** — No calendar invite bot, no Zoom participant that announces itself, no social friction. Meeting participants remain unaware of automated capture beyond what the user discloses.
3. **Dual-channel capture** — Separate mic and system audio tracks enables proper "You" vs. "Others" attribution. Competitors with bot-free approaches (Granola) only capture audio from the meeting platform; MeetingAssist captures both sides independently.
4. **Live in-meeting intelligence** — Real-time chat assistant triggered by hotkey or keyword during the meeting; break assist summarizes what was missed. No competitor offers this combination with a fully bot-free approach.
5. **Production-grade artifact extraction** — Minutes of meeting, key points, summary, action items, dates, and schedules as structured, ready-to-act outputs — not free-form note dumps.

### Key Data Points Supporting the Positioning

- 46–50% of workers cite privacy/security as their top reason to avoid meeting tools → MeetingAssist's local-first encryption directly addresses the #1 adoption barrier [CITED]
- 84% alter speech when AI is visibly present → bot-free approach removes behavioral change [CITED]
- Granola raised $43M (May 2025) on a macOS-native, bot-free positioning → validates the market exists and is fundable [CITED]
- Otter and Fireflies litigation (2025) → disclosed-consent-first posture (DEC-01) is legally safer and differentiating

---

## Monetization Model

### Recommended Hypothesis

[CITED: useluminix.com/reports] [CITED: granola.ai/blog/meeting-notes-tool-pricing-benchmarks]

**Pricing tier structure for v1:**

| Tier | Price | Features | Duration |
|------|-------|----------|----------|
| Free Trial | $0 | Full feature access — no minute caps | 14–30 days |
| Pro | $12–15/user/month | Unlimited meetings; full artifact suite; all features | Ongoing |
| Business | — | Not in v1 scope — single-user product at launch | — |

**Annual discount:** ~40% (industry standard; Fathom, Granola pattern)

### Rationale

1. **Trial-first converts better than permanent free tiers in 2025–2026.** [CITED] The market data shows reverse trials (full-featured time-limited) outperform freemium in conversion. Granola's model (30-day history cap as upgrade trigger) validates an "aha moment after first use" approach.

2. **No minute caps.** Usage caps are the #1 user frustration point across all competitors. [CITED] MeetingAssist's Pro tier has no minute limits — this is a direct response to a documented pain point.

3. **Price point $12–15.** Positioned below Fireflies ($19) and Otter (~$20), at Granola ($14) and Fathom ($15) parity, and above the implicit "amateur" bracket. This signals professional quality without enterprise pricing.

4. **No business tier for v1.** MeetingAssist is a single-user product at launch. Business-tier pricing, team management, and billing are not in scope until after v1 proves the core value and user acquisition model.

---

## PROJECT.md TBD Resolutions

These three TBDs from `PROJECT.md` are resolved by this report:

### Customer

**Resolved definition:**

> Independent knowledge workers and small teams — PMs, founders, consultants, managers with back-to-back meetings. Privacy-conscious macOS users who are blocked by cloud-recording bots, want a local-first trustworthy record without taking manual notes, and need ready-to-act artifacts (not raw transcripts).
>
> **Secondary:** Remote/hybrid teams needing consistent meeting artifacts across Zoom, Meet, Teams, and in-person environments.

### Revenue Model

**Resolved definition:**

> Monthly/annual subscription. Free trial first (14–30 days, full features, no minute cap). Pro tier at $12–15/user/month, unlimited meetings, full artifact suite. Annual subscription at ~40% discount. No business tier for v1 (single-user product). No usage caps (minute limits are the primary user frustration point — avoided by design).

### Success Metric (hypothesis for PRD)

**Resolved definition (requires PRD validation plan):**

> - **Primary:** Trial-to-Pro conversion rate — the clearest signal that the product delivered enough value during the trial to justify payment.
> - **Secondary:** MRR growth — validates the subscription hypothesis.
>
> **Important caveat:** These are *hypotheses* that require user research validation during the PRD phase. The PRD (Phase 5) should recommend a measurement plan — specifically: what data to collect during the trial period, how to instrument conversion events, and what conversion rate constitutes "product-market fit" at this price point. "Meetings fully captured + artifacts the user trusts enough not to re-check" (from PROJECT.md) is the qualitative version of this metric; the PRD should operationalize it.

---

## Data Quality Notes

| Claim | Source Quality |
|-------|----------------|
| Competitor pricing and feature data | [CITED] — verified against competitor websites and aggregated reports |
| Market size ($3.67B, 34.7% CAGR) | [CITED] — useluminix.com/reports (third-party research; treat as directional) |
| 46–50% privacy concern statistic | [CITED] — same source |
| 84% speech alteration when AI visible | [CITED] — same source |
| Positioning gap narrative | [ASSUMED] — synthesized from competitive data; needs user research to validate |
| Monetization hypothesis ($12–15/mo) | [CITED price benchmarks] + [ASSUMED fit for MeetingAssist] — requires user willingness-to-pay validation |
| Trial conversion superiority claim | [CITED: 2025–2026 market trend reports] |
