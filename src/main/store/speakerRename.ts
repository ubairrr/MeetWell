import type { MeetingArtifacts } from '../../shared/schemas'

// ---------------------------------------------------------------------------
// speakerRename.ts — pure functions for JSON-safe speaker-label propagation
// ---------------------------------------------------------------------------
// Source pattern: 12-RESEARCH.md "Pattern 1: Deep-walk JSON string-value
// replace" / "Pattern 2: Dict-keyed propagation". Never regex over raw
// serialized JSON text — always JSON.parse -> deep-walk-mutate decoded
// string values -> JSON.stringify, so quotes/backslashes in a new display
// name round-trip safely.
// ---------------------------------------------------------------------------

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildWordBoundaryRegex(label: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(label)}\\b`, 'g')
}

// $ has special meaning in the *replacement* string of String.replace
// (e.g. "$&", "$1", "$$"). A user-entered display name containing a
// literal "$" must be escaped or it corrupts unrelated matches.
export function escapeReplacement(s: string): string {
  return s.replace(/\$/g, '$$$$')
}

export function renameInValue(value: unknown, regex: RegExp, safeReplacement: string): unknown {
  if (typeof value === 'string') return value.replace(regex, safeReplacement)
  if (Array.isArray(value)) return value.map((v) => renameInValue(v, regex, safeReplacement))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = renameInValue(v, regex, safeReplacement)
    }
    return out
  }
  return value
}

// Safe entry point: parse -> walk -> stringify. JSON.stringify handles all
// necessary escaping of quotes/backslashes in the new name automatically —
// a raw regex.replace() on the *serialized* JSON string would NOT.
export function renameInContentJson(rawJson: string, fromLabel: string, toName: string): string {
  const parsed = JSON.parse(rawJson)
  const regex = buildWordBoundaryRegex(fromLabel)
  const mutated = renameInValue(parsed, regex, escapeReplacement(toName))
  return JSON.stringify(mutated)
}

// speaker_contributions_json / speaker_attributions_json are
// Record<speakerLabel, string> — the label is an exact-match object KEY,
// not a substring inside prose. Key rename is exact string equality, not
// regex; values still get the same substring pass in case the
// contribution text itself mentions the label.
export function renameKeyedContributions(rawJson: string, fromLabel: string, toName: string): string {
  const parsed = JSON.parse(rawJson) as Record<string, string>
  const regex = buildWordBoundaryRegex(fromLabel)
  const safeReplacement = escapeReplacement(toName)
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(parsed)) {
    const newKey = key === fromLabel ? toName : key
    out[newKey] = typeof val === 'string' ? val.replace(regex, safeReplacement) : val
  }
  return JSON.stringify(out)
}

// Rebuilds a MeetingArtifacts-shaped object from ArtifactStore.getArtifacts()'s
// row shape, falling back to an empty-but-valid shape for any artifact_type
// missing from rows.
export function reconstructMeetingArtifacts(
  meetingId: string,
  rows: Array<{ artifact_type: string; content_json: string }>
): MeetingArtifacts {
  const byType = new Map<string, string>()
  for (const row of rows) byType.set(row.artifact_type, row.content_json)

  const momJson = byType.get('mom')
  const summaryJson = byType.get('summary')
  const keyPointsJson = byType.get('key_points')
  const actionItemsJson = byType.get('action_items')

  return {
    meetingId,
    mom: momJson ? JSON.parse(momJson) : { markdown_content: '' },
    summary: summaryJson ? JSON.parse(summaryJson) : { summary_text: '' },
    keyPoints: keyPointsJson ? JSON.parse(keyPointsJson) : { key_points: [] },
    actionItems: actionItemsJson ? JSON.parse(actionItemsJson) : { action_items: [] },
  }
}
