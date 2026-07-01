# Pitfalls Research

**Domain:** Adding named speaker attribution, live RAG chat, cross-meeting semantic search, and meeting-type templates to an existing faithfulness-first Electron meeting assistant (MeetingAssist v3.0)
**Researched:** 2026-07-01
**Confidence:** HIGH (architecture-grounded, cross-checked against current DB DDL and AI-SPEC contract) / MEDIUM (external RAG/embedding/SQLite claims — see Sources)

This is not a generic pitfalls list. Every pitfall below is derived from the **actual current schema** (7 tables, `05-ARCHITECTURE.md`), the **actual faithfulness contract** (two-stage extraction, `04-AI-SPEC.md`), and the **actual v1 gaps** (EmbeddingAdapter is infrastructure-only, `vec_chunks` is empty, speaker labels are per-channel diarization output, not stable identities).

---

## Critical Pitfalls

### Pitfall 1: Speaker label is a denormalized JSON dictionary key, not a display string

**What goes wrong:**
Teams treat "rename Speaker 1 to Alice" as a single UPDATE against one column. In this schema, `speaker_label` is duplicated in at least five places, and in two of them it is a **JSON object key**, not a value: `summary_cards.speaker_contributions_json` (keyed `speaker_label → summary string`) and `epoch_summaries.speaker_attributions_json` (keyed `speaker_label → summary`). It also appears as a plain column in `transcript_segments.speaker_label`, `action_items.assignee_label`, and `vec_chunks.+speaker_label`. If relabeling only updates `transcript_segments`, every already-generated summary card, epoch summary, action item, and vector chunk still carries the stale key — the live board says "Alice" while the end-of-meeting MOM and the searchable vector chunks still say "Speaker 1". Worse, `content_json` in `artifacts` and `citations_json` in `action_items` are **frozen JSON blobs written at generation time** (`CitationAnchorSchema.speaker_label` baked in) — a relabel event cannot reach inside already-persisted artifact JSON without a targeted JSON patch across every artifact row for that meeting.

**Why it happens:**
The v1 schema was designed before named attribution existed as a feature — `speaker_label` was treated purely as a display convenience baked into every downstream write. Adding relabeling as a "cosmetic" UI feature ignores that the label has been propagated by value (and by JSON key) into five independent tables/blobs.

**How to avoid:**
Do not mutate `speaker_label` anywhere. Add a separate `speaker_mappings` table (`meeting_id`, `original_label`, `display_name`, `updated_at`) and resolve the display name **at read time** in every place a label is rendered or exported (overlay, ArtifactReview, `.ics` export, chat citations, search results). Treat `speaker_label` in all existing tables as an immutable foreign key into the mapping, never as the rendered value itself.

**Warning signs:**
Any code path that does `UPDATE transcript_segments SET speaker_label = ?` or that JSON-parses `speaker_contributions_json` / `citations_json` to find-and-replace a key. Any UI that shows the new name in the live overlay but the old label in the exported MOM or `.ics` file.

**Phase to address:**
Named Speaker Attribution phase — must be architected before any UI is built, since it determines whether every other read path (artifacts, chat citations, search results) needs a resolution layer.

---

### Pitfall 2: Diarization labels are not stable identities — they reset per meeting and per channel

**What goes wrong:**
`speaker_label` values ("Speaker 1", "Speaker 2") are assigned by Deepgram's diarization per session, in order of first utterance — they are not a persistent identity. The architecture explicitly documents an anti-pattern: **mic channel always maps speaker 0 to "You"; system audio has an independent speaker ID space, and IDs must never be merged across channels.** A relabeling feature that lets a user type "Alice" for "Speaker 1" in one meeting will not, and cannot, automatically mean "Speaker 1 is Alice" in the next meeting — the label space is meeting-scoped. If the UI or a "remember this speaker" convenience feature implies persistent identity across meetings without an explicit voice-print or manual cross-meeting linking mechanism, users will get silently wrong attributions in meeting #2 (a different person happens to be diarized as "Speaker 1").

**Why it happens:**
Users mentally model "Speaker 1" as a person, not a per-session diarization slot. The temptation is to build a global `speaker_id → name` table keyed only by label string, which will misattribute the moment two meetings have different people in slot 1.

**How to avoid:**
Scope `speaker_mappings` by `(meeting_id, original_label)` — never globally by label alone. If a "remember this person across meetings" convenience is wanted, it must be a separate, explicit, opt-in step (e.g., user manually links a per-meeting mapping to a persistent contact record) — never inferred from label match.

**Warning signs:**
A `speaker_mappings` table or cache keyed only by `speaker_label` without `meeting_id`. Any UI that pre-fills "Alice" for "Speaker 1" in a brand-new meeting without user confirmation.

**Phase to address:**
Named Speaker Attribution phase.

---

### Pitfall 3: Live chat bypasses the two-stage faithfulness contract that is this product's entire trust proposition

**What goes wrong:**
The AI-SPEC's core contract (GRND-01) is that every claim in an artifact is traceable to a verbatim quote via a mandatory Stage 1 (evidence extraction) → Stage 2 (constrained generation) pipeline, with citations always attached and never suppressed. The new live chat feature is a **new generation surface** that the existing `ArtifactPipeline` / `CitationValidator` does not cover. If chat answers are generated by stuffing retrieved transcript chunks + past-meeting chunks + conversation history directly into a single free-form generation call — without extracting anchors first and without attaching per-answer citations — the product reintroduces exactly the fabrication risk the two-stage protocol was built to eliminate, in the one surface (interactive Q&A) where users are most likely to trust an authoritative-sounding answer at face value. This is a well-documented general RAG failure mode: retrieval reduces but does not eliminate hallucination, especially when retrieved documents are off-topic, irrelevant, or absent, and generation isn't explicitly constrained to only what was retrieved.

**Why it happens:**
Chat feels conversational and low-stakes compared to a formal MOM, so teams under time pressure skip the anchor-first discipline "because it's just an answer, not an artifact." But users will act on a chat answer ("did we agree to ship by Friday?") exactly like they act on an action item.

**How to avoid:**
Reuse the two-stage pattern for chat: Stage 1 retrieves candidate transcript/vector chunks and reduces them to `CitationAnchor`-shaped evidence; Stage 2 generates the answer constrained to only that evidence, with the same `confidence: 'direct' | 'inferred'` semantics and a "Verify" affordance per answer. If no relevant evidence is retrieved, the answer must say so explicitly rather than falling back to the model's parametric knowledge.

**Warning signs:**
A chat endpoint that sends full retrieved text plus the raw conversation to a single completion call with no schema constraining output to cited evidence. No "Verify" / source-quote UI on chat answers. Chat answers that reference facts not present in any retrieved chunk.

**Phase to address:**
Live Assistant Chat phase — the retrieval/generation split must be designed before the chat UI, reusing `CitationValidator` patterns from `ArtifactPipeline`.

---

### Pitfall 4: Context window bloat compounds across two independent LLM consumers competing for the same rolling budget

**What goes wrong:**
The `ContextEngine` already manages an 800K-token rolling window via `EpochCompressor`, deliberately reading only from `transcript_segments`. Live chat adds a second consumer of context: retrieved current-meeting chunks + top-K past-meeting chunks (from `vec_chunks`) + growing multi-turn chat history, appended on every turn. If this is bolted on without its own dedicated token budget (separate from the passive summary-card path) and without truncating/re-summarizing chat history, per-turn token cost and latency grow unboundedly over a long meeting, and a single chat session can blow past what the passive path was sized for — especially in back-to-back exchanges near the end of a 60+ minute meeting where the epoch-compressed context is already large.

**Why it happens:**
The existing `ContextEngine` budget was sized for one consumer (the passive 5-minute summary path). Adding chat as a second consumer without accounting for its incremental cost is a natural oversight — the token budget math was never re-derived for two concurrent consumers.

**How to avoid:**
Give chat its own token budget separate from the summary-card path (e.g., cap retrieved-chunk count via `sqlite-vec` top-K + truncate/summarize chat history after N turns using the same epoch-compression pattern). Measure actual token counts with `tiktoken` (never approximate) for the combined chat prompt, not just the summary prompt.

**Warning signs:**
Chat latency increasing meeting-over-meeting or turn-over-turn within a session. `tiktoken` counts for chat prompts approaching the model's context ceiling before the meeting itself is anywhere near 800K tokens of transcript.

**Phase to address:**
Live Assistant Chat phase.

---

### Pitfall 5: Live chat and the 5-minute summary pipeline contend for the same single-threaded main process and the same LLM rate limit

**What goes wrong:**
All audio, STT, DB, and LLM logic runs in the Electron **main process** by architectural mandate — there is no separate worker process for AI calls. The `SummaryCardTimer` already fires an LLM call every 5 minutes during a live meeting. Live chat adds on-demand LLM calls (plus `sqlite-vec` queries) that can land at the same moment as a summary-card generation. Without a queue or concurrency guard, this risks: (a) main-process contention that stalls audio/transcript processing during a live meeting, and (b) Gemini rate-limit errors when two calls land simultaneously, silently degrading either the chat answer or the next summary card.

**Why it happens:**
The summary-card path was built and tested as the only LLM consumer during live capture (Phase 4/5 of v1). Chat is a second, user-triggered, unpredictable-timing consumer added to the same process without revisiting that assumption.

**How to avoid:**
Serialize LLM calls behind a single request queue in the main process (or at minimum, detect and back off on concurrent in-flight requests). Test chat interaction concurrently with an active `SummaryCardTimer` tick, not in isolation — this is exactly the kind of failure that only shows up under real timing, not unit tests.

**Warning signs:**
Dropped or delayed summary cards specifically when a chat query was in flight. Rate-limit (429) errors from Gemini correlated with concurrent chat + summary timer activity.

**Phase to address:**
Live Assistant Chat phase (design); verify jointly with the existing ContextEngine/SummaryCardTimer during integration testing.

---

### Pitfall 6: Cross-meeting search ships against an empty vector index — pre-milestone meetings were never embedded

**What goes wrong:**
`EmbeddingAdapter` is explicitly **infrastructure-only in v1** — "no live embedding in production; v2 live assistant will activate this path." That means `vec_chunks` is empty for every meeting recorded before this milestone. If cross-meeting search and chat grounding are built assuming `vec_chunks` is populated, the feature will silently return zero results for a user's entire existing meeting history on first use — appearing broken ("I have 40 meetings, why does search find nothing?") when the real cause is a missing backfill step.

**Why it happens:**
Teams building the search UI test against freshly-captured meetings (which get embedded going forward) and never test against the pre-existing corpus, because local dev data is usually generated fresh.

**How to avoid:**
Ship an explicit backfill job that runs `EmbeddingAdapter` over all existing `transcript_segments` for meetings with no corresponding `vec_chunks` rows, on first launch after this milestone's update (or as a visible one-time "Indexing your meeting history…" progress state). Do not silently skip old meetings.

**Warning signs:**
Search or chat grounding that only ever surfaces results from meetings recorded after the update ships. Empty `vec_chunks` row counts for meetings with non-empty `transcript_segments`.

**Phase to address:**
Cross-Meeting Semantic Search phase — the backfill migration must be a first-class deliverable, not an afterthought.

---

### Pitfall 7: Embedding model choice is a one-way door — mixing providers or switching models silently corrupts search quality

**What goes wrong:**
The architecture already documents a fallback: `text-embedding-3-small` (OpenAI, 1536 dims) by default, Gemini's embedding model as fallback "also 1536 dims." Matching dimensionality does **not** mean matching vector space — embeddings from different models/providers are not comparable via cosine similarity even at the same dimension count, because each model clusters semantic concepts differently. If a user's meetings end up embedded with a mix of providers (e.g., they had only an OpenAI key configured for some meetings, then switched to Gemini-only), `sqlite-vec` KNN search over that mixed index will return low-quality or nonsensical nearest neighbors with no error — it fails silently, not loudly. The same risk applies to any future embedding model upgrade: re-embedding is required for the *entire* corpus, not incremental.

**Why it happens:**
The infrastructure was designed with a fallback path for resilience (don't block if one provider key is missing), but resilience at the embedding layer creates a correctness bug at the search layer that's invisible until users notice bad results.

**How to avoid:**
Record which embedding model/provider generated each `vec_chunks` row (add a `model_id` column) and either (a) enforce a single embedding provider for the whole corpus with a hard error if it's unavailable rather than silently falling back, or (b) maintain provider-segmented indices and re-rank/merge results explicitly rather than comparing raw cosine scores across providers. Any future embedding model change requires a full re-embed migration, not an incremental one.

**Warning signs:**
Search results that are semantically irrelevant for meetings recorded during a period when the configured API key changed. No `model_id`/`model_version` tracked per vector chunk.

**Phase to address:**
Cross-Meeting Semantic Search phase.

---

### Pitfall 8: Meeting-type templates hit a hard SQLite CHECK constraint wall on `artifacts.artifact_type`

**What goes wrong:**
`artifacts.artifact_type` has `CHECK (artifact_type IN ('mom', 'summary', 'key_points', 'action_items', 'dates'))`. SQLite does not support adding or modifying a CHECK constraint via `ALTER TABLE` — the only path is the documented rebuild procedure (create new table with the constraint, copy data, drop old, rename). If Standup/1:1/Planning templates need new artifact categories (e.g., "blockers", "decisions_log", "parking_lot"), naively trying to `ALTER TABLE artifacts ADD CONSTRAINT` will fail, and a rushed workaround (dropping the CHECK entirely, or writing invalid types that violate it silently on old SQLite builds) erodes the schema's data integrity guarantees for an already-shipped, encrypted, real-user-data table.

**Why it happens:**
CHECK-constrained enums feel like they should be extensible the same way an application-level enum is. SQLite's DDL model doesn't support that, and the encrypted-DB-with-existing-rows constraint (this isn't a fresh dev DB) makes ad hoc schema surgery riskier than in a greenfield project.

**How to avoid:**
Do not add new `artifact_type` enum values. Keep `artifact_type` as the existing 5 stable categories and represent template-specific structure **inside** `content_json` as a discriminated union keyed by a new `template` field on the `meetings` table (e.g., `meetings.meeting_type: 'standup' | '1:1' | 'planning' | 'general'`), with the Zod schema for `content_json` varying by `(artifact_type, meeting_type)` pair. If a genuinely new top-level artifact type is unavoidable, plan the full SQLite table-rebuild migration (transaction, foreign-key-off, copy, rename) as an explicit, tested migration step — not a quick `ALTER TABLE`.

**Warning signs:**
Any migration script calling `ALTER TABLE artifacts ADD CONSTRAINT` or attempting `ALTER TABLE ... CHECK`. Any code that inserts an `artifact_type` value not in the original 5 without first running a schema rebuild.

**Phase to address:**
Meeting-Type Templates phase — schema design must happen before any template-specific Zod schema work.

---

### Pitfall 9: Template-aware Stage 1 extraction silently breaks the verbatim-quote contract

**What goes wrong:**
The two-stage protocol requires Stage 1 to extract **raw, verbatim, template-agnostic** `CitationAnchor` quotes, and Stage 2 to generate content using *only* those quotes, constrained by a schema. When adding meeting-type-specific templates, the natural (and wrong) shortcut is to make Stage 1's extraction prompt template-aware too — e.g., telling the standup extractor to "only pull blocker-related quotes" or pre-shaping quotes to fit the template's expected fields. This turns Stage 1 into a filtering/paraphrasing step, which reintroduces the exact failure the two-stage design prevents: once Stage 1 starts shaping evidence toward an expected output shape, Stage 2 is no longer generating strictly from independently-audited raw evidence — it's generating from evidence that was already curated to agree with the template, undermining the "if Stage 2 produces a suspicious claim, Stage 1 output is independently auditable" guarantee.

**Why it happens:**
It seems more efficient to have one combined "template-aware" extraction call per meeting type instead of maintaining one universal Stage 1 plus N different Stage 2 schemas. This conflates "what evidence exists" (must stay universal) with "what structure to generate" (should vary by template).

**How to avoid:**
Keep exactly one Stage 1 extraction contract regardless of meeting type — it always extracts verbatim `CitationAnchor` objects from the full transcript, unconditioned by template. Only Stage 2's Zod schema and prompt (the *generation* step) varies per `meeting_type`. Add a regression check: Stage 1 output for a given transcript must be identical (or a superset) regardless of which `meeting_type` is selected for the session.

**Warning signs:**
A Stage 1 prompt that references the meeting type or the target template's field names. Different Stage 1 output (different quotes extracted) for the same transcript depending on which template was selected.

**Phase to address:**
Meeting-Type Templates phase — must be explicitly checked in code review before merging any template-schema work.

---

### Pitfall 10: Template selection adds mandatory friction before the consent gate is even satisfied

**What goes wrong:**
The existing FSM already requires a consent-gate confirmation before capture starts — a hard, deliberate precondition (DEC-01). If meeting-type selection (Standup/1:1/Planning) is implemented as another *required*, blocking modal the user must complete before starting capture, it stacks a second forced decision in front of the moment the user actually wants to start — friction directly counter to the product's "walk out with artifacts, without having taken a note" value prop, and directly counter to the milestone brief's own warning about pre-meeting friction. Users in a genuine hurry (joining a call that already started) will resent or misuse the picker (always clicking the first option, defeating its purpose).

**Why it happens:**
Templates feel like they need explicit user intent to be useful, so the default implementation makes selection a required first step of the session-start flow.

**How to avoid:**
Default to a `general` template pre-selected (today's v1 universal template, unchanged behavior) with the type picker as a single optional, low-friction control (e.g., a dropdown already visible on the same consent screen, not a separate modal/step) — capture is never blocked on making this choice. Allow the type to be changed after the fact (even post-meeting, before artifact generation runs) for the common case where a user starts a call before deciding what kind of meeting it turned out to be.

**Warning signs:**
User testing shows meaningful hesitation or drop-off between "click record" and "capture actually starts." A required screen/step that has no skip/default path.

**Phase to address:**
Meeting-Type Templates phase (UX design, before implementation).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Mutate `speaker_label` in place instead of adding a `speaker_mappings` resolution layer | Faster to ship a "rename" button | Inconsistent labels across artifacts/summary cards/exports; unrecoverable once baked into JSON blobs | Never |
| Single combined Stage-1+Stage-2 chain-of-thought call for chat (skip the two-call split) | Lower latency, simpler code | Loses independent auditability of evidence vs. generation, reintroduces hallucination risk in the one live, user-facing surface | Only if the two-call split is measured as the dominant latency contributor AND an equivalent grounding check is added another way (per AI-SPEC's own stated collapse condition) |
| Ship cross-meeting search without a backfill job for pre-milestone meetings | Faster ship date | Feature appears broken for every existing user's meeting history | Never — backfill is the majority of the value for existing users |
| Add new `artifact_type` CHECK values ad hoc for templates | Feels like the "natural" enum extension | Requires a full SQLite table-rebuild migration on an encrypted, populated production table each time | Never — model template variance inside `content_json` instead |
| Let chat retrieve past-meeting chunks with no confidentiality/topic boundary | Simpler retrieval query (global top-K over all meetings) | Confidential content from an unrelated meeting/client context can surface inside a different meeting's live chat answer | Only for single-user, single-context use; flag before any multi-client or shared-workspace use case |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|-------------------|
| `sqlite-vec` (`vec_chunks`) | Assuming the table is populated because the DDL exists | Verify actual row counts per meeting; v1 shipped this table empty (EmbeddingAdapter infrastructure-only) |
| Embedding provider (OpenAI vs. Gemini fallback) | Treating "same 1536 dims" as "comparable vectors" | Track `model_id`/provider per chunk; never mix providers in one similarity comparison |
| Gemini (chat + summary cards, same process) | Firing chat and `SummaryCardTimer` LLM calls concurrently with no queue | Serialize/queue LLM calls in the main process; test under concurrent load, not in isolation |
| Two-stage extraction (`CitationValidator`) | Building chat as a separate, unconstrained generation path outside the existing pipeline | Reuse the Stage 1/Stage 2 + `CitationValidator` pattern for chat answers |
| `artifacts.artifact_type` CHECK constraint | Trying `ALTER TABLE ... ADD CONSTRAINT` for new template types | Keep the 5 existing types; vary `content_json` shape by `meeting_type` instead |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Unbounded chat history appended to every turn's prompt | Rising per-turn latency and token count within one long meeting | Cap/summarize chat history using the same epoch-compression pattern as the passive path; measure with `tiktoken` per turn | Noticeable after ~10-15 chat turns in a single session, worse in meetings already near the 800K rolling window |
| `vec0` linear-scan KNN over a growing cross-meeting corpus | Search/chat retrieval latency creeping up as meeting count grows | Cap corpus size per query with meeting-recency pre-filtering; monitor query latency as row count in `vec_chunks` grows | `sqlite-vec` 0.1.x's `vec0` performs brute-force scans without ANN indexing — noticeable degradation is corpus-size-dependent and should be load-tested rather than assumed safe indefinitely |
| Concurrent LLM calls (chat + summary timer) on single main process | Main-process stalls affecting live audio/transcript pipeline during active capture | Queue/serialize LLM requests; never let chat block the SessionManager FSM's capture path | First live meeting where a user chats while a 5-minute summary tick fires |
| Backfill embedding job runs synchronously on app launch | App appears frozen/unresponsive after update, for users with large meeting history | Run backfill as a visible background job with progress UI, not a blocking startup task | Any user with a meaningful pre-milestone meeting history (dozens+ of meetings) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Cross-meeting retrieval with no confidentiality boundary between meetings recorded under different contexts (e.g., different clients) | Confidential content from meeting A surfaces as grounding context inside meeting B's live chat answer, and that content is sent to the external LLM provider attached to a different meeting's session | Scope retrieval explicitly (opt-in per meeting or per tagged workspace) rather than defaulting to "search everything"; make cross-meeting grounding visible/auditable in the chat UI (show which past meeting a chunk came from) |
| Baking real names (from speaker relabeling) into exported `.ics` files or shared artifacts without re-confirming the proposed-with-confirm contract | Real names now flow into calendar exports and any future sharing surface with the same "already confirmed, low friction" assumption the anonymous "Speaker 1" labels had | Treat name-bearing exports as no different from any other confirmed artifact — the existing `status: 'proposed' → 'confirmed'` gate already covers this if the export path re-resolves display names at export time, not at generation time |
| Mixed-provider embeddings silently degrading search without any error surfaced to the user | Users trust bad-quality search results as authoritative because the feature "looks like it's working" | Log/track embedding provider per chunk; surface a visible warning if a query spans mixed-provider chunks |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Speaker relabel only applies going forward / only in the live view, not to already-displayed artifacts | User renames "Speaker 1" to "Alice" mid-meeting, then the exported MOM still says "Speaker 1" — feels broken/untrustworthy | Resolve display names at every render/export path from the `speaker_mappings` table, not just the live overlay |
| Implying speaker identity persists across meetings when it doesn't (diarization labels reset per session) | User expects "Alice is always Speaker 1" and gets a different person mislabeled in the next meeting | Never auto-carry a name across meetings without explicit user action; make per-meeting scoping visible in the UI copy |
| Chat gives a confident-sounding answer with no visible source | User can't tell if an answer is grounded in this meeting, a past meeting, or nothing at all | Every chat answer shows a "Verify" affordance identical in spirit to artifact citations, including which meeting a cross-meeting chunk came from |
| Mandatory, blocking meeting-type picker before capture can start | Adds a decision point on top of the already-required consent gate, right when the user wants to just start | Default to `general`, make the picker optional and changeable later; never block capture on it |
| Search panel returns nothing for old meetings with no explanation | User assumes cross-meeting search is broken | Explicit "Indexing older meetings…" state until backfill completes; never silently return empty |

## "Looks Done But Isn't" Checklist

- [ ] **Speaker relabeling:** Often missing propagation to already-generated `summary_cards`, `epoch_summaries`, `action_items.assignee_label`, and `content_json`/`citations_json` inside `artifacts` — verify a rename made mid-meeting is reflected in the exported MOM, the `.ics` attendee/assignee field, and the searchable vector chunks, not just the live overlay.
- [ ] **Live chat grounding:** Often missing per-answer citations/source attribution — verify every chat answer can show which transcript quote or which past meeting it came from, and verify the chat explicitly says "no information found" rather than answering from parametric knowledge when retrieval returns nothing.
- [ ] **Cross-meeting search:** Often missing the backfill step for pre-milestone meetings — verify `vec_chunks` row counts are non-zero for meetings recorded before this feature shipped, not just new ones.
- [ ] **Meeting-type templates:** Often missing an actual schema difference — verify the Zod schema for `content_json` literally has different required fields per `meeting_type`, not just a differently-worded prompt against the same schema.
- [ ] **Meeting-type templates:** Often missing a way to change/correct the template after session start — verify a user can reclassify a meeting (e.g., a "1:1" that became a planning discussion) before artifact generation runs.
- [ ] **Two-stage contract for chat:** Often missing entirely — verify chat answers go through an evidence-extraction step before generation, exactly like artifacts, not a single unconstrained completion call.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Speaker label mutated in place across tables/JSON blobs instead of using a resolution layer | HIGH | Introduce `speaker_mappings` table now; write a one-time reconciliation pass that infers original labels are unrecoverable in already-mutated JSON — best effort only; going forward, freeze all label writes and resolve at read time |
| Chat shipped without citation/grounding discipline and users report a fabricated answer | MEDIUM-HIGH | Retrofit the two-stage pattern onto chat before wider rollout; add chat to the adversarial eval harness (extend CGFS/EHR-style evaluation to chat Q&A, not just artifacts) |
| Wrong/mixed embedding provider already in `vec_chunks` | MEDIUM-HIGH | Add `model_id` column, identify affected rows, re-embed with a single canonical provider; cost scales with corpus size and re-embedding API cost |
| `artifact_type` CHECK constraint needs a genuinely new value after all | MEDIUM | Run the standard SQLite rebuild migration (new table with constraint → copy → drop → rename) inside a transaction on the encrypted DB; test thoroughly against a DB snapshot first, this cannot be done as a casual `ALTER TABLE` |
| Template picker already shipped as a mandatory blocking step and users are complaining | LOW | Change default selection to pre-filled `general` and make the step skippable/optional — a UI-only fix, no schema change needed if `meeting_type` was already nullable/defaulted |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| Speaker label denormalization across JSON blobs (#1) | Named Speaker Attribution | Rename a speaker mid-meeting; confirm the MOM export, `.ics` file, and a `vec_chunks` search result for that meeting all show the new name |
| Diarization labels not stable across meetings (#2) | Named Speaker Attribution | Confirm `speaker_mappings` is scoped by `(meeting_id, original_label)`; verify two different meetings with unrelated people both diarized as "Speaker 1" don't share a mapping |
| Chat bypassing two-stage faithfulness contract (#3) | Live Assistant Chat | Adversarial eval case: ask chat a question with no supporting transcript evidence; confirm it declines rather than fabricates, and confirm every answer carries a citation |
| Context window bloat across chat + summary consumers (#4) | Live Assistant Chat | Load-test a 60-minute meeting with periodic chat turns; confirm token counts (via `tiktoken`) stay within budget and latency doesn't grow unbounded |
| Concurrent LLM contention (chat + SummaryCardTimer) (#5) | Live Assistant Chat | Integration test: trigger a chat query at the same moment a 5-minute summary tick fires; confirm no dropped/delayed summary card and no capture stall |
| Empty `vec_chunks` for pre-milestone meetings (#6) | Cross-Meeting Semantic Search | Confirm a backfill job runs and populates `vec_chunks` for all existing meetings before the search UI ships; verify row counts match `transcript_segments` coverage |
| Mixed/incompatible embedding providers (#7) | Cross-Meeting Semantic Search | Confirm every `vec_chunks` row records its embedding model/provider; confirm a single canonical provider is enforced (hard error, not silent fallback) |
| `artifact_type` CHECK constraint wall (#8) | Meeting-Type Templates | Confirm no migration attempts `ALTER TABLE ... ADD CONSTRAINT`; confirm template variance lives inside `content_json` + a new `meetings.meeting_type` column |
| Template-aware Stage 1 extraction (#9) | Meeting-Type Templates | Code review gate: confirm Stage 1 prompt/output is identical regardless of selected `meeting_type` for the same transcript |
| Mandatory template-selection friction (#10) | Meeting-Type Templates | UX test: confirm a user can start capture with zero extra clicks beyond the existing consent gate, with `general` as the default |

## Sources

- Internal (HIGH confidence — direct architecture/contract sources, already locked for this project):
  - `.planning/phases/05-prd-finalization/05-ARCHITECTURE.md` — full DB DDL (7 tables), `speaker_label` propagation, `vec_chunks` schema, embedding provider/dims, cross-channel speaker ID anti-pattern, EmbeddingAdapter infrastructure-only status
  - `.planning/milestones/v1.0-phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md` — two-stage faithfulness contract, `CitationAnchorSchema`, proposed-with-confirm UX, conservative date handling
  - `.planning/PROJECT.md` — v3.0 milestone scope and current state
- External (MEDIUM confidence — general domain corroboration, not project-specific):
  - [SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html) — confirms CHECK constraints cannot be added/modified via `ALTER TABLE`; table-rebuild is the only supported path
  - [SQLite User Forum: change column check constraint](https://sqlite.org/forum/forumpost/1d904235f5) — community confirmation of the rebuild-only workaround
  - [Mindee — RAG hallucinations explained: causes, risks, and fixes](https://www.mindee.com/blog/rag-hallucinations-explained) — RAG reduces but does not eliminate hallucination; failure modes when retrieval is off-topic or absent
  - [Moveworks — AI grounding: how agentic RAG will help limit AI hallucinations](https://www.moveworks.com/us/en/resources/blog/improved-ai-grounding-with-agentic-rag) — grounding is necessary but not sufficient without generation constrained to retrieved evidence
  - [Weaviate — When Good Models Go Bad](https://weaviate.io/blog/when-good-models-go-bad) — embedding model changes break vector-space compatibility even at matching dimensionality
  - [TechBytes — Embedding Models for Semantic Search Cheat Sheet](https://techbytes.app/posts/embedding-models-semantic-search-2026-cheat-sheet/) — best practice of one embedding model per index unless a deliberate hybrid design is used

---
*Pitfalls research for: MeetingAssist v3.0 Advanced Assistant Features (speaker attribution, live chat, cross-meeting search, meeting-type templates)*
*Researched: 2026-07-01*
