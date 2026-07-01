# Phase 4: AI Grounding & Context Spec (AI-SPEC) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-26
**Phase:** 4-AI Grounding & Context Spec (AI-SPEC)
**Areas discussed:** Citation format & granularity, Epoch strategy for long meetings, Real-time hot path scope

---

## Citation Format & Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Exact quote + timestamp | Verbatim sentence with timestamp inline in artifact | |
| Transcript range link | Clickable [12:30–12:36] reference to jump to transcript viewer | |
| Hybrid — inline quote + expand-to-context link | Short inline quote (~10 words) + "Verify" expand link to full context | ✓ |

**User's choice:** Hybrid — inline quote + expand-to-context link
**Notes:** Balances artifact readability with verifiability.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Always visible (default on) | Every artifact item shows citation inline at all times | |
| Hidden behind 'Verify' toggle (default off) | Clean artifact by default; citation revealed on demand | ✓ |
| You decide | Leave to Claude's judgment | |

**User's choice:** Hidden behind 'Verify' toggle (default off)
**Notes:** Clean reading experience by default; trust signal always reachable in one click.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Block it — no quote, no extraction | Strict: inferred items not surfaced at all | |
| Flag with low-confidence marker | Surface item with 'Inferred — no direct quote' label and lower visual weight | ✓ |
| Best-effort — show closest supporting passage | Closest segment shown with 'closest match' label | |

**User's choice:** Flag with low-confidence marker
**Notes:** Surface inferred items but make uncertainty explicit. Don't silently suppress signal.

---

## Epoch Strategy for Long Meetings

| Option | Description | Selected |
|--------|-------------|----------|
| Token-threshold (rolling window fill) | Epoch fires when token budget approaches ceiling | ✓ |
| Time-based (fixed cadence, e.g., every 30 min) | Epoch fires on a schedule regardless of token usage | |
| Hybrid — token-threshold with minimum time floor | Epochs fire on token fill but not sooner than N minutes | |

**User's choice:** Token-threshold (rolling window fill)
**Notes:** Precise and cost-predictable. Epoch fires when the rolling window approaches the token ceiling — no estimated time figure; actual trigger point depends on speech density and model context limits.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Decisions + action items only (minimal) | Compact epoch summary | |
| Full structured summary (decisions + action items + key points + speaker attribution) | Mirrors final artifact structure | ✓ |
| You decide | Leave to researcher's judgment | |

**User's choice:** Full structured summary
**Notes:** Richer context for the live assistant; consistent with what the product already extracts.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Recursive epoch summarization (summaries of summaries) | Meta-summaries when epoch summaries overflow | |
| sqlite-vec RAG over epoch summaries | Epoch summaries embedded + indexed; live assistant retrieves top-N | ✓ |
| Hard cap — declare max supported meeting length | Supported ceiling (e.g., 4 hours) declared for v1 | |

**User's choice:** sqlite-vec RAG over epoch summaries
**Notes:** Consistent with RSCH-05 data model. User confirmed keeping RAG in the spec even though it rarely fires.

**Key freeform clarification from user:** The live assistant is **on-demand only** — activated by hotkey or trigger keyword, no passive LLM loop during the meeting. Architecture adjusted accordingly: passive path = transcript accumulation + 5-min summary cards only. LLM fires on live assistant trigger and at end-of-meeting batch.

**Second key clarification:** The live summary board (time-triggered) and the context epoch system (token-threshold-triggered) are **intentionally separate**. Merging them would charge embedding costs on data already accessible in the rolling window. User explicitly called this out and the architecture reflects it.

---

## Real-time Hot Path Scope

**Key design introduced by user:** A **live cumulative summary board** — a stacked card feed in the overlay where each card covers one fixed time interval (default 5 minutes) and summarizes only that interval's transcript. Cards are labeled with their time range (e.g., "10:00–10:05") and stack downward as the meeting progresses. Architecturally separate from the context epoch system.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Rolling window only (raw transcript) | Live assistant reads full transcript from rolling window | |
| Rolling window + 5-min summary cards | Both raw transcript and structured card history as context | ✓ |
| You decide | Leave to Claude's judgment | |

**User's choice:** Rolling window + 5-min summary cards
**Notes:** The summary cards provide structured signal on top of the raw transcript, especially useful for "what was decided about X?" type questions.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Manual — user presses 'I'm back' button / hotkey | Explicit trigger; predictable | ✓ |
| Automatic — triggered by mic activity resuming after silence | Smart but risks false positives | |
| You decide | Leave to Claude's judgment | |

**User's choice:** Manual — 'I'm back' button / hotkey
**Notes:** Avoids false triggers from muting or background noise.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Interval cards only | Zero extra LLM cost — summaries already exist | |
| Single 'while you were away' digest | One LLM call for a clean consolidated summary | |
| Both — interval cards + digest at top | Digest as TL;DR; cards for detail | ✓ |

**User's choice:** Both — interval cards + "While you were away" digest at the top
**Notes:** The digest gives the quick read; the cards give the detail. One extra LLM call on return.

---

## Claude's Discretion

- **GRND-03 eval harness design** — corpus composition, specific faithfulness metric, and passing threshold left to researcher's judgment, informed by the faithfulness contract decisions
- **5-min summary card content structure** — narrative vs. structured bullets vs. hybrid left to researcher/planner; should be consistent with end-of-meeting artifact format
- **Token ceiling exact value** — ~800K of 1M is a conservative default; researcher can refine based on provider-specific limits
- **Embedding model for epoch RAG** — not specified; OpenAI text-embedding-3-small is a reasonable default; local Ollama for privacy mode

## Deferred Ideas

- Configurable summary interval (3/5/10 min user setting) — 5 min fixed for v1
- Named speaker attribution in citations ("Alice said…") — deferred to v2 per Phase 3 decision D-10
- Automatic break detection via mic silence — deferred to v2; manual trigger is v1
- Real-recording eval corpus for faithfulness testing — v2 iteration; synthetic adversarial transcripts are the v1 baseline
