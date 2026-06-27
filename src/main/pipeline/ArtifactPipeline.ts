import Database from 'better-sqlite3-multiple-ciphers'
import { BrowserWindow } from 'electron'
import { get_encoding } from 'tiktoken'
import { LLMAdapter } from '../llm/LLMAdapter'
import { CitationValidator } from './CitationValidator'
import { ArtifactStore } from '../store/ArtifactStore'
import {
  QuoteAnchorListSchema,
  MoMSchema,
  SummarySchema,
  KeyPointListSchema,
  ActionItemListSchema,
  MeetingArtifactsSchema,
  type QuoteAnchor,
  type MoM,
  type Summary,
  type KeyPointList,
  type ActionItemList,
  type MeetingArtifacts,
} from '../../shared/schemas'

export class ArtifactPipeline {
  private llmAdapter: LLMAdapter
  private citationValidator: CitationValidator
  private artifactStore: ArtifactStore

  constructor(
    private db: Database.Database,
    private win: BrowserWindow,
    private meetingId: string
  ) {
    this.llmAdapter = new LLMAdapter(process.env.GEMINI_API_KEY ?? '')
    this.citationValidator = new CitationValidator()
    this.artifactStore = new ArtifactStore(db)
  }

  private loadTranscript(): string {
    const rows = this.db.prepare(
      'SELECT speaker_label, timestamp_start, timestamp_end, text FROM transcript_segments WHERE meeting_id = ? ORDER BY timestamp_start ASC'
    ).all(this.meetingId) as Array<{
      speaker_label: string
      timestamp_start: number
      timestamp_end: number
      text: string
    }>

    const formatted = rows
      .map((r) => `[${r.timestamp_start}] ${r.speaker_label}: ${r.text}`)
      .join('\n')

    const enc = get_encoding('cl100k_base')
    try {
      const tokenCount = enc.encode(formatted).length
      console.log(`[ArtifactPipeline] transcript token estimate: ${tokenCount}`)
      if (tokenCount > 900000) {
        console.warn('[ArtifactPipeline] WARNING: transcript exceeds 900K token estimate — Stage 1 may fail')
      }
    } finally {
      enc.free()
    }

    return formatted
  }

  private getMeetingDate(): string {
    const row = this.db.prepare('SELECT started_at FROM meetings WHERE id = ?').get(this.meetingId) as { started_at: number } | undefined
    const startedAt = row?.started_at ?? Date.now()
    return new Date(startedAt).toISOString().split('T')[0]
  }

  private async runStage1(transcriptText: string, meetingDate: string): Promise<QuoteAnchor[]> {
    const systemPrompt = `You are a meeting transcript analyst. Your sole task is to extract verbatim passages from the transcript that could support extractable meeting artifacts: action items, decisions, deadlines, and key discussion points.

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
   - Use "inferred" when the artifact requires interpretation (e.g., "We should probably do X" — implicit soft commitment). When in doubt, use "inferred".
7. Dates: Record the raw date expression exactly as spoken ("next Friday", "by end of month"). Do NOT resolve relative dates — that happens downstream.

Meeting date (ISO 8601): ${meetingDate}

Output a JSON object with an "anchors" key containing an array of quote anchor objects. Each object MUST have:
- quote_preview: first 8-12 words of the verbatim passage
- quote_full: the complete verbatim passage
- speaker_label: exact label from transcript
- timestamp_start: number (seconds) or null
- timestamp_end: number (seconds) or null
- confidence: "direct" or "inferred"
- artifact_hint: one of ["action_item", "decision", "date", "key_point"] — your best guess at what kind of artifact this quote supports

If no extractable quotes exist in the transcript, output {"anchors": []}.`

    const result = await this.llmAdapter.generate(
      QuoteAnchorListSchema,
      'quote_anchors',
      systemPrompt,
      transcriptText
    )
    return result.anchors
  }

  private retryPromptPrefix(): string {
    return 'IMPORTANT: Your previous response contained an item that could not be verified against the source quotes. On this retry, be MORE conservative — if you are uncertain whether a claim is fully supported by the provided quotes, omit the item rather than include it.\n\n'
  }

  private async runStage2Mom(anchors: QuoteAnchor[], meetingDate: string): Promise<MoM> {
    const systemPrompt = `You are a meeting minutes writer. You will receive a JSON array of verbatim quote anchors extracted from a meeting transcript. Your task is to produce formal Minutes of Meeting (MOM) in markdown format.

ABSOLUTE RULES — READ CAREFULLY:
1. You MUST base ALL content exclusively on the provided quote anchors. You do NOT have access to the full transcript.
2. DO NOT introduce any information that is not derivable from the provided quotes. If a topic, person, or commitment does not appear in the quotes, it does not exist in this document.
3. DO NOT paraphrase quotes in a way that changes meaning. You may write natural prose that synthesizes the quotes, but every factual claim must be directly traceable to at least one provided quote.
4. Speaker attribution: use the exact speaker labels from the quotes ("You", "Speaker 1", "Speaker 2"). Do NOT substitute real names.
5. Dates: if a quote contains a relative date expression ("next Friday"), resolve it relative to the meeting date provided below. If it cannot be resolved to a specific calendar date, write the raw expression followed by "(date unresolved — confirm with participants)".
6. If the quotes do not contain enough information for a section (e.g., no decisions were made), write "None recorded" for that section. Do NOT fabricate content to fill empty sections.
7. Status: all extracted items are proposals pending user review. The MOM itself is a draft.

Meeting date (ISO 8601): ${meetingDate}

INPUT FORMAT: You will receive a JSON object with an "anchors" array where each item has: quote_full, speaker_label, timestamp_start, timestamp_end, confidence, artifact_hint.

OUTPUT FORMAT — a JSON object with a "markdown_content" key containing the full MOM as a markdown string with these sections:
# Minutes of Meeting
**Date:** ${meetingDate}
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
(Brief paragraph synthesizing confirmed action items and any follow-up dates)`

    return this.llmAdapter.generate(MoMSchema, 'minutes_of_meeting', systemPrompt, JSON.stringify({ anchors }))
  }

  private async runStage2Summary(anchors: QuoteAnchor[], meetingDate: string): Promise<Summary> {
    const systemPrompt = `You are a meeting summarizer. You will receive a JSON object with verbatim quote anchors extracted from a meeting transcript. Your task is to produce a concise, accurate meeting summary.

ABSOLUTE RULES — READ CAREFULLY:
1. You MUST base your summary EXCLUSIVELY on the provided quote anchors. You do NOT have access to the full transcript.
2. DO NOT include any information not present in the provided quotes. If an important topic was discussed but no quote was extracted for it, it does not appear in your summary.
3. DO NOT fabricate context, outcomes, or details. If the quotes are sparse, write a shorter, accurate summary rather than a longer, inaccurate one.
4. Keep the summary to 2-3 sentences maximum.
5. Write in past tense ("The team discussed...", "Attendees agreed...").
6. Do NOT include speaker labels in the summary text. The summary is an aggregate view, not an attribution log.
7. Do NOT include specific action items or dates in the summary — those belong in the action items artifact. The summary captures overall themes and outcomes only.

Meeting date (ISO 8601): ${meetingDate}

INPUT FORMAT: A JSON object with an "anchors" array of quote anchor objects (quote_full, speaker_label, confidence, artifact_hint fields).

OUTPUT FORMAT: A JSON object with a "summary_text" key containing a plain string — 2 to 3 sentences, no markdown formatting, no bullet points.`

    return this.llmAdapter.generate(SummarySchema, 'meeting_summary', systemPrompt, JSON.stringify({ anchors }))
  }

  private async runStage2KeyPoints(anchors: QuoteAnchor[], meetingDate: string): Promise<KeyPointList> {
    const systemPrompt = `You are a meeting analyst. You will receive a JSON object with verbatim quote anchors extracted from a meeting transcript. Your task is to extract the most important key points from the meeting.

ABSOLUTE RULES — READ CAREFULLY:
1. You MUST ground every key point in at least one provided quote anchor. If a key point cannot be traced to a provided quote, it MUST NOT appear in your output.
2. DO NOT generate key points from information not present in the quotes. You do NOT have access to the full transcript.
3. Each key point must be a distinct, standalone statement. Do not repeat information across key points.
4. Rank by importance: the most consequential points (decisions, commitments, critical information shared) come first.
5. Limit to a maximum of 8 key points. If fewer than 8 quotes support distinct key points, output fewer. Do NOT pad to reach 8.
6. CRITICAL — word overlap requirement: The text field MUST share at least 90% of its words with the supporting quote's quote_full. This means your key point text must be composed almost entirely of words that appear verbatim in the quote. Do NOT paraphrase or translate to third-person. Instead, use a near-verbatim excerpt of the quote, lightly trimmed if needed.
   ALLOWED: "I'll fix the session timeout issue by Wednesday, June 30th." (copied from quote)
   FORBIDDEN: "Speaker 1 committed to fixing the session timeout issue by Wednesday." (paraphrase — word overlap < 90%)
7. Speaker attribution goes in the separate speaker_label field, NOT in the text field. The text field must contain only words from the quote.

Meeting date (ISO 8601): ${meetingDate}

INPUT FORMAT: A JSON object with an "anchors" array of quote anchor objects.

OUTPUT FORMAT: A JSON object with a "key_points" array where each item has:
- text: string — near-verbatim excerpt from the quote_full (≥ 90% word overlap with the source quote required)
- speaker_label: string or null — the speaker who said it (from the anchor's speaker_label), or null for group observations
- source_quote_preview: string — copy the exact quote_preview string from the supporting anchor (verbatim copy, no modification)
- confidence: "direct" or "inferred" — inherited from the supporting anchor's confidence field`

    return this.llmAdapter.generate(KeyPointListSchema, 'key_points', systemPrompt, JSON.stringify({ anchors }))
  }

  private async runStage2ActionItems(anchors: QuoteAnchor[], meetingDate: string, retryPrefix = ''): Promise<ActionItemList> {
    const systemPrompt = `${retryPrefix}You are a meeting action item extractor. This is the most trust-critical extraction task. You will receive a JSON object with verbatim quote anchors from a meeting transcript. Your task is to extract concrete, committable action items — and ONLY those.

ABSOLUTE RULES — READ CAREFULLY:
1. You MUST ground every action item in at least one provided quote anchor. An action item with no supporting quote MUST NOT appear in your output. This is non-negotiable.
2. You MUST cite the exact quote_full from the anchor that supports the action item in the citations array. Do not paraphrase the quote in the citation.
3. DO NOT extract soft suggestions, hypothetical discussions, or future wishes. Only extract statements where a specific person (or group) explicitly committed to a specific task.
   - EXTRACT: "I'll own the backend API changes by end of week" — explicit commitment
   - DO NOT EXTRACT: "We should probably think about redesigning the dashboard" — soft suggestion, no commitment
   - DO NOT EXTRACT: "It would be great if someone looked into the pricing model" — hypothetical, no owner
4. If an action item was discussed but the owner is unclear from the quotes, set assignee_label to null. Do NOT guess or infer an owner not mentioned in the quotes.
5. Dates: use the meeting_date to resolve relative expressions ("next Friday" to ISO 8601 date). If a deadline cannot be resolved to a specific date, set due_date to null and copy the raw expression to raw_deadline_text. Do NOT fabricate a date.
6. Status is always "proposed". Never use any other value.
7. Generate a UUID v4 for each action item's id field.
8. If no extractable action items exist, output {"action_items": []}. Do NOT create placeholder or example action items.
9. The confidence field comes from the supporting quote's confidence: "direct" if the quote is an explicit commitment, "inferred" if the action item requires interpretation of the quote.

Meeting date (ISO 8601): ${meetingDate}

INPUT FORMAT: A JSON object with an "anchors" array of quote anchor objects (quote_full, speaker_label, timestamp_start, timestamp_end, confidence, artifact_hint fields).

OUTPUT FORMAT: A JSON object with an "action_items" array where each object has:
- id: string (UUID v4)
- description: string — what must be done, written clearly
- assignee_label: string or null — exact speaker label, or null if unattributed
- due_date: string or null — ISO 8601 date string (YYYY-MM-DD), or null if unresolvable. MUST include day — partial dates like "2026-06" are invalid.
- raw_deadline_text: string or null — the raw expression if due_date is null (e.g., "by end of month")
- status: "proposed" (always this value)
- is_calendar_event: boolean — set true ONLY if the item is a scheduled event/appointment (e.g., a meeting, call, demo, interview, presentation, standup). Set false for tasks with deadlines (e.g., "fix the bug by Friday", "send the report").
- citations: array with at least one item, each containing:
    - quote_preview: string (first 8-12 words of the verbatim quote)
    - quote_full: string (exact verbatim quote — copy from the anchor)
    - speaker_label: string
    - timestamp_start: number or null
    - timestamp_end: number or null
    - confidence: "direct" or "inferred"`

    return this.llmAdapter.generate(ActionItemListSchema, 'action_items', systemPrompt, JSON.stringify({ anchors }))
  }

  private async validateAndRetryActionItems(
    initialResult: ActionItemList,
    anchors: QuoteAnchor[],
    meetingDate: string
  ): Promise<ActionItemList> {
    let currentItems = initialResult.action_items
    let attempts = 1

    const allPass = (items: typeof currentItems) =>
      items.every((item) => this.citationValidator.validate(item.description, item.citations))

    if (allPass(currentItems)) {
      return { action_items: currentItems }
    }

    while (attempts < 3) {
      attempts++
      const retried = await this.runStage2ActionItems(anchors, meetingDate, this.retryPromptPrefix())
      currentItems = retried.action_items
      if (allPass(currentItems)) {
        return { action_items: currentItems }
      }
    }

    // After 2 retries, keep only passing items and log dropped ones
    const passing = currentItems.filter((item) => {
      const passes = this.citationValidator.validate(item.description, item.citations)
      if (!passes) {
        console.warn('[CitationValidator] dropped item', {
          item_id: item.id,
          artifact_type: 'action_item',
          attempts: 3,
        })
      }
      return passes
    })

    return { action_items: passing }
  }

  private validateKeyPoints(keyPoints: KeyPointList, anchors: QuoteAnchor[]): KeyPointList {
    const passing = keyPoints.key_points.filter((kp) => {
      const anchor = anchors.find((a) => a.quote_preview === kp.source_quote_preview)
      if (!anchor) {
        console.warn('[CitationValidator] dropped key_point — no matching anchor', { text: kp.text })
        return false
      }
      const passes = this.citationValidator.validate(kp.text, [{ quote_full: anchor.quote_full }])
      if (!passes) {
        console.warn('[CitationValidator] dropped key_point — score below threshold', { text: kp.text })
      }
      return passes
    })
    return { key_points: passing }
  }

  async run(): Promise<MeetingArtifacts> {
    try {
      const meetingDate = this.getMeetingDate()
      const transcriptText = this.loadTranscript()

      if (!transcriptText.trim()) {
        const empty: MeetingArtifacts = {
          meetingId: this.meetingId,
          mom: { markdown_content: '# Minutes of Meeting\n\nNo content recorded.' },
          summary: { summary_text: 'No meeting content was recorded.' },
          keyPoints: { key_points: [] },
          actionItems: { action_items: [] },
        }
        return empty
      }

      const anchors = await this.runStage1(transcriptText, meetingDate)

      if (anchors.length === 0) {
        const empty: MeetingArtifacts = {
          meetingId: this.meetingId,
          mom: { markdown_content: '# Minutes of Meeting\n\nNo actionable content extracted.' },
          summary: { summary_text: 'No actionable content was found in the meeting transcript.' },
          keyPoints: { key_points: [] },
          actionItems: { action_items: [] },
        }
        return empty
      }

      const [mom, summary, keyPoints, actionItems] = await Promise.all([
        this.runStage2Mom(anchors, meetingDate),
        this.runStage2Summary(anchors, meetingDate),
        this.runStage2KeyPoints(anchors, meetingDate),
        this.runStage2ActionItems(anchors, meetingDate),
      ])

      const validatedActionItems = await this.validateAndRetryActionItems(actionItems, anchors, meetingDate)
      const validatedKeyPoints = this.validateKeyPoints(keyPoints, anchors)

      const artifacts: MeetingArtifacts = {
        meetingId: this.meetingId,
        mom,
        summary,
        keyPoints: validatedKeyPoints,
        actionItems: validatedActionItems,
      }

      this.artifactStore.saveArtifacts(this.meetingId, artifacts)

      return artifacts
    } catch (err) {
      console.error('[ArtifactPipeline] run() failed:', err)
      return {
        meetingId: this.meetingId,
        mom: { markdown_content: '' },
        summary: { summary_text: '' },
        keyPoints: { key_points: [] },
        actionItems: { action_items: [] },
        error: true,
        errorMessage: 'Artifact generation failed — your transcript is saved',
      }
    }
  }
}
