import { z } from 'zod'

export type { SessionState } from '../../main/session/SessionManager'

export const TranscriptSegmentSchema = z.object({
  id: z.string(),
  meeting_id: z.string(),
  speaker_label: z.string(),
  channel: z.enum(['mic', 'system']),
  timestamp_start: z.number(),
  timestamp_end: z.number(),
  text: z.string(),
  confidence: z.number().nullable().optional(),
})
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>

export const QuoteAnchorSchema = z.object({
  quote_preview: z.string(),
  quote_full: z.string(),
  speaker_label: z.string(),
  timestamp_start: z.number().nullable(),
  timestamp_end: z.number().nullable(),
  confidence: z.enum(['direct', 'inferred']),
  artifact_hint: z.enum(['action_item', 'decision', 'date', 'key_point']),
})
export type QuoteAnchor = z.infer<typeof QuoteAnchorSchema>

export const QuoteAnchorListSchema = z.object({ anchors: z.array(QuoteAnchorSchema) })
export type QuoteAnchorList = z.infer<typeof QuoteAnchorListSchema>

export const MoMSchema = z.object({
  markdown_content: z.string(),
})
export type MoM = z.infer<typeof MoMSchema>

export const SummarySchema = z.object({
  summary_text: z.string(),
})
export type Summary = z.infer<typeof SummarySchema>

export const KeyPointSchema = z.object({
  text: z.string(),
  speaker_label: z.string().nullable(),
  source_quote_preview: z.string(),
  confidence: z.enum(['direct', 'inferred']),
})
export type KeyPoint = z.infer<typeof KeyPointSchema>

export const KeyPointListSchema = z.object({ key_points: z.array(KeyPointSchema) })
export type KeyPointList = z.infer<typeof KeyPointListSchema>

export const CitationRefSchema = z.object({
  quote_preview: z.string(),
  quote_full: z.string(),
  speaker_label: z.string(),
  timestamp_start: z.number().nullable(),
  timestamp_end: z.number().nullable(),
  confidence: z.enum(['direct', 'inferred']),
})
export type CitationRef = z.infer<typeof CitationRefSchema>

export const ActionItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  assignee_label: z.string().nullable(),
  due_date: z.string().nullable(),
  raw_deadline_text: z.string().nullable(),
  status: z.literal('proposed'),
  is_calendar_event: z.boolean().default(false),
  citations: z.array(CitationRefSchema).min(1),
})
export type ActionItem = z.infer<typeof ActionItemSchema>

export const ActionItemListSchema = z.object({ action_items: z.array(ActionItemSchema) })
export type ActionItemList = z.infer<typeof ActionItemListSchema>

export const MeetingArtifactsSchema = z.object({
  meetingId: z.string(),
  mom: MoMSchema,
  summary: SummarySchema,
  keyPoints: KeyPointListSchema,
  actionItems: ActionItemListSchema,
  error: z.boolean().optional(),
  errorMessage: z.string().optional(),
})
export type MeetingArtifacts = z.infer<typeof MeetingArtifactsSchema>
