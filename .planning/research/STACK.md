# Stack Research

**Domain:** Adding cross-meeting AI features to an existing Electron meeting assistant (embeddings/semantic search, live chat UI, meeting-type templates)
**Researched:** 2026-07-01
**Confidence:** MEDIUM-HIGH (embedding path is existing, tested code; UI and schema-pattern recommendations are cross-checked web research + direct codebase inspection)

**Scope note:** This is a *subsequent milestone* on a shipped v1/v2 app. Nothing below touches Electron, React, Vite, Deepgram, `better-sqlite3-multiple-ciphers`, `sqlite-vec` (the extension itself), `tiktoken`, `ics`, or the Gemini-via-`openai`-SDK LLM pattern — those are locked and already validated. This file covers only what's new for: (a) live embedding generation, (b) an in-overlay chat UI, (c) Zod schema structuring for meeting-type templates.

## Recommended Stack

### (a) Embeddings — the model choice is already made; the gap is wiring, not a new package

**Finding:** `src/main/llm/EmbeddingAdapter.ts` already exists and is *not* a stub — it's a working, tested adapter:

```typescript
// src/main/llm/EmbeddingAdapter.ts (existing code, confirmed by direct read)
const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIMENSIONS = 1536
// client = new OpenAI({ apiKey, baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai' })
// client.embeddings.create({ model, input: text, dimensions: 1536 })
```

This is the correct choice and needs **no new package**:

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `gemini-embedding-001` (via existing `openai` SDK + Gemini `baseURL`) | current GA model | Text embedding for `vec_chunks` | Same billing account/key as the LLM (DEC-02 "Gemini paid plan only" applies automatically — no second provider, no second API key, no second free-tier risk to audit) |
| Matryoshka truncation to 1536 dims (`dimensions: 1536` param) | n/a | Matches existing `vec_chunks` schema (`embedding float[1536]`) | `gemini-embedding-001` natively outputs 3072 dims; requesting `dimensions: 1536` via the OpenAI-compat `embeddings.create` call truncates via Matryoshka Representation Learning — no DDL change needed, no dimension mismatch (adapter already throws if it ever gets a different length) |

**What's actually missing is the *call site*, not the adapter.** Today `EmbeddingAdapter.embed()` is only reachable from `EpochCompressor`, which fires at 70% of the 800K token ceiling — a case that essentially never happens for normal meetings (per AI-SPEC §2.4 token table, even 8-hour meetings stay under 400K tokens). That means **in the current codebase, a normal meeting never writes anything to `vec_chunks`.** Cross-meeting search across ordinary meetings requires a *new* trigger, not a new library:

- **Recommended new trigger: embed every `SummaryCard`.** Cards already fire every 5 minutes for every meeting (`SummaryCardTimer` → `ContextEngine.onCardReady`), are already structured (topic_headline, key_points, speaker_contributions), and the `vec_chunks` table already has the exact columns needed (`timestamp_start`, `speaker_label`, `text_preview`) to store one row per card. Concatenate the card's `topic_headline` + `key_points` + `speaker_contributions` values into one string and call the existing `EmbeddingAdapter.embed()` right after `SummaryCardStore.saveCard()` — mirrors the exact pattern `EpochCompressor` already uses, so it's consistent with the codebase's existing conventions, not a new pattern.
- **Secondary trigger: embed the meeting-level artifacts at `ArtifactPipeline` completion** (the `summary` + `key_points` + `mom` fields) as one coarse-grained vector per meeting — useful for "which past meeting talked about X" style queries where card-level granularity is too fine.
- Do this as **two separate embed calls per source** (card-level, meeting-level), not one combined scheme — different retrieval granularities serve different UI needs (search-panel result list wants meeting-level hits; live-chat grounding wants card-level precision with a timestamp to cite).

**Backfill for pre-existing v1/v2 meetings:** the OpenAI-compat `embeddings.create` `input` field accepts a string array, not just a single string. For a one-time migration job that embeds all existing `summary_cards` rows that predate this feature, batch multiple card texts per request (subject to Gemini's per-request batch limits) rather than one request per card — reduces round-trips for what could be hundreds of historical cards.

**No new npm dependency required for (a).** Do not add a second embeddings provider (e.g. OpenAI's own `text-embedding-3-small`, referenced in the *original* AI-SPEC §2.5 as the "default" before this codebase converged on `gemini-embedding-001`) — that would reintroduce a second paid API key and contradicts the already-established single-provider pattern DEC-02 exists to enforce. The AI-SPEC's `text-embedding-3-small` mention is now superseded by the shipped `gemini-embedding-001` implementation; treat the *implementation* as authoritative over the spec doc where they diverge.

### (b) Chat UI in the Electron overlay

The app has **no UI component library today** (no Tailwind, no Radix, no Chakra — confirmed via `package.json` and inline-style React components like `LiveSummaryBoard.tsx`). The right move is to stay consistent with that, not introduce a UI framework for one feature.

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `react-markdown` | 10.1.0 | Render assistant chat responses (and, as a bonus, finally render `mom.markdown_content` which today is dumped as raw text in `ArtifactReview.tsx`) | LLM output is markdown-formatted (the app's own MOM generation prompt asks for markdown). `react-markdown` parses to a React element tree and **escapes raw HTML by default** — no `dangerouslySetInnerHTML`, no XSS surface, since the input is untrusted LLM output rendered in a privileged Electron renderer context |
| `remark-gfm` | 4.0.1 | GitHub-flavored markdown extensions (tables, strikethrough, autolinks) | Gemini commonly emits GFM tables/lists for structured answers (e.g. "here are the 3 open action items"); without this plugin those render as literal pipe characters |

**Do NOT add:**
- `rehype-raw` / `rehype-sanitize` — only needed if you intend to let raw HTML pass through markdown. There's no reason to accept raw HTML from the LLM here; leaving `react-markdown`'s default HTML-escaping behavior in place is strictly safer and simpler.
- `streamdown`, `markstream-vue`, or similar "streaming-optimized" markdown renderers — these solve flicker/jank at high message-volume/long-document scale. Chat-length assistant replies (a few hundred tokens) re-parsed on every stream chunk cost well under 5ms per update; adding a specialized renderer here is solving a problem this app doesn't have.
- Vercel AI SDK's `ai/react` `useChat` (or any other fetch/HTTP-streaming chat hook library) — every one of these assumes a server route that returns an HTTP stream. This app's LLM calls run in the **Electron main process** and the renderer only receives IPC pushes (per the existing architecture: "renderer is display-only... typed contextBridge allowlist"). `LLMAdapter.stream()` already yields an `AsyncIterable<string>` from the main process; the correct pattern is a small custom hook (e.g. `useLiveChat()`) that subscribes to two new IPC channels (`chat-stream-chunk`, `chat-stream-done`) the same way `App.tsx` already subscribes to `summary-card-ready` — not a general-purpose chat SDK built for a different transport.
- Any state-management library (Redux/Zustand/Jotai) for chat history — the codebase's existing pattern is plain `useState`/`useReducer` plus an IPC-driven `useSessionState()` hook. Chat history for a single live meeting session is a short-lived array; a `useReducer` with `APPEND_CHUNK` / `APPEND_MESSAGE` / `RESET` actions is enough.
- List virtualization (`react-window`/`react-virtualized`) for the chat thread — the overlay is a single 380px-wide column and a meeting's live chat history is bounded by meeting length; this is premature optimization for a feature that doesn't yet exist.

**Overlay-specific interaction pattern (reuse, don't reinvent):** the overlay window is created with `setIgnoreMouseEvents(true, { forward: true })` by default so it doesn't block clicks to apps behind it, and existing components toggle this off on pointer-hover. The chat input box must participate in that same toggle (focus/hover → `setIgnoreMouseEvents(false)`, blur → restore `true`) — this is an integration point with the existing overlay window config in `05-ARCHITECTURE.md §9`, not a new library concern.

### (c) Zod schema structuring for meeting-type templates (Standup / 1:1 / Planning)

**The critical constraint, verified via multiple independent sources (OpenAI docs, `openai-node` GitHub issues, community reports):** OpenAI Structured Outputs strict mode — which this app already uses via `zodResponseFormat()` from `openai/helpers/zod` in `LLMAdapter.generate()`, over the Gemini `baseURL` — **does not allow the root schema to be a `anyOf`/`oneOf`.** `z.discriminatedUnion(...)` at the top level of a schema passed to `zodResponseFormat`/`zodToJsonSchema` produces exactly that shape and will fail (either at conversion time or as a 400 from the API, depending on `openai`/`zod` version). This is a live, current footgun — a `zod` 4.1.13+ regression changed discriminated-union output from `anyOf` to `oneOf`, which broke previously-working strict-mode calls for other projects on the same pattern.

**Recommendation: don't use a discriminated union at all — you don't need one.**

This app already knows the meeting type *before* any extraction call happens (user selects Standup/1:1/Planning **at session start**, per the milestone's own feature description — it's not classified after the fact from the transcript). That means schema selection can happen in **application code**, not inside a single polymorphic Zod schema:

```typescript
// src/shared/schemas/index.ts — pattern, not literal code
const BaseArtifactFields = {
  summary: SummarySchema,
  key_points: KeyPointListSchema,
  action_items: ActionItemListSchema,
}

const StandupTemplateSchema = z.object({
  ...BaseArtifactFields,
  blockers: z.array(z.object({ speaker_label: z.string(), description: z.string() })),
  yesterday_today: z.record(z.string(), z.object({ yesterday: z.string(), today: z.string() })),
})

const OneOnOneTemplateSchema = z.object({
  ...BaseArtifactFields,
  talking_points: z.array(z.string()),
  feedback_items: z.array(z.object({ direction: z.enum(['manager_to_report','report_to_manager']), text: z.string() })),
})

const PlanningTemplateSchema = z.object({
  ...BaseArtifactFields,
  milestones: z.array(z.object({ name: z.string(), target_date: z.string().nullable() })),
  risks: z.array(z.string()),
})

// call-site (ArtifactPipeline reduce step) — plain conditional, no union:
const schema = meetingType === 'standup' ? StandupTemplateSchema
             : meetingType === 'one_on_one' ? OneOnOneTemplateSchema
             : PlanningTemplateSchema
```

This mirrors what the codebase already does architecturally: `MeetingArtifactsSchema` is not actually one giant call — the real implementation issues **separate LLM calls with separate small schemas** per artifact type (`MoMSchema`, `SummarySchema`, `KeyPointListSchema`, `ActionItemListSchema` are all distinct exports in `src/shared/schemas/index.ts`, confirmed by direct read). Meeting-type templates fit this exact shape: swap which schema (and which system prompt) each call site uses, keyed off a `meetingType` value threaded through from session start — no new schema *mechanism*, just more schema *variants* and a lookup at the call site.

**If you want a shared base to avoid duplicating fields across the three schemas, use `z.object({...}).extend({...})` or object-spread on shared field definitions (as above) — never `z.union`/`z.discriminatedUnion` as the schema passed to `zodResponseFormat`.** A discriminated union is safe to use *internally* in application/TypeScript code (e.g. as the return type of a function that picks a schema) — the restriction is specifically about what gets handed to the LLM structured-output call.

**No new npm package required for (c).** `zod` (pinned `^3.25.76`) and `zod-to-json-schema` (pinned `^3.25.2`) already handle this pattern with zero changes.

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-markdown` | 10.1.0 | Markdown → React element rendering | Chat responses; retroactively, MOM rendering in `ArtifactReview.tsx` |
| `remark-gfm` | 4.0.1 | GFM syntax (tables, strikethrough) for `react-markdown` | Same call sites as above |

## Installation

```bash
# Core additions for this milestone
npm install react-markdown@10.1.0 remark-gfm@4.0.1

# Nothing else — embeddings and schema-variant work use packages already installed
# (openai ^5.23.2, zod ^3.25.76, zod-to-json-schema ^3.25.2, sqlite-vec 0.1.9)
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| `gemini-embedding-001` (existing adapter, same Gemini key) | OpenAI `text-embedding-3-small` (original AI-SPEC §2.5 suggestion) | Only if the project ever drops the "single provider, single paid key" constraint (DEC-02) — not recommended; would need a second API key/billing relationship for no measurable retrieval-quality gain at this scale |
| `react-markdown` + `remark-gfm` | `streamdown` / `markstream-vue` (streaming-optimized renderers) | Only if chat responses grow long (multi-thousand-token essays) or message volume is very high and re-parse-per-chunk becomes visibly janky — not expected for meeting-assistant Q&A |
| Custom `useLiveChat()` IPC hook | Vercel AI SDK `useChat` | Only if the chat backend is ever moved to an HTTP server (e.g. if MeetingAssist grows a companion web/mobile client) — irrelevant while all LLM calls stay in the Electron main process |
| Per-meeting-type flat Zod schemas selected by app code | `z.discriminatedUnion` passed directly to `zodResponseFormat` | Never, for LLM structured-output schemas — the meeting type is already known at session start, so there's no scenario in this app where the *model* needs to pick the variant |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| A second embeddings provider/API key (e.g. raw OpenAI `text-embedding-3-small`) | Reintroduces the exact multi-provider/free-tier-risk problem DEC-02 was written to eliminate; the existing `gemini-embedding-001` adapter already works and bills through the same paid Gemini account | `EmbeddingAdapter` as already implemented — just call it from more places |
| `z.discriminatedUnion(...)` (or any root-level `anyOf`/`oneOf`) as the schema passed into `zodResponseFormat`/`zodToJsonSchema` for an LLM call | OpenAI strict-mode structured outputs reject root-level `anyOf`; a `zod` 4.1.13+ regression made this worse by emitting `oneOf` instead of `anyOf` for discriminated unions, breaking previously-working strict-mode calls elsewhere in the ecosystem | Separate flat schemas per meeting type, selected in application code (meeting type is already known at session start) |
| Upgrading `zod` to v4 as part of this milestone | `zod-to-json-schema` is pinned at `^3.25.2`, built against the `zod` v3 API; mixing is a known source of the `oneOf`/strict-mode breakage above; this milestone's scope is new features, not a major dependency bump | Stay on `zod ^3.25.76` / `zod-to-json-schema ^3.25.2` as already pinned |
| `rehype-raw`/`rehype-sanitize` for chat markdown rendering | Only needed if intentionally allowing raw HTML through — unnecessary attack surface for content that's already safe as plain markdown | `react-markdown`'s default HTML-escaping behavior (no plugin needed) |
| A general-purpose chat SDK (`ai/react`, CopilotKit, assistant-ui) for the live chat panel | All assume an HTTP-streaming server endpoint; this app's LLM calls happen in the Electron main process and reach the renderer only via typed IPC — forcing a fetch-shaped SDK onto an IPC transport adds an unnecessary compatibility shim | A small custom IPC-subscribing hook, following the exact pattern `App.tsx` already uses for `summary-card-ready` |
| Using `+meeting_id` (auxiliary column) in a `vec0` `WHERE ... MATCH` clause to scope a KNN search to one meeting | `vec_chunks.meeting_id` is declared with a `+` prefix in the existing DDL (auxiliary — unindexed, joined post-hoc). Per sqlite-vec's own docs, auxiliary columns are not meant to appear in a KNN `WHERE` filter; doing so forces an inefficient full-table scan before the join | Fine as-is for *cross-meeting* search (which wants results from all meetings — no filter needed). Only if a future "search within this one meeting" mode is added, migrate `meeting_id` to a `PARTITION KEY` or true metadata column in a new `vec0` table version |

## Stack Patterns by Variant

**If embedding for cross-meeting search (feature 3):**
- Hook into `ContextEngine.onCardReady` (already fires every 5 minutes per meeting) and `ArtifactPipeline` completion (already fires once per meeting)
- Write to the existing `vec_chunks` table — no DDL change
- Use `gemini-embedding-001` via the existing `EmbeddingAdapter` — no new provider

**If building the live chat panel (feature 2):**
- New IPC channels (`chat-message-send` outbound, `chat-stream-chunk` / `chat-stream-done` inbound) added to the existing typed contextBridge allowlist in `src/preload/index.ts` — following the exact shape of the existing 18-channel surface in `05-ARCHITECTURE.md §7`
- Reuse `LLMAdapter.stream()` (already implemented, already yields `AsyncIterable<string>`) for the current-meeting-grounded half of the answer
- For the cross-meeting-grounded half: embed the user's question with `EmbeddingAdapter.embed()` (query-side embedding, same model/adapter — symmetric embedding since the OpenAI-compat endpoint does not expose Gemini's native `task_type` parameter, see Version Compatibility note below), run a `vec0` KNN query against `vec_chunks`, splice top-K `text_preview` hits into the `ContextComposer` priority stack (which already has a documented slot for "epoch summaries via sqlite-vec RAG" in `05-ARCHITECTURE.md §2.7` — cross-meeting hits are a natural extension of that same slot, not a new architectural concept)

**If building meeting-type templates (feature 4):**
- Add a `meeting_type` column to the `meetings` table (`'standup' | 'one_on_one' | 'planning' | null`) — small DDL addition, not a new library
- Add one flat Zod schema per type per the pattern in (c) above
- Branch on `meetingType` at each `ArtifactPipeline` LLM call site to pick the schema + system prompt — no new pipeline mechanism

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `gemini-embedding-001` (native dims 3072) | `vec_chunks.embedding float[1536]` | Requires the OpenAI-compat `embeddings.create({ dimensions: 1536 })` param (Matryoshka truncation) — already correctly used in existing `EmbeddingAdapter`; do not omit `dimensions` or the call will return 3072-length vectors and throw the adapter's own dimension guard |
| `gemini-embedding-001` via OpenAI-compat endpoint | Gemini's native `task_type` parameter (`RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`) | **Not exposed** through the OpenAI-compat `embeddings.create` call (that endpoint only forwards `model`/`input`/`dimensions`/`encoding_format`/`user` — no `task_type` field in the OpenAI schema). This means both document embeddings (cards/artifacts) and query embeddings (chat questions, search input) are produced symmetrically. This is a minor retrieval-quality tradeoff, not a correctness bug — acceptable given the existing architecture standardized on the OpenAI-compat client for both LLM and embedding calls. If retrieval quality is ever found lacking, the fix is switching this one adapter to Google's native `@google/genai` SDK (which does expose `task_type`) — a scoped, optional upgrade, not required for this milestone |
| `react-markdown` 10.1.0 | React 19 | No known incompatibility; `react-markdown` v10 targets React 18+ |
| `zod` `^3.25.76` | `zod-to-json-schema` `^3.25.2`, `openai` `^5.23.2`'s `zodResponseFormat` helper | Do not upgrade `zod` to v4 independently — v4's discriminated-union output changed from `anyOf` to `oneOf`, breaking strict-mode compatibility elsewhere in the ecosystem; this app avoids discriminated unions in LLM schemas anyway (see above), but the pinned v3 combination is the tested-working one and should not be touched as a side effect of this milestone |

## Sources

- Direct codebase read: `src/main/llm/EmbeddingAdapter.ts`, `src/main/llm/LLMAdapter.ts`, `src/shared/schemas/index.ts`, `src/renderer/src/components/LiveSummaryBoard.tsx`, `package.json` — confidence HIGH (ground truth)
- `.planning/milestones/v1.0-phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md` — confidence HIGH (locked project spec)
- `.planning/phases/05-prd-finalization/05-ARCHITECTURE.md` — confidence HIGH (locked project spec)
- npm registry (`npm view <pkg> version`) for `react-markdown` (10.1.0), `remark-gfm` (4.0.1), `zod` (latest 4.4.3, confirming project is intentionally behind on v3), `zod-to-json-schema` (3.25.2), `openai` (latest 6.45.0, confirming project is intentionally behind on v5) — confidence HIGH (registry is authoritative for version numbers)
- Web research, cross-checked across multiple independent sources (Google Developer Blog, `ai.google.dev` docs, `openai-node` GitHub issues #995/#1709, OpenAI structured-outputs docs, `alexgarcia.xyz/sqlite-vec` docs, `remarkjs/react-markdown` repo) — confidence MEDIUM: Gemini embedding `task_type` scope under OpenAI-compat, OpenAI strict-mode root-`anyOf` restriction, `zod` 4.1.13+ discriminated-union regression, `sqlite-vec` KNN/auxiliary-column semantics, `react-markdown` default HTML-escaping behavior

---
*Stack research for: MeetingAssist v3.0 Advanced Assistant Features milestone*
*Researched: 2026-07-01*
