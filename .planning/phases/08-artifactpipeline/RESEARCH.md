# Phase 8: ArtifactPipeline — Research

**Researched:** 2026-06-27
**Domain:** LLM-powered end-of-meeting artifact extraction pipeline (Gemini 2.5 Flash via OpenAI SDK, two-stage extraction, CitationValidator, ArtifactReview UI)
**Confidence:** HIGH on architecture and prompts (grounded in locked specs); MEDIUM on Q1 strict-mode behavior (Gemini docs are in beta state); HIGH on Q2 token counting; HIGH on Q3 eval recommendation.

---

## Q1: Gemini 2.5 Flash Structured Output (OpenAI-compatible endpoint)

### Confirmed Working Pattern

The project uses the `openai` SDK with `baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'`. Gemini's OpenAI-compatibility endpoint does accept `response_format: { type: 'json_schema', json_schema: { ... } }`. The official Gemini docs show the following pattern as the recommended TypeScript approach via the compatibility layer:

```typescript
// Source: https://ai.google.dev/gemini-api/docs/openai (OpenAI compatibility tab)
import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
})

// OPTION A — preferred: use zodResponseFormat helper (Zod → json_schema internally)
const completion = await client.beta.chat.completions.parse({
  model: 'gemini-2.5-flash',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ],
  response_format: zodResponseFormat(MyZodSchema, 'my_schema_name'),
})
const result = completion.choices[0].message.parsed // already parsed by SDK

// OPTION B — manual json_schema (use if parse() is not available for some schemas)
const completion2 = await client.chat.completions.create({
  model: 'gemini-2.5-flash',
  messages: [...],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'MeetingArtifacts',   // required field
      schema: zodToJsonSchema(MyZodSchema),  // the JSON Schema object
      strict: true,               // see gotcha below
    },
  },
})
const raw = JSON.parse(completion2.choices[0].message.content!)
```

### `strict: true` — Known Behavior

[CITED: github.com/BerriAI/litellm/issues/15995] The `strict: true` field inside `json_schema` is **silently ignored by Gemini's OpenAI-compatibility layer**. Gemini enforces its own schema at the API level via `responseJsonSchema` (the native parameter the compatibility layer translates to), so the model still returns schema-conformant JSON — but it is enforced by Gemini's mechanism, not OpenAI's strict-mode constraint solver.

**Practical effect:** Schema conformance is still enforced; the model returns JSON that matches the schema. The difference from OpenAI strict mode is that Gemini does not perform the OpenAI-specific preprocessing (flattening refs, banning certain schema constructs). Include `strict: true` in the payload anyway — it is harmless and communicates intent — but do not rely on it for features that are OpenAI-strict-only (e.g., `additionalProperties: false` as the sole enforcement of closed objects).

[ASSUMED] Gemini applies its own equivalent of strict enforcement by virtue of using `responseJsonSchema` under the hood; schema violations result in a well-formed JSON response that may omit optional fields but will not add extra fields.

### `zod-to-json-schema` Gotchas for Gemini

**Critical finding:** The project's `package.json` does not currently include `zod`, `zod-to-json-schema`, or `openai` in `dependencies`. All three must be added in Phase 8.

**Zod version matters enormously:**

- [CITED: github.com/colinhacks/zod/issues/5807] `zod-to-json-schema` v3.x was built for **Zod v3**. The project must decide whether to use Zod v3 (with `zod-to-json-schema`) or Zod v4 (with the native `z.toJSONSchema()` built-in).
- [CITED: buildwithmatija.com/blog/zod-v4-gemini-fix-structured-output-z-tojsonschema] Using `zod-to-json-schema` with Zod v4 **silently produces incomplete schemas** — the library does not throw, it returns a malformed schema that omits `properties`, `type`, and `required`, causing Gemini to ignore structured output constraints entirely.

**Recommendation: Use Zod v3 + `zod-to-json-schema` v3.x** (matching the locked-in CLAUDE.md convention `zod` + `zod-to-json-schema`). This pairing is stable and well-tested. Do not install Zod v4 alongside `zod-to-json-schema` — the combination fails silently.

**`additionalProperties` gotcha:** The `zod-to-json-schema` library by default emits `additionalProperties: false` on object schemas when `strict` mode is enabled in the converter. Gemini added support for `additionalProperties` in November 2025 [CITED: blog.google/technology/developers/gemini-api-structured-outputs/], so this is no longer a blocker — but call `zodToJsonSchema(schema, { $refStrategy: 'none' })` to flatten `$ref` references, which Gemini handles less reliably than OpenAI.

### Exact LLMAdapter Call Pattern for Phase 8

```typescript
import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import zodToJsonSchema from 'zod-to-json-schema'
import { QuoteAnchorListSchema, MoMSchema, SummarySchema, KeyPointListSchema, ActionItemListSchema } from '../../shared/schemas'

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
})

// Stage 1 call
const stage1 = await client.beta.chat.completions.parse({
  model: 'gemini-2.5-flash',
  messages: [
    { role: 'system', content: STAGE1_SYSTEM_PROMPT },
    { role: 'user', content: transcriptText },
  ],
  response_format: zodResponseFormat(QuoteAnchorListSchema, 'quote_anchors'),
})
const quoteAnchors = stage1.choices[0].message.parsed

// Stage 2 — parallel, each uses its own schema
const [mom, summary, keyPoints, actionItems] = await Promise.all([
  client.beta.chat.completions.parse({
    model: 'gemini-2.5-flash',
    messages: [
      { role: 'system', content: STAGE2_MOM_PROMPT },
      { role: 'user', content: JSON.stringify(quoteAnchors) },
    ],
    response_format: zodResponseFormat(MoMSchema, 'minutes_of_meeting'),
  }),
  // ... summary, keyPoints, actionItems calls
])
```

**Why `client.beta.chat.completions.parse`:** This is the OpenAI SDK helper that automatically calls `JSON.parse` and runs Zod validation on the response, giving you a typed `parsed` field. It is safer than manually parsing `choices[0].message.content`. Google's compatibility endpoint supports this call pattern.

### Summary: What Works, What Doesn't

| Feature | Works via baseURL adapter | Notes |
|---------|--------------------------|-------|
| `response_format: { type: 'json_schema', ... }` | Yes | Translated to Gemini `responseJsonSchema` |
| `zodResponseFormat(schema, name)` helper | Yes | Preferred approach |
| `strict: true` inside `json_schema` | Silently ignored | Harmless to include; Gemini enforces via its own mechanism |
| `$ref` references in schema | Unreliable | Use `{ $refStrategy: 'none' }` in zodToJsonSchema |
| `additionalProperties: false` | Supported (since Nov 2025) | Gemini API now supports this keyword |
| Zod v4 + `zod-to-json-schema` | Broken | Silent malformed schema — do not combine |

---

## Q2: tiktoken Encoding for Gemini 2.5 Flash

### Gemini 2.5 Flash Context Window

[CITED: ai.google.dev/gemini-api/docs/models] Gemini 2.5 Flash: **1,048,576 tokens input** (~1M), **65,535 tokens output** (~64K). The 800K rolling window ceiling adopted in the architecture (04-AI-SPEC.md §2.4) leaves ~248K headroom — this is conservative and appropriate.

### tiktoken cl100k_base Accuracy for Gemini

Gemini uses a SentencePiece Unigram tokenizer with a ~256K vocabulary — different from OpenAI's BPE cl100k_base (~100K vocabulary). [ASSUMED, corroborated by multiple sources] cl100k_base overcounts Gemini tokens by approximately 5–10% for standard English prose (meeting transcripts, business language). This means cl100k_base produces a conservative (safe) estimate — it will trigger the epoch compression threshold earlier than strictly necessary, which is the correct failure mode.

**The 04-AI-SPEC.md (§2.4, Assumption A7) already acknowledges this:** "Gemini may have a different tokenization that diverges significantly from cl100k_base; a Gemini-specific tokenizer is preferable if available."

### Is There a Closer Encoding?

[ASSUMED] There is no publicly released, browser/Node-runnable Gemini tokenizer as of the research date. Google's tokenizer is proprietary and only accessible via the `countTokens` REST API endpoint:

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:countTokens
x-goog-api-key: $GEMINI_API_KEY
Content-Type: application/json

{ "contents": [{ "parts": [{ "text": "<transcript text>" }] }] }
```

[CITED: ai.google.dev/gemini-api/docs/tokens] Returns `{ "totalTokens": N }`.

### Concrete Implementation Guidance

**Use `tiktoken cl100k_base` as the primary token counter** for the rolling window monitor. This is:
1. The CLAUDE.md-mandated approach
2. Correct failure direction — overestimates, so epoch compression fires slightly early (conservative = safe)
3. Already calibrated in the 04-AI-SPEC.md architecture with appropriate headroom margins

**Add a 10% safety margin to the trigger threshold.** The architecture uses 70% of 800K = 560K tokens as the epoch compression trigger. With cl100k_base overcounting Gemini tokens by ~5–10%, the actual Gemini token count at 560K cl100k tokens is approximately 504K–532K Gemini tokens — well under the true 800K ceiling. This is intentional and correct.

**For Stage 1 (full transcript in one call):** A 30-minute meeting generates approximately 8–15K transcript tokens (cl100k_base estimate). The Stage 1 system prompt adds ~500–1000 tokens. Total call: ~10–16K tokens against a 1M context window. This is 1–2% of capacity — no concern whatsoever. Token counting for Stage 1 is only needed to surface a warning if a meeting is extraordinarily long.

**Recommended token budget check before Stage 1:**
```typescript
import { get_encoding } from 'tiktoken'
const enc = get_encoding('cl100k_base')

const transcriptTokens = enc.encode(transcriptText).length
const STAGE1_PROMPT_TOKENS = 800  // conservative estimate for system prompt
const GEMINI_OUTPUT_HEADROOM = 8000  // max Stage 1 output (quote list)
const CONTEXT_CEILING = 900_000  // 900K of 1M = 90% ceiling (conservative)

if (transcriptTokens + STAGE1_PROMPT_TOKENS + GEMINI_OUTPUT_HEADROOM > CONTEXT_CEILING) {
  // Log warning: extremely long meeting — chunking may be needed
  // For v1 with D-01 decision (no chunking), log and proceed
}
enc.free()
```

**For the rolling window (ContextEngine, not ArtifactPipeline):** Use cl100k_base with the 70% (560K) trigger. The 5–10% overcount means the true Gemini token usage is ~5–10% lower than the counter reports — epoch compression fires slightly early, which is safe.

**Verdict:** cl100k_base is the correct encoding to use. Do not attempt to integrate Google's `countTokens` endpoint into the real-time rolling window monitor — the network round-trip per transcript segment would add unacceptable latency. Use `countTokens` only in the eval harness or for post-hoc billing estimates.

---

## Q3: Eval Corpus Seeding in Phase 8

### Recommendation: YES — seed 10 fixture files in Phase 8

**Rationale:** Phase 11 requires 60 `AdversarialTestCase` JSON files. If seeding starts in Phase 11, the eval harness author faces a cold-start problem: they need test fixtures to iterate against, but building the corpus is its own labor. Starting in Phase 8, when prompts are actively being designed and edge cases are fresh in mind, produces better fixture quality with less additional effort.

**How many cases:** 10 files — covering the 2 highest-risk categories. This is ~17% of the total corpus, enough to run the harness meaningfully during Phase 8 verification.

**Which categories (from AI-SPEC §3.3):**

| Category | Count | Rationale for Phase 8 |
|----------|-------|----------------------|
| `standard_sync` | 4 | Baseline behavior: normal 30-60 min meeting, 4-6 speakers, mixed action items and decisions. Required to establish a CGFS baseline during Phase 8 verification. |
| `fabrication_bait` | 4 | Highest trust risk: transcripts with plausible-but-unspoken commitments adjacent to real ones. Stage 1 + 2 prompts are being designed in Phase 8 — this is the best time to validate they resist fabrication. |
| `short_no_content` | 2 | Null case: meeting with no actionable content. Verifies the pipeline correctly returns empty arrays rather than hallucinating artifacts. Critical correctness check. |

**Defer to later phases:** `action_item_dense`, `date_heavy`, `high_speaker_count`, `attribution_bait`, `implicit_inference_traps` — 50 files. These require the pipeline to be running (Phase 8 output) and are better seeded once the baseline is stable.

### Minimal `AdversarialTestCase` JSON Structure

Per AI-SPEC §3.6, the file format is:

```json
{
  "transcript_id": "test_01_standard_sync",
  "category": "standard_sync",
  "transcript": "[00:00] You: Let's start. We need to finish the dashboard by Friday...\n[00:45] Speaker 1: I'll own the backend API changes. Target is end of week.\n[01:20] Speaker 2: The design mockups are done, I'll send them over today...",
  "ground_truth": {
    "action_items": [
      {
        "description": "Complete backend API changes",
        "assignee_label": "Speaker 1",
        "due_date": "2026-06-30",
        "source_quote": "I'll own the backend API changes. Target is end of week."
      }
    ],
    "decisions": [],
    "dates": [
      {
        "description": "Dashboard completion deadline",
        "date": "2026-06-26",
        "raw_date_text": "by Friday",
        "source_quote": "We need to finish the dashboard by Friday"
      }
    ]
  }
}
```

**For fabrication_bait, add the `adversarial_injections` field:**

```json
{
  "transcript_id": "test_05_fabrication_bait_01",
  "category": "fabrication_bait",
  "transcript": "[00:00] You: We should probably think about refreshing the brand...\n[01:15] Speaker 1: Yeah, we've discussed that before. Anyway, for the roadmap — I'll own the Q3 planning doc.\n...",
  "ground_truth": {
    "action_items": [
      {
        "description": "Own the Q3 planning document",
        "assignee_label": "Speaker 1",
        "due_date": null,
        "source_quote": "I'll own the Q3 planning doc."
      }
    ],
    "decisions": [],
    "dates": []
  },
  "adversarial_injections": [
    {
      "description": "Brand refresh is discussed informally but no one commits to it — model must not extract a brand refresh action item",
      "expected_behavior": "not-extracted"
    }
  ]
}
```

**File locations:** `eval/corpus/test_01_standard_sync.json` through `test_10_short_no_content_02.json`.

**Effort estimate:** 10 fixture files at ~30 minutes each (writing realistic transcript + ground truth) = ~5 hours. Include as a dedicated wave-0 task in the Phase 8 plan.

**Note on meeting_date injection:** Each fixture's transcript should include a header line `[Meeting date: 2026-06-26]` or the harness should inject `meeting_date` when calling the pipeline. This is required per AI-SPEC §1.4 (relative date resolution rule).

---

## Q4: LLM Prompt Design

### Design Principles (grounding all 5 prompts)

1. **Transcript injection pattern:** The full transcript goes in the `user` message, not the system message. The system message contains only instructions and constraints. This pattern separates instructions from data, which reduces prompt injection risk (AI-SPEC §7, Pitfall: prompt injection via transcript content).

2. **Meeting date injection:** Every prompt includes `meeting_date` in the system message. Relative dates ("next Friday") are resolved against `meeting_date`, not the model's training cutoff (AI-SPEC §1.4 conservative date handling rule).

3. **Speaker label format:** Use diarization labels as-is ("You", "Speaker 1", "Speaker 2", etc.). Do not attempt to infer real names — v1 uses speaker labels throughout (deferred item in 08-CONTEXT.md).

4. **Verbatim constraint (Stage 1):** Stage 1 must explicitly prohibit paraphrasing. The most common failure mode is the model "polishing" a quote (AI-SPEC §1.7, Pitfall 1 warning signs: "grammatically polished versions of messy real speech").

5. **Quote-only constraint (Stage 2):** Stage 2 must state that it receives ONLY the extracted quotes from Stage 1, that the full transcript is not available, and that any claim not derivable from the provided quotes must be omitted.

---

### Stage 1: Quote Extraction

**Purpose:** Extract verbatim transcript passages that support extractable artifacts (action items, decisions, dates, key discussion points). Output is a structured list of `CitationAnchor` objects. No artifact content is generated.

```
SYSTEM PROMPT — Stage 1: Verbatim Quote Extraction

You are a meeting transcript analyst. Your sole task is to extract verbatim passages from the transcript that could support extractable meeting artifacts: action items, decisions, deadlines, and key discussion points.

ABSOLUTE RULES — READ CAREFULLY:
1. You MUST copy quote text VERBATIM from the transcript. Exact words only.
   - ALLOWED: "I'll own the Q3 planning doc" (copied exactly from transcript)
   - FORBIDDEN: "Speaker 1 will handle Q3 planning" (paraphrase — not allowed)
   - FORBIDDEN: "I'll own the Q3 planning document" (word substitution — not allowed)
2. Do NOT generate, infer, or paraphrase. Only extract.
3. Do NOT include any statement that is not an extractable artifact. Casual small talk, filler phrases, and purely informational statements that commit no one to anything should be omitted.
4. For each quote, record the exact speaker label from the transcript ("You", "Speaker 1", "Speaker 2", etc.).
5. For timestamps: use the start and end seconds from the meeting start that appear in the transcript segment. If timestamps are not present in the transcript, set timestamp_start and timestamp_end to null.
6. For the confidence field:
   - Use "direct" when the quote is an explicit, unambiguous statement (e.g., "I'll do X by Friday").
   - Use "inferred" when the artifact requires interpretation (e.g., "We should probably do X" → implicit soft commitment). When in doubt, use "inferred".
7. Dates: Record the raw date expression exactly as spoken ("next Friday", "by end of month"). Do NOT resolve relative dates — that happens downstream.

Meeting date (ISO 8601): {{MEETING_DATE}}

Output a JSON array of quote anchor objects. Each object MUST have:
- quote_preview: first 8–12 words of the verbatim passage
- quote_full: the complete verbatim passage
- speaker_label: exact label from transcript
- timestamp_start: number (seconds) or null
- timestamp_end: number (seconds) or null
- confidence: "direct" or "inferred"
- artifact_hint: one of ["action_item", "decision", "date", "key_point"] — your best guess at what kind of artifact this quote supports

If no extractable quotes exist in the transcript, output an empty array [].
```

---

### Stage 2a: Minutes of Meeting (MOM)

**Purpose:** Generate full Minutes of Meeting in markdown format, grounded exclusively in Stage 1 quote anchors. No access to full transcript.

```
SYSTEM PROMPT — Stage 2a: Minutes of Meeting Generation

You are a meeting minutes writer. You will receive a JSON array of verbatim quote anchors extracted from a meeting transcript. Your task is to produce formal Minutes of Meeting (MOM) in markdown format.

ABSOLUTE RULES — READ CAREFULLY:
1. You MUST base ALL content exclusively on the provided quote anchors. You do NOT have access to the full transcript.
2. DO NOT introduce any information that is not derivable from the provided quotes. If a topic, person, or commitment does not appear in the quotes, it does not exist in this document.
3. DO NOT paraphrase quotes in a way that changes meaning. You may write natural prose that synthesizes the quotes, but every factual claim must be directly traceable to at least one provided quote.
4. Speaker attribution: use the exact speaker labels from the quotes ("You", "Speaker 1", "Speaker 2"). Do NOT substitute real names.
5. Dates: if a quote contains a relative date expression ("next Friday"), resolve it relative to the meeting date provided below. If it cannot be resolved to a specific calendar date, write the raw expression followed by "(date unresolved — confirm with participants)".
6. If the quotes do not contain enough information for a section (e.g., no decisions were made), write "None recorded" for that section. Do NOT fabricate content to fill empty sections.
7. Status: all extracted items are proposals pending user review. The MOM itself is a draft.

Meeting date (ISO 8601): {{MEETING_DATE}}

INPUT FORMAT: You will receive a JSON array where each item has: quote_full, speaker_label, timestamp_start, timestamp_end, confidence, artifact_hint.

OUTPUT FORMAT — Markdown MOM with these sections:
# Minutes of Meeting
**Date:** {{MEETING_DATE}}
**Generated:** (leave blank — filled by system)

## Attendees
(List speaker labels present in the quotes)

## Agenda Items Discussed
(Bullet list of topics, each grounded in at least one quote)

## Key Discussion Points
(Bullet list of significant discussion points, each grounded in quotes — cite the speaker label)

## Decisions Made
(Numbered list — if none, write "None recorded")

## Action Items
(Table: | # | Description | Owner | Due Date | Quote Reference |)
(If no action items, write "None recorded")

## Next Steps
(Brief paragraph synthesizing confirmed action items and any follow-up dates)
```

---

### Stage 2b: Meeting Summary

**Purpose:** Generate a concise 2–3 sentence meeting summary grounded exclusively in Stage 1 quote anchors.

```
SYSTEM PROMPT — Stage 2b: Meeting Summary

You are a meeting summarizer. You will receive a JSON array of verbatim quote anchors extracted from a meeting transcript. Your task is to produce a concise, accurate meeting summary.

ABSOLUTE RULES — READ CAREFULLY:
1. You MUST base your summary EXCLUSIVELY on the provided quote anchors. You do NOT have access to the full transcript.
2. DO NOT include any information not present in the provided quotes. If an important topic was discussed but no quote was extracted for it, it does not appear in your summary.
3. DO NOT fabricate context, outcomes, or details. If the quotes are sparse, write a shorter, accurate summary rather than a longer, inaccurate one.
4. Keep the summary to 2–3 sentences maximum.
5. Write in past tense ("The team discussed...", "Attendees agreed...").
6. Do NOT include speaker labels in the summary text. The summary is an aggregate view, not an attribution log.
7. Do NOT include specific action items or dates in the summary — those belong in the action items artifact. The summary captures overall themes and outcomes only.

Meeting date (ISO 8601): {{MEETING_DATE}}

INPUT FORMAT: A JSON array of quote anchor objects (quote_full, speaker_label, confidence, artifact_hint fields).

OUTPUT FORMAT: A plain string — 2 to 3 sentences, no markdown formatting, no bullet points.
```

---

### Stage 2c: Key Points

**Purpose:** Generate a structured list of key discussion points, each grounded in a Stage 1 quote anchor.

```
SYSTEM PROMPT — Stage 2c: Key Points Extraction

You are a meeting analyst. You will receive a JSON array of verbatim quote anchors extracted from a meeting transcript. Your task is to extract the most important key points from the meeting.

ABSOLUTE RULES — READ CAREFULLY:
1. You MUST ground every key point in at least one provided quote anchor. If a key point cannot be traced to a provided quote, it MUST NOT appear in your output.
2. DO NOT generate key points from information not present in the quotes. You do NOT have access to the full transcript.
3. Each key point must be a distinct, standalone statement. Do not repeat information across key points.
4. Rank by importance: the most consequential points (decisions, commitments, critical information shared) come first.
5. Limit to a maximum of 8 key points. If fewer than 8 quotes support distinct key points, output fewer. Do NOT pad to reach 8.
6. Write each key point as a single, clear sentence in past tense.
7. Include the speaker label for attribution when the point is a direct statement from one speaker ("Speaker 1 confirmed that..."). For group-level observations, no attribution needed.

Meeting date (ISO 8601): {{MEETING_DATE}}

INPUT FORMAT: A JSON array of quote anchor objects.

OUTPUT FORMAT: A JSON array of key point objects, each with:
- text: string — the key point sentence
- speaker_label: string or null — attribution (null for group observations)
- source_quote_preview: string — the quote_preview from the anchor that supports this point
- confidence: "direct" or "inferred" — inherited from the supporting anchor's confidence field
```

---

### Stage 2d: Action Items

**Purpose:** Extract structured action items with owner, due date, and quote anchor, grounded exclusively in Stage 1 quotes. This is the highest-trust artifact — fabricated action items are the worst failure mode.

```
SYSTEM PROMPT — Stage 2d: Action Item Extraction

You are a meeting action item extractor. This is the most trust-critical extraction task. You will receive a JSON array of verbatim quote anchors from a meeting transcript. Your task is to extract concrete, committable action items — and ONLY those.

ABSOLUTE RULES — READ CAREFULLY:
1. You MUST ground every action item in at least one provided quote anchor. An action item with no supporting quote MUST NOT appear in your output. This is non-negotiable.
2. You MUST cite the exact quote_full from the anchor that supports the action item in the citations array. Do not paraphrase the quote in the citation.
3. DO NOT extract soft suggestions, hypothetical discussions, or future wishes. Only extract statements where a specific person (or group) explicitly committed to a specific task.
   - EXTRACT: "I'll own the backend API changes by end of week" — explicit commitment
   - DO NOT EXTRACT: "We should probably think about redesigning the dashboard" — soft suggestion, no commitment
   - DO NOT EXTRACT: "It would be great if someone looked into the pricing model" — hypothetical, no owner
4. If an action item was discussed but the owner is unclear from the quotes, set assignee_label to null. Do NOT guess or infer an owner not mentioned in the quotes.
5. Dates: use the meeting_date to resolve relative expressions ("next Friday" → ISO 8601 date). If a deadline cannot be resolved to a specific date, set due_date to null and copy the raw expression to raw_deadline_text. Do NOT fabricate a date.
6. Status is always "proposed". Never use any other value.
7. Generate a UUID v4 for each action item's id field.
8. If no extractable action items exist, output an empty array []. Do NOT create placeholder or example action items.
9. The confidence field comes from the supporting quote's confidence:
   - "direct" if the quote is an explicit commitment
   - "inferred" if the action item requires interpretation of the quote

Meeting date (ISO 8601): {{MEETING_DATE}}

INPUT FORMAT: A JSON array of quote anchor objects (quote_full, speaker_label, timestamp_start, timestamp_end, confidence, artifact_hint fields).

OUTPUT FORMAT: A JSON array where each object has:
- id: string (UUID v4)
- description: string — what must be done, written clearly
- assignee_label: string or null — exact speaker label, or null if unattributed
- due_date: string or null — ISO 8601 date string, or null if unresolvable
- raw_deadline_text: string or null — the raw expression if due_date is null (e.g., "by end of month")
- status: "proposed" (always this value)
- citations: array with at least one item, each containing:
    - quote_preview: string (first 8–12 words of the verbatim quote)
    - quote_full: string (exact verbatim quote — copy from the anchor)
    - speaker_label: string
    - timestamp_start: number or null
    - timestamp_end: number or null
    - confidence: "direct" or "inferred"
```

---

## Prompt Usage Notes for Planner

**Template variable substitution:** Replace `{{MEETING_DATE}}` with the meeting's `started_at` value formatted as ISO 8601 (e.g., `2026-06-27`). This is available from the `meetings` table.

**Retry prompt variant for Stage 2 (CitationValidator failure):** When a Stage 2 item fails CitationValidator (Jaccard < 0.90) and triggers a retry (up to 2 retries per D-10), prepend this to the system prompt: `"IMPORTANT: Your previous response contained an item that could not be verified against the source quotes. On this retry, be MORE conservative — if you are uncertain whether a claim is fully supported by the provided quotes, omit the item rather than include it."` This tightens constraints on retry without a full prompt rewrite.

**Stage 1 output size estimate:** A 30-minute meeting produces approximately 15–40 quote anchors in Stage 1. Each anchor is ~200–400 tokens. Total Stage 1 output: ~3K–16K tokens — well within the 65K output limit.

**Stage 2 input size estimate:** Passing 15–40 quote anchors as Stage 2 input: ~3K–16K tokens of input, plus the system prompt (~600 tokens). Total per Stage 2 call: ~4K–17K tokens in, ~1K–5K tokens out. All four Stage 2 calls in parallel: ~16K–68K total tokens across all calls.

---

## Open Questions Remaining

**OQ-1: `client.beta.chat.completions.parse` vs `client.chat.completions.create`**

The `.parse()` method is available on the `openai` beta namespace and handles JSON parsing + Zod validation automatically. However, it depends on the OpenAI SDK version and may have edge-case differences when used with Gemini's compatibility endpoint. **Recommendation for planner:** Default to `.parse()`. Add a fallback in `LLMAdapter` that catches parse errors and falls back to `JSON.parse(choices[0].message.content)` + manual Zod validation via `schema.parse(raw)`.

**OQ-2: `openai` SDK version pinning**

The project does not yet have `openai` in `dependencies`. The SDK version matters for `zodResponseFormat` and `.parse()` availability (these are in `openai` >= 4.50). **Recommendation:** Pin to `openai@^4.77.0` (the version range known to include all beta structured output helpers). Verify the exact latest stable version at install time.

**OQ-3: Stage 1 empty output handling**

If Stage 1 returns an empty array (meeting with no extractable content), Stage 2 receives an empty quotes array. Each Stage 2 prompt handles this correctly (see "output an empty array" instructions), but the pipeline must short-circuit: if Stage 1 returns `[]`, skip Stage 2 entirely and push `artifact-proposals-ready` with all-empty arrays. This saves ~4 LLM calls on no-content meetings.

**OQ-4: Zod version — final decision needed before coding**

The planner must decide: Zod v3 (install `zod@^3.23` + `zod-to-json-schema@^3.23`) or Zod v4 (install `zod@^4.x`, use native `z.toJSONSchema()`, do not install `zod-to-json-schema`). Both work with Gemini. The CLAUDE.md references `zod` + `zod-to-json-schema` as the stack, implying v3. The planner should standardize on **Zod v3 + zod-to-json-schema** to match CLAUDE.md. If Zod v4 is adopted, remove `zod-to-json-schema` from the spec entirely and update CLAUDE.md.

---

## Package Legitimacy Audit

Packages to be installed in Phase 8 (not yet in `package.json`):

| Package | Purpose | Legitimacy |
|---------|---------|------------|
| `openai` | LLM adapter SDK | OK — official OpenAI SDK, npm registry |
| `zod` | Schema validation | OK — well-established, >5M weekly downloads |
| `zod-to-json-schema` | Zod v3 → JSON Schema converter | OK — maintained library, pairs with Zod v3 |
| `tiktoken` | Token counting (cl100k_base) | OK — official OpenAI tokenizer package |
| `ics` | .ics calendar export | OK — established calendar library |
| `uuid` | UUID generation for artifact IDs | OK or use `crypto.randomUUID()` built-in (Node 18+ / Electron) |

**Recommendation:** Use `crypto.randomUUID()` (built into Node 24/Electron 42) instead of the `uuid` npm package — saves a dependency.

---

## Sources

### Primary
- [CITED: ai.google.dev/gemini-api/docs/openai] — OpenAI compatibility endpoint documentation, zodResponseFormat example
- [CITED: ai.google.dev/gemini-api/docs/tokens] — countTokens REST endpoint spec
- [CITED: blog.google/technology/developers/gemini-api-structured-outputs/] — November 2025 JSON Schema keyword additions (additionalProperties, anyOf, $ref, type:null)
- [CITED: 04-AI-SPEC.md] — Two-stage extraction protocol, CitationAnchorSchema, AdversarialTestCase format, eval corpus categories (§3.6)
- [CITED: 08-CONTEXT.md] — Phase decisions D-01 through D-13

### Secondary
- [CITED: github.com/colinhacks/zod/issues/5807] — Zod v4 incompatibility with zod-to-json-schema
- [CITED: github.com/BerriAI/litellm/issues/15995] — `strict: true` silently ignored by Gemini responses API
- [CITED: github.com/googleapis/python-genai/issues/1815] — additionalProperties SDK validation vs API support distinction
- [CITED: ai.google.dev/gemini-api/docs/models] — Gemini 2.5 Flash context window (1,048,576 tokens input)
- [CITED: glukhov.org/post/2025/10/structured-output-comparison-popular-llm-providers] — Gemini strict JSON enforcement confirmation

### Tertiary (training knowledge, cross-checked against above)
- [ASSUMED] cl100k_base overcounts Gemini tokens by ~5–10% for English prose — consistent with multiple secondary sources but no official benchmark from Google
- [ASSUMED] Gemini enforces responseJsonSchema server-side equivalently to OpenAI strict mode — not officially documented, inferred from behavior reports
