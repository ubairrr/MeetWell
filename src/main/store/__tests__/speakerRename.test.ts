import { describe, it, expect } from 'vitest'
import {
  escapeRegExp,
  buildWordBoundaryRegex,
  escapeReplacement,
  renameInContentJson,
  renameKeyedContributions,
  reconstructMeetingArtifacts,
} from '../speakerRename'

describe('speakerRename', () => {
  describe('escapeRegExp', () => {
    it('escapes every regex metacharacter so the result is safe inside new RegExp()', () => {
      const escaped = escapeRegExp('Speaker 1 (lead)')
      expect(() => new RegExp(escaped)).not.toThrow()
      expect(escaped).toBe('Speaker 1 \\(lead\\)')
      // Sanity: the escaped pattern matches only the literal string, not as a group
      expect(new RegExp(escaped).test('Speaker 1 (lead)')).toBe(true)
    })
  })

  describe('buildWordBoundaryRegex', () => {
    it('matches "Speaker 1" as a whole word in prose and in parentheses', () => {
      const regex = buildWordBoundaryRegex('Speaker 1')
      expect('Speaker 1 said hello').toMatch(regex)
      expect('(Speaker 1)').toMatch(regex)
    })

    it('does not spuriously consume the trailing "0" in "Speaker 10"', () => {
      const regex = buildWordBoundaryRegex('Speaker 1')
      const result = 'Speaker 10 said hello'.replace(regex, 'X')
      // \b after "1" fails to match before "0" (both word chars) — no replacement occurs
      expect(result).toBe('Speaker 10 said hello')
    })
  })

  describe('escapeReplacement', () => {
    it('preserves literal dollar signs through String.prototype.replace', () => {
      const safe = escapeReplacement('Sam $$ Lee')
      const result = 'Speaker 1 said hi'.replace(/Speaker 1/, safe)
      expect(result).toBe('Sam $$ Lee said hi')
    })
  })

  describe('renameInContentJson', () => {
    it('rewrites "Speaker 1" mid-sentence, escapes quotes/backslashes safely, leaves other values untouched', () => {
      const raw = JSON.stringify({
        markdown_content: 'Speaker 1 opened the meeting. Speaker 2 disagreed.',
      })
      const result = renameInContentJson(raw, 'Speaker 1', 'Jane "JJ" Doe')

      expect(() => JSON.parse(result)).not.toThrow()
      const parsed = JSON.parse(result) as { markdown_content: string }
      expect(parsed.markdown_content).toContain('Jane "JJ" Doe')
      expect(parsed.markdown_content).toContain('Speaker 2 disagreed')
      expect(parsed.markdown_content).not.toMatch(/\bSpeaker 1\b/)
    })

    it('rewrites "Speaker 1" nested inside an array of citation-shaped objects', () => {
      const raw = JSON.stringify({
        action_items: [
          { id: 'a1', citations: [{ speaker_label: 'Speaker 1', quote_full: 'I will do it' }] },
          { id: 'a2', citations: [{ speaker_label: 'Speaker 2', quote_full: 'Sounds good' }] },
        ],
      })
      const result = renameInContentJson(raw, 'Speaker 1', 'Jane Doe')
      const parsed = JSON.parse(result) as {
        action_items: Array<{ id: string; citations: Array<{ speaker_label: string; quote_full: string }> }>
      }
      expect(parsed.action_items[0].citations[0].speaker_label).toBe('Jane Doe')
      expect(parsed.action_items[1].citations[0].speaker_label).toBe('Speaker 2')
    })
  })

  describe('renameKeyedContributions', () => {
    it('renames the exact-match KEY and substring-replaces within VALUE strings, leaving other keys untouched', () => {
      const raw = JSON.stringify({
        'Speaker 1': 'led the discussion',
        'Speaker 2': 'mentioned Speaker 1 agreed with the plan',
      })
      const result = renameKeyedContributions(raw, 'Speaker 1', 'Jane Doe')
      const parsed = JSON.parse(result) as Record<string, string>

      expect(parsed['Jane Doe']).toBe('led the discussion')
      expect(parsed['Speaker 1']).toBeUndefined()
      expect(parsed['Speaker 2']).toBe('mentioned Jane Doe agreed with the plan')
    })
  })

  describe('reconstructMeetingArtifacts', () => {
    it('rebuilds a MeetingArtifacts-shaped object from matching artifact_type rows', () => {
      const rows = [
        { artifact_type: 'mom', content_json: JSON.stringify({ markdown_content: '# MOM' }) },
        { artifact_type: 'summary', content_json: JSON.stringify({ summary_text: 'Summary text' }) },
        { artifact_type: 'key_points', content_json: JSON.stringify({ key_points: [] }) },
        { artifact_type: 'action_items', content_json: JSON.stringify({ action_items: [] }) },
      ]
      const result = reconstructMeetingArtifacts('mtg-1', rows)
      expect(result.meetingId).toBe('mtg-1')
      expect(result.mom.markdown_content).toBe('# MOM')
      expect(result.summary.summary_text).toBe('Summary text')
      expect(result.keyPoints.key_points).toEqual([])
      expect(result.actionItems.action_items).toEqual([])
    })

    it('falls back to empty-but-valid shapes for any missing artifact_type', () => {
      const result = reconstructMeetingArtifacts('mtg-2', [])
      expect(result.meetingId).toBe('mtg-2')
      expect(result.mom).toEqual({ markdown_content: '' })
      expect(result.summary).toEqual({ summary_text: '' })
      expect(result.keyPoints).toEqual({ key_points: [] })
      expect(result.actionItems).toEqual({ action_items: [] })
    })
  })
})
