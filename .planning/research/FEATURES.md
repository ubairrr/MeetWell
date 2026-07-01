# Feature Research

**Domain:** AI meeting assistant — v3.0 "Advanced Assistant Features" milestone (named speaker attribution, live grounded chat, cross-meeting semantic search, meeting-type templates)
**Researched:** 2026-07-01
**Confidence:** MEDIUM (web-search corroborated across 3-5 independent sources per topic; no official API/pricing-doc access, no direct product trials — see Gaps)

## Feature Landscape

Researched against the current AI meeting-assistant category: Otter.ai, Fireflies.ai (AskFred), Fathom, Grain, Granola, tl;dv, Fellow, Read AI, plus general RAG/chat-with-docs UX patterns. MeetingAssist already has the hard infrastructure most competitors are still building on top of (SQLCipher + `sqlite-vec`, two-stage citation-validated extraction, `ContextEngine`/`EpochCompressor`) — the gap is specifically these 4 UI/product layers, not the underlying data plumbing.

---

### Feature 1 — Named Speaker Attribution

**What it replaces:** Generic "Speaker 1 / Speaker 2 / Speaker 3" diarization labels from Deepgram Nova-3.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Inline rename of a speaker label in the transcript view | Otter and Fireflies both ship this as the baseline UX — click a speaker tag, type a name, it updates | LOW | Update `transcript_segments` (or a `speaker_labels` join table) by `speaker_index`, not by rewriting every segment row's text |
| Rename applies to all segments for that speaker within the meeting | Users expect one rename action to relabel every occurrence, not per-line editing | LOW | Straightforward `UPDATE ... WHERE speaker_index = ?` scoped to `meeting_id` |
| Renamed labels flow into all downstream artifacts (MOM, summary, action items, live chat citations) | If MOM still says "Speaker 2 will follow up" after the user renamed them to "Bob," the feature feels broken | MEDIUM | Requires the two-stage extraction and live chat citation rendering to resolve speaker names at *read* time (view-layer join), not bake stale names into stored artifact text |
| Persisted per-meeting at minimum | Otter/Fireflies both persist rename within a single recording without extra configuration | LOW | This is the safe v3.0 scope — do NOT reach for cross-meeting identity by default (see Anti-Features) |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|--------------------|------------|-------|
| Optional "remember this speaker for future meetings" (explicit opt-in, named-profile based, no voiceprint) | Saves repetitive relabeling for recurring 1:1s/standups without a biometric database | MEDIUM | Store a user-created `speaker_profile` (name only) that the user manually re-applies each meeting via a picker — still zero auto-matching, so it stays consent-clean; do not claim it "recognizes" the voice |
| Bulk relabel across multiple transcript segments via a single "merge speakers" action | Diarization sometimes splits one real speaker into two indices — Fireflies' one-click merge addresses this directly | LOW-MEDIUM | Needed if diarization quality issues surface in practice; not required for v3.0 launch unless testing shows split-speaker artifacts are common |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|----------------|------------------|-------------|
| Automatic voiceprint-based speaker identification (auto-detect "this is Alice" from voice biometrics, matched silently across meetings) | Feels magical; competitors like Microsoft Teams Intelligent Speaker do this | Storing a voiceprint is biometric data — creates consent/retention/legal exposure disproportionate to the feature's value; accuracy also degrades once mic/room acoustics change between sessions, so the "magic" under-delivers anyway; **directly violates this product's proposed-with-confirm ethos** (DEC-01/DEC-02 precedent: no silent inference presented as fact) | Manual relabel (table stakes) + optional named-profile re-apply picker (differentiator), both requiring explicit user action every time an identity is attached to a voice |
| Calendar-integration auto-attribution (infer speaker names from meeting invitee list + join order) | Seems like free accuracy — "we already have the attendee list" | Join order ≠ speaker order reliably (people join silently, mute, multiple people per device); presenting a guessed name as fact without user confirmation is exactly the kind of unconfirmed inference this product's artifact contract forbids | Surface invitee list as *suggested* rename options in the rename UI (user still clicks to confirm) — this is fine; auto-applying it without confirmation is not |

**Complexity overall: LOW.** This is the cheapest of the four features — no new AI dependency, mostly a DB schema tweak + UI affordance + read-time name resolution in artifact rendering.

---

### Feature 2 — Live Assistant Interactive Chat

**What it is:** In-overlay chat during a live meeting, answering questions grounded in (a) the current meeting's transcript/rolling context and (b) relevant past meetings.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Natural-language Q&A grounded in the current meeting only ("what did we decide about X just now?") | Otter AI Chat and Fireflies AskFred both offer this at minimum; category consensus is transcription is commoditized, post-meeting/in-meeting chat is where tools now differentiate | MEDIUM | Reuses `ContextEngine`'s rolling context window as the retrieval source — no new infra, just a chat UI + prompt over existing context |
| Response latency low enough to not disrupt the live meeting (seconds, not tens of seconds) | A live chat that takes 20s to answer breaks the "assistant is watching along with you" illusion | MEDIUM | Gemini 2.5 Flash was chosen specifically for latency; keep prompt small (targeted context slice, not full transcript) to hold response time down |
| Answers cite/reference the transcript they're grounded in | Same faithfulness contract as MOM/artifacts — this product's whole value prop is trustworthiness | MEDIUM | Reuse the two-stage citation-validation pattern already built for artifacts: extract quote(s) first, then answer from quotes only; never answer from raw transcript directly |
| Chat coexists with (does not replace) the LiveSummaryBoard and break-assist digest | Users expect these to be complementary views of the same underlying context, not competing UIs | LOW | Pure UI layering — no data-model conflict since both read the same `ContextEngine`/`transcript_segments` |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|--------------------|------------|-------|
| Cross-meeting-grounded answers ("what did we decide about X last time we talked about this?") | This is explicitly the feature that "none of the other three [Otter/Fathom/Grain] meaningfully replicate" per one 2026 comparison — Fireflies AskFred is the only cited example of true cross-meeting chat | HIGH | **Hard dependency on Feature 3 (cross-meeting semantic search)** — the chat cannot answer cross-meeting questions without the retrieval infra existing first. This is the single most important dependency ordering finding in this research. |
| Visible source/provenance display in chat answers (e.g. "from March 4 meeting with Bob," expandable to the quote) | Standard RAG-chat UX (ChatGPT DeepResearch side panel, Bing nested references) — increases trust, lets user verify instead of blindly trusting | MEDIUM | Directly reuses `CitationValidator` output; render citations as a collapsible reference list under each chat answer rather than inline to avoid cluttering a narrow overlay panel |
| "Summarize the last N minutes" as a first-class quick-action, not just free-text | Reduces friction vs. typing — likely one of the most common live-chat use cases per this milestone's own example prompt | LOW | Can be served from the same rolling context the LiveSummaryBoard already segments into 5-minute cards — arguably reuses `SummaryCardTimer` output as a shortcut rather than a fresh compression pass |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|----------------|------------------|-------------|
| Chat answers auto-executing actions (e.g. user asks "schedule a follow-up" and the assistant silently creates a calendar event) | Feels like a natural "agentic" next step for a live assistant | Violates the absolute proposed-with-confirm contract already established for artifacts (04-AI-SPEC) — an auto-write from *chat* would be a worse violation than from artifacts because it happens mid-meeting with no review step at all | Chat can *propose* an action item / draft event, routed into the same `status: 'proposed'` artifact review flow as everything else — never a direct side-effect from a chat turn |
| Full-transcript-in-context-window chat (stuff the entire meeting-to-date transcript into every chat prompt for "maximum accuracy") | Simplicity — no retrieval logic needed | Defeats the purpose of `ContextEngine`/`EpochCompressor`; costs scale badly on long meetings, latency degrades, and it's exactly the anti-pattern the existing architecture was built to avoid (compression exists for a reason) | Always route through the existing rolling-context abstraction; chat is a consumer of `ContextEngine`, not a bypass of it |
| Free-roaming chat with no scope guardrails (answers questions unrelated to any meeting content, general LLM chit-chat) | Users may try it as a general assistant since it's already open | Scope creep away from the core value prop ("trustworthy record of *this meeting*"); also increases hallucination surface with nothing to ground against | Detect ungrounded queries and respond with an explicit "I can only answer questions about your meetings" boundary message |

**Complexity overall: MEDIUM for meeting-local chat, HIGH once cross-meeting grounding is included** — the current-meeting-only version is a relatively contained UI + prompt-reuse task; the cross-meeting version is gated by Feature 3 being built first.

---

### Feature 3 — Cross-Meeting Semantic Search

**What it is:** A dedicated search panel over all past meetings, plus the retrieval backbone that also grounds Feature 2's cross-meeting chat answers.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Keyword/semantic search box returning relevant past meetings/segments, not just meeting titles | Otter is described as "king of searchable archives"; Fireflies markets "cross-meeting AI search" as a headline feature — this is the baseline bar in the category | MEDIUM | `sqlite-vec` infra already exists per PROJECT.md ("infrastructure ready in v1") — this feature activates it rather than building it from scratch |
| Result snippets show the matching quote + which meeting/date/speaker it came from | Users need to judge relevance before opening the full meeting — same provenance principle as chat citations | LOW-MEDIUM | Reuse the same citation-rendering component planned for chat (Feature 2) — one provenance UI, two call sites |
| Search scoped to the current user's own meeting history (no cross-tenant leakage, obviously, but also worth stating since this is a local-first single-user desktop app) | Baseline data-boundary expectation | LOW | Already trivially true given the local encrypted single-user DB design — flag only so it isn't accidentally broken by a future multi-profile feature |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|--------------------|------------|-------|
| Search results usable as one-click grounding context for a follow-up chat question ("ask about this result") | Bridges the dedicated search panel and the live/post-meeting chat into one coherent mental model instead of two disconnected features | MEDIUM | This is the natural integration point between Feature 2 and Feature 3 — worth designing the retrieval API once, with two UI consumers (search panel, chat) |
| Filtering by meeting type, date range, or (once Feature 4 ships) meeting-type template | Power-user refinement once basic search works | LOW-MEDIUM | Defer until basic semantic search ships and meeting-type metadata exists (Feature 4 dependency) |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|----------------|------------------|-------------|
| Over-engineered chunking strategy up front (semantic/hierarchical chunking, agentic re-chunking, etc.) before validating basic retrieval quality | Feels like "doing RAG properly" | Research is explicit: "the hardest RAG failures come from stale, ungoverned source data — not from suboptimal chunk size." Sophisticated chunking adds compute/latency cost and is a classic scope trap for a feature that just needs to work correctly first | Start with a simple, well-understood chunking unit aligned to what already exists — e.g. `transcript_segments` or 5-minute epoch boundaries (already computed by `EpochCompressor`) — and only revisit chunking strategy if retrieval quality testing shows it's the bottleneck |
| Re-embedding the entire meeting history on every schema/model change without a staleness/versioning plan | Convenient to "just re-run it" during dev | Stale or partially-re-embedded indexes are called out as the single biggest source of production RAG failures — silent staleness is worse than no search at all, because it returns confidently wrong results | Version embeddings by model/schema id in the DB row; on model change, treat old embeddings as stale and either backfill deliberately or exclude them from results until backfilled — never silently mix embedding versions in one query |
| Building a generic "search everything" index (transcripts + summaries + action items + chat history) in one pass for v3.0 | Seems efficient to solve once | Expands scope significantly beyond what's needed to unblock Feature 2's chat grounding, and risks conflating `summary_cards` (display artifacts) with source-of-truth transcript data — the exact `EpochCompressor` anti-pattern this codebase already explicitly guards against (reads `transcript_segments` ONLY) | Index `transcript_segments` (the source of truth) for v3.0; defer indexing derived artifacts to a later milestone if there's a proven need |

**Complexity overall: MEDIUM.** The hard infrastructure (`sqlite-vec`, encrypted DB) already exists per PROJECT.md; the work is populating/maintaining the embedding index correctly and building the search UI + retrieval query path — not standing up vector search from zero.

**Critical dependency flag:** Feature 2 (live chat's cross-meeting grounding) depends on Feature 3 existing and working. Build order should place Feature 3's retrieval backbone (even if the dedicated search panel UI ships slightly after) before or alongside Feature 2's cross-meeting grounding — chat cannot cross-meeting-ground against an index that doesn't exist yet.

---

### Feature 4 — Meeting-Type-Specific Artifact Templates

**What it is:** User selects Standup / 1:1 / Planning at session start; MOM/summary output structure differs per type instead of one generic template.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| User picks a meeting type at session start (before or at consent gate) | Every competitor offering this (Fellow, Fireflies skills, Musely presets) makes type selection an explicit up-front choice, not an inferred one | LOW | Natural fit into existing `SessionManager` FSM pre-capture state — add a type field to session init payload |
| Each type maps to a distinct output schema/structure, not just a relabeled generic template | Musely's presets are explicitly contrasted against Fireflies/Otter's "one generic summary format" as the differentiator — a template that's just the same fields with different headings undersells the feature | MEDIUM | Each type = its own Zod schema (Standup: blockers/yesterday/today; 1:1: topics/feedback/action items; Planning: decisions/estimates/next steps) — consistent with this codebase's existing single-source-of-truth Zod schema convention |
| Default/fallback to the existing generic template if no type is selected | Backward compatibility — v2.0's existing single-template behavior must still work | LOW | Straightforward default case in the schema-selection logic |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|--------------------|------------|-------|
| Type-specific extraction *prompts*, not just output schema (e.g. Standup stage-1 quote extraction specifically looks for blocker language, 1:1 extraction specifically looks for feedback/growth language) | A schema swap alone under-delivers if the underlying two-stage extraction still searches generically; matching Fathom's "Customizing AI Summaries" bar requires the whole pipeline, not just the output shape | MEDIUM-HIGH | Must extend the two-stage extraction (Stage 1 quote-finding, Stage 2 structuring) per type — this is real prompt-engineering work per type, not just schema definition, and is the part most likely to need iteration/eval |
| Type-aware live summary cards (5-minute `SummaryCardTimer` cards reflect the session's meeting type too) | Consistency — if MOM is standup-structured but the live board is generic, the product feels inconsistent | MEDIUM | Nice-to-have; can ship after the end-of-meeting artifact templates are validated, since it touches a second pipeline (`SummaryCardTimer`) |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|----------------|------------------|-------------|
| Fully user-customizable/arbitrary templates (let users define their own field structure via free text or a template builder) | Power users always want maximal flexibility | Massively expands scope: needs a template editor UI, arbitrary-schema-to-Zod translation, and per-custom-field extraction prompting — none of which is proven necessary for 3 fixed types; also breaks the "single source of truth Zod schema" convention this codebase relies on for both TS types and LLM structured output | Ship exactly 3 fixed, well-designed types (Standup/1:1/Planning) for v3.0; revisit a template builder only if user demand is validated post-launch |
| One mega-prompt with conditional branches for all meeting types (single Stage-2 prompt with "if standup then... if 1:1 then...") | Seems more maintainable — "one prompt to rule them all" | Explicitly flagged in research as a common mistake — stuffing multiple goals/branches into one AI generation pass degrades output quality vs. staged, single-purpose prompts; also makes eval harder (can't isolate a regression to one meeting type) | One Zod schema + one Stage-2 prompt *per type*, selected by session metadata — consistent with existing per-purpose schema philosophy, and keeps the adversarial eval harness able to test each type independently |
| Auto-detecting meeting type from transcript content instead of user selection | Seems convenient — "why make the user pick?" | Undermines the explicit, disclosed, user-driven session start flow this product already has (consent gate precedent: nothing is inferred silently that changes downstream behavior); also meeting type genuinely can't be reliably inferred before the meeting has enough content to analyze, so it would have to run *after* capture — too late to run type-specific extraction | User selects type at session start (table stakes); optionally allow changing/correcting session type in the same review flow before final artifact generation |

**Complexity overall: MEDIUM-HIGH.** Schema/UI work is low-medium; the real cost is in per-type extraction prompt design and eval coverage for 3 templates instead of 1 — this multiplies the adversarial-eval surface (CGFS/EHR gates) by roughly 3x if each type needs its own faithfulness validation.

---

## Feature Dependencies

```
Feature 3 (Cross-Meeting Semantic Search)
    └──required-by──> Feature 2 (Live Chat — cross-meeting grounding only)
                         Feature 2's meeting-local grounding has NO dependency on Feature 3
                         and can ship independently/first.

Feature 1 (Named Speaker Attribution)
    ──enhances──> Feature 2 (chat answers can cite "Bob said..." instead of "Speaker 2 said...")
    ──enhances──> Feature 3 (search results show real names in result snippets)
    Feature 1 has NO hard dependency on anything — it is the most independent
    of the four and can be built/shipped first with no ordering risk.

Feature 4 (Meeting-Type Templates)
    ──independent-of──> Features 1, 2, 3
    Touches the existing two-stage extraction pipeline and Zod schema layer only.
    ──optionally-enhances──> Feature 3 (search filter by meeting type, deferred differentiator)

Feature 2 and Feature 3 ──share──> Citation/provenance rendering component
    Both need "show me the source quote + meeting + speaker" UI.
    Build once, use in both the chat answer view and the search result view.
```

### Dependency Notes

- **Feature 2 requires Feature 3 for the cross-meeting half of its scope.** This is the single most important sequencing finding: if the roadmap tries to build "live chat grounded in current meeting AND relevant context from past meetings" as one atomic phase without first standing up cross-meeting retrieval, it will either stall on the retrieval problem mid-phase or ship a chat that quietly only answers current-meeting questions. Recommend splitting into (a) meeting-local chat first, (b) cross-meeting search/retrieval backbone, (c) wiring chat to consume that backbone for cross-meeting answers.
- **Feature 1 enhances Feature 2 and Feature 3 but blocks neither.** Speaker names are a display/citation-quality improvement, not a functional prerequisite — chat and search work with "Speaker 1/2/3" labels too, just less legibly. Low-risk to build in parallel with or even after 2/3, though building it first is cheap and improves the perceived quality of every other feature's output.
- **Feature 4 is architecturally isolated.** It touches the two-stage extraction/Zod schema layer, not the chat/search/speaker subsystems. It can be built in parallel with the others with essentially zero integration risk, though it has the highest *internal* complexity (per-type prompt design + eval multiplication).
- **Citation/provenance UI is a shared dependency, not a feature-specific one.** Building it once as a reusable component (consumed by both Feature 2's chat and Feature 3's search results) avoids duplicated, inconsistent provenance UX.

---

## MVP Definition (v3.0 milestone scope)

### Launch With (v3.0)

- [ ] Feature 1: manual speaker relabel, per-meeting scope, propagated to all artifacts/chat/search at read time — cheapest, highest quality-of-life win, no dependencies
- [ ] Feature 3 (retrieval backbone): semantic search over `transcript_segments` via `sqlite-vec`, dedicated search panel with citation snippets — this unblocks Feature 2's cross-meeting half
- [ ] Feature 2 (meeting-local chat first): live chat grounded in current meeting via `ContextEngine`, with citation rendering reusing Feature 3's provenance component
- [ ] Feature 2 (cross-meeting extension): once Feature 3 backbone exists, wire chat to also retrieve/cite past-meeting context
- [ ] Feature 4: 3 fixed meeting-type templates (Standup/1:1/Planning) with dedicated Zod schemas and dedicated Stage-1/Stage-2 extraction prompts per type, selected at session start, default-to-generic fallback preserved

### Add After Validation (v3.x)

- [ ] Feature 1: optional named-profile picker ("remember this speaker") — only if manual relabel friction proves real in practice
- [ ] Feature 1: bulk "merge speakers" action — only if split-speaker diarization artifacts show up in testing
- [ ] Feature 3: filters by meeting type / date range in search panel
- [ ] Feature 4: type-aware live 5-minute summary cards (currently generic `SummaryCardTimer`)

### Future Consideration (v2+ / later milestones, per PROJECT.md's own "Out of Scope"/"Future" sections)

- [ ] Voiceprint-based auto speaker ID — explicitly an anti-feature per this research, not merely deferred
- [ ] Fully custom user-defined artifact templates beyond the 3 fixed types
- [ ] Chat-triggered auto-actions (auto-scheduling, auto-writing external systems) — blocked by the absolute proposed-with-confirm contract, not a roadmap timing question

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Named speaker attribution (manual relabel) | HIGH | LOW | P1 |
| Cross-meeting semantic search (retrieval backbone + panel) | HIGH | MEDIUM | P1 |
| Live chat — meeting-local grounding | HIGH | MEDIUM | P1 |
| Live chat — cross-meeting grounding | HIGH | MEDIUM (given P1 backbone exists) | P1 (sequenced after search backbone) |
| Meeting-type templates (3 fixed types) | MEDIUM-HIGH | MEDIUM-HIGH | P1 |
| Named speaker "remember for future meetings" profile picker | MEDIUM | MEDIUM | P2 |
| Search filters by meeting type/date | LOW-MEDIUM | LOW | P2 |
| Type-aware live summary cards | LOW-MEDIUM | MEDIUM | P3 |
| Custom user-defined templates | LOW (unvalidated) | HIGH | P3 |
| Voiceprint auto speaker ID | N/A | N/A | Rejected (anti-feature) |

**Priority key:**
- P1: Needed to satisfy this milestone's 4 target features as scoped
- P2: Should have, add when the P1 slice is stable
- P3: Nice to have, defer until demand is validated

---

## Competitor Feature Analysis

| Feature | Otter.ai | Fireflies.ai | Fathom / Others | MeetingAssist Approach |
|---------|----------|--------------|------------------|--------------------------|
| Speaker relabel | Manual rename, persists label across matched conversations once "trained" | Manual rename + one-click merge of duplicate labels | Not confirmed in research | Manual per-meeting relabel only (v3.0); no voiceprint persistence — explicit anti-feature |
| Grounded chat | "Otter AI Chat" — individual/team/account scope | "AskFred" — explicitly cross-meeting, months of history | Not confirmed as strong in research | Meeting-local first, then cross-meeting once search backbone exists; citations required (existing `CitationValidator` reused) |
| Cross-meeting search | "King of searchable archives" per comparisons | Cross-meeting AI search marketed as headline feature | Granola/Grain weaker on this axis per research | Built on existing `sqlite-vec` infra; indexes `transcript_segments` only, versioned embeddings to avoid staleness |
| Meeting-type templates | Not confirmed as a distinct feature in research | Dedicated "skills" (Standup Notes AI Skill, etc.) auto-push to Slack/CRM | Fellow: prebuilt agenda templates; Notion AI: structured 1:1 pages; Fathom: "Customizing AI Summaries"; Musely: 4 presets contrasted against "generic" competitors | 3 fixed types (Standup/1:1/Planning), each own Zod schema + own two-stage extraction prompts, not a shared mega-prompt |

---

## Sources

- [Rename a speaker – Otter.ai Help Center](https://help.otter.ai/hc/en-us/articles/21665980053655-Rename-a-speaker)
- [Retag and update a speaker tag – Otter.ai Help Center](https://help.otter.ai/hc/en-us/articles/21666002439575-Retag-and-update-a-speaker-tag)
- [Speaker Identification Overview – Otter.ai Help Center](https://help.otter.ai/hc/en-us/articles/21665587209367-Speaker-Identification-Overview)
- [How to edit speaker labels or names in a transcript — Fireflies Knowledge Base](https://guide.fireflies.ai/articles/4994477228-how-to-edit-speaker-labels-or-names-in-a-transcript)
- [How to Edit Speaker Labels in Uploaded Files — Fireflies Knowledge Base](https://guide.fireflies.ai/articles/1234873612-how-to-edit-speaker-labels-in-uploaded-files)
- [Speaker Diarization Privacy Risks: Who Gets Identified in Cloud Transcription — Basil AI](https://basilai.app/articles/2026-03-15-speaker-diarization-privacy-risks-who-gets-identified-in-cloud-transcription.html)
- [Get the most out of any Teams Rooms meeting with speaker recognition and Copilot — Microsoft Community Hub](https://techcommunity.microsoft.com/blog/microsoftteamsblog/get-the-most-out-of-any-teams-rooms-meeting-with-speaker-recognition-and-copilot/4182595)
- [Does Your AI Know Who's Talking? The Microsoft Teams Voiceprint Case — No Boiler](https://noboiler.com/blog/microsoft-teams-voiceprint)
- [7 AI Meeting Notetakers Tested in 2026 (Fathom vs Fireflies vs Otter) — alfred_](https://get-alfred.ai/blog/best-ai-meeting-notetakers)
- [Granola vs Otter vs Fireflies vs Fathom: Best AI Notetaker 2026 — useluminix](https://www.useluminix.com/reports/industry-analysis/ai-meeting-notes-comparison-granola-vs-otter-vs-fireflies-vs-fathom-2026)
- [Meeting note tool pricing: Granola vs. Fireflies vs. Fathom vs. Otter — Granola blog](https://www.granola.ai/blog/meeting-note-tool-pricing-granola-vs-fireflies-fathom-otter)
- [AI UX Patterns | References — ShapeofAI.com](https://www.shapeof.ai/patterns/references)
- [RAG Citations and Sources: Ensuring Response Traceability — Ailog RAG](https://app.ailog.fr/en/blog/guides/citation-sourcing-rag)
- [LLM Citations Explained: RAG & Source Attribution Methods — RankStudio](https://rankstudio.net/articles/en/ai-citation-frameworks)
- [Chunking Strategies for RAG: Methods, Trade-offs & Best Practices — Atlan](https://atlan.com/know/chunking-strategies-rag/)
- [Chunking Strategies for RAG: How to Optimize Document Retrieval — StackAI](https://www.stackai.com/insights/chunking-strategies-for-rag-how-to-optimize-document-retrieval)
- [Sprint Planning Meeting Agenda Template — Fellow.ai](https://fellow.ai/meeting-templates/sprint-planning-meeting)
- [Fireflies.ai Standup Notes AI Skill](https://fireflies.ai/skills/management/standup-notes-ai-app)
- [Customizing AI Summaries — Fathom Help Center](https://help.fathom.video/en/articles/3239809)
- [15 Best AI Meeting Summary Tools in 2026 — Fellow blog](https://fellow.ai/blog/ai-meeting-summary-tools/)

---
*Feature research for: AI meeting assistant — named speaker attribution, live grounded chat, cross-meeting semantic search, meeting-type templates*
*Researched: 2026-07-01*
