import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import * as sqliteVec from 'sqlite-vec'
import { ALL_DDLS, runMigrations } from '../db'
import { SpeakerAliasStore } from '../SpeakerAliasStore'

// ---------------------------------------------------------------------------
// In-memory database helper — mirrors tests/unit/TranscriptStore.test.ts
// ---------------------------------------------------------------------------
function openTestDb(): Database.Database {
  const db = new Database(':memory:')
  sqliteVec.load(db)
  db.exec(ALL_DDLS)
  runMigrations(db)
  return db
}

function seedMeeting(db: Database.Database, meetingId: string): void {
  db.prepare('INSERT INTO meetings (id, started_at) VALUES (?, ?)').run(meetingId, Date.now())
}

function seedArtifact(
  db: Database.Database,
  id: string,
  meetingId: string,
  artifactType: string,
  contentJson: string
): void {
  db.prepare(
    'INSERT INTO artifacts (id, meeting_id, artifact_type, content_json) VALUES (?, ?, ?, ?)'
  ).run(id, meetingId, artifactType, contentJson)
}

function seedActionItem(
  db: Database.Database,
  id: string,
  meetingId: string,
  assigneeLabel: string | null,
  citationsJson: string
): void {
  db.prepare(
    'INSERT INTO action_items (id, meeting_id, description, assignee_label, citations_json) VALUES (?, ?, ?, ?, ?)'
  ).run(id, meetingId, 'Do the thing', assigneeLabel, citationsJson)
}

function seedSummaryCard(
  db: Database.Database,
  id: string,
  meetingId: string,
  speakerContributionsJson: string
): void {
  db.prepare(
    `INSERT INTO summary_cards
      (id, meeting_id, card_index, interval_start_seconds, interval_end_seconds, wall_time_label,
       topic_headline, key_points_json, action_items_mentioned_json, speaker_contributions_json,
       model_used, generated_at)
     VALUES (?, ?, 0, 0, 300, '0:00-5:00', 'Topic', '[]', '[]', ?, 'gemini-2.5-flash', '2026-07-02T00:00:00Z')`
  ).run(id, meetingId, speakerContributionsJson)
}

function seedEpochSummary(
  db: Database.Database,
  id: string,
  meetingId: string,
  speakerAttributionsJson: string
): void {
  db.prepare(
    `INSERT INTO epoch_summaries
      (id, meeting_id, covered_interval_start, covered_interval_end, decisions_json, action_items_json,
       key_points_json, speaker_attributions_json, raw_segment_count, token_count_compressed, created_at)
     VALUES (?, ?, 0, 300, '[]', '[]', '[]', ?, 10, 500, '2026-07-02T00:00:00Z')`
  ).run(id, meetingId, speakerAttributionsJson)
}

describe('SpeakerAliasStore', () => {
  let db: Database.Database
  let store: SpeakerAliasStore

  beforeEach(() => {
    db = openTestDb()
    store = new SpeakerAliasStore(db)
  })

  afterEach(() => {
    if (db && db.open) db.close()
  })

  it('propagates a rename into artifacts.content_json for the target meeting', () => {
    seedMeeting(db, 'mtg-1')
    seedArtifact(db, 'art-1', 'mtg-1', 'mom', JSON.stringify({ markdown_content: 'Speaker 1 opened the call.' }))

    store.applyRenames('mtg-1', { 'Speaker 1': 'Jane Doe' })

    const row = db.prepare('SELECT content_json FROM artifacts WHERE id = ?').get('art-1') as {
      content_json: string
    }
    const parsed = JSON.parse(row.content_json) as { markdown_content: string }
    expect(parsed.markdown_content).toContain('Jane Doe')
    expect(parsed.markdown_content).not.toMatch(/\bSpeaker 1\b/)
  })

  it('propagates into action_items.assignee_label AND action_items.citations_json in the same call', () => {
    seedMeeting(db, 'mtg-1')
    seedActionItem(
      db,
      'ai-1',
      'mtg-1',
      'Speaker 1',
      JSON.stringify([{ speaker_label: 'Speaker 1', quote_full: 'I will do it' }])
    )

    store.applyRenames('mtg-1', { 'Speaker 1': 'Jane Doe' })

    const row = db.prepare('SELECT assignee_label, citations_json FROM action_items WHERE id = ?').get('ai-1') as {
      assignee_label: string
      citations_json: string
    }
    expect(row.assignee_label).toBe('Jane Doe')
    const citations = JSON.parse(row.citations_json) as Array<{ speaker_label: string }>
    expect(citations[0].speaker_label).toBe('Jane Doe')
  })

  it('propagates into summary_cards.speaker_contributions_json and epoch_summaries.speaker_attributions_json', () => {
    seedMeeting(db, 'mtg-1')
    seedSummaryCard(db, 'sc-1', 'mtg-1', JSON.stringify({ 'Speaker 1': 'led the discussion' }))
    seedEpochSummary(db, 'es-1', 'mtg-1', JSON.stringify({ 'Speaker 1': 'agreed with the plan' }))

    store.applyRenames('mtg-1', { 'Speaker 1': 'Jane Doe' })

    const scRow = db
      .prepare('SELECT speaker_contributions_json FROM summary_cards WHERE id = ?')
      .get('sc-1') as { speaker_contributions_json: string }
    const esRow = db
      .prepare('SELECT speaker_attributions_json FROM epoch_summaries WHERE id = ?')
      .get('es-1') as { speaker_attributions_json: string }

    expect(JSON.parse(scRow.speaker_contributions_json)).toEqual({ 'Jane Doe': 'led the discussion' })
    expect(JSON.parse(esRow.speaker_attributions_json)).toEqual({ 'Jane Doe': 'agreed with the plan' })
  })

  it('upserts a speaker_aliases row for the rename', () => {
    seedMeeting(db, 'mtg-1')

    store.applyRenames('mtg-1', { 'Speaker 1': 'Jane Doe' })

    const row = db
      .prepare('SELECT meeting_id, original_label, display_name FROM speaker_aliases WHERE meeting_id = ? AND original_label = ?')
      .get('mtg-1', 'Speaker 1') as { meeting_id: string; original_label: string; display_name: string }
    expect(row).toEqual({ meeting_id: 'mtg-1', original_label: 'Speaker 1', display_name: 'Jane Doe' })
  })

  it('a second rename with the same original_label updates from the currently effective name, not the stale label', () => {
    seedMeeting(db, 'mtg-1')
    seedArtifact(db, 'art-1', 'mtg-1', 'mom', JSON.stringify({ markdown_content: 'Speaker 1 opened the call.' }))

    store.applyRenames('mtg-1', { 'Speaker 1': 'Jane Doe' })
    store.applyRenames('mtg-1', { 'Speaker 1': 'Jane Q. Doe' })

    const row = db.prepare('SELECT content_json FROM artifacts WHERE id = ?').get('art-1') as {
      content_json: string
    }
    const parsed = JSON.parse(row.content_json) as { markdown_content: string }
    expect(parsed.markdown_content).toContain('Jane Q. Doe')
    expect(parsed.markdown_content).not.toContain('Speaker 1')

    const aliasRow = db
      .prepare('SELECT display_name FROM speaker_aliases WHERE meeting_id = ? AND original_label = ?')
      .get('mtg-1', 'Speaker 1') as { display_name: string }
    expect(aliasRow.display_name).toBe('Jane Q. Doe')
  })

  it('leaves another meeting\'s rows byte-for-byte unchanged (SPKR-05 cross-meeting isolation)', () => {
    seedMeeting(db, 'mtg-1')
    seedMeeting(db, 'mtg-2')

    const sharedContent = JSON.stringify({ markdown_content: 'Speaker 1 opened the call.' })
    seedArtifact(db, 'art-1', 'mtg-1', 'mom', sharedContent)
    seedArtifact(db, 'art-2', 'mtg-2', 'mom', sharedContent)

    seedActionItem(db, 'ai-1', 'mtg-1', 'Speaker 1', JSON.stringify([{ speaker_label: 'Speaker 1' }]))
    seedActionItem(db, 'ai-2', 'mtg-2', 'Speaker 1', JSON.stringify([{ speaker_label: 'Speaker 1' }]))

    seedSummaryCard(db, 'sc-1', 'mtg-1', JSON.stringify({ 'Speaker 1': 'led' }))
    seedSummaryCard(db, 'sc-2', 'mtg-2', JSON.stringify({ 'Speaker 1': 'led' }))

    seedEpochSummary(db, 'es-1', 'mtg-1', JSON.stringify({ 'Speaker 1': 'agreed' }))
    seedEpochSummary(db, 'es-2', 'mtg-2', JSON.stringify({ 'Speaker 1': 'agreed' }))

    store.applyRenames('mtg-1', { 'Speaker 1': 'Jane Doe' })

    const art2 = db.prepare('SELECT content_json FROM artifacts WHERE id = ?').get('art-2') as {
      content_json: string
    }
    const ai2 = db.prepare('SELECT assignee_label, citations_json FROM action_items WHERE id = ?').get('ai-2') as {
      assignee_label: string
      citations_json: string
    }
    const sc2 = db.prepare('SELECT speaker_contributions_json FROM summary_cards WHERE id = ?').get('sc-2') as {
      speaker_contributions_json: string
    }
    const es2 = db.prepare('SELECT speaker_attributions_json FROM epoch_summaries WHERE id = ?').get('es-2') as {
      speaker_attributions_json: string
    }

    expect(art2.content_json).toBe(sharedContent)
    expect(ai2.assignee_label).toBe('Speaker 1')
    expect(ai2.citations_json).toBe(JSON.stringify([{ speaker_label: 'Speaker 1' }]))
    expect(sc2.speaker_contributions_json).toBe(JSON.stringify({ 'Speaker 1': 'led' }))
    expect(es2.speaker_attributions_json).toBe(JSON.stringify({ 'Speaker 1': 'agreed' }))

    const mtg2Alias = db
      .prepare('SELECT * FROM speaker_aliases WHERE meeting_id = ?')
      .all('mtg-2')
    expect(mtg2Alias).toHaveLength(0)
  })

  it('a mapping entry whose new name equals the current effective name is a no-op', () => {
    seedMeeting(db, 'mtg-1')
    store.applyRenames('mtg-1', { 'Speaker 1': 'Jane Doe' })

    const beforeRow = db
      .prepare('SELECT display_name, updated_at FROM speaker_aliases WHERE meeting_id = ? AND original_label = ?')
      .get('mtg-1', 'Speaker 1') as { display_name: string; updated_at: number }

    // Re-apply the exact same name — should be a no-op (no UPDATE fires, updated_at unchanged)
    store.applyRenames('mtg-1', { 'Speaker 1': 'Jane Doe' })

    const afterRow = db
      .prepare('SELECT display_name, updated_at FROM speaker_aliases WHERE meeting_id = ? AND original_label = ?')
      .get('mtg-1', 'Speaker 1') as { display_name: string; updated_at: number }

    expect(afterRow.display_name).toBe(beforeRow.display_name)
    expect(afterRow.updated_at).toBe(beforeRow.updated_at)
  })

  it('getAlias returns null before any rename, and the last-saved display_name after applyRenames', () => {
    seedMeeting(db, 'mtg-1')
    expect(store.getAlias('mtg-1', 'Speaker 1')).toBeNull()

    store.applyRenames('mtg-1', { 'Speaker 1': 'Jane Doe' })
    expect(store.getAlias('mtg-1', 'Speaker 1')).toBe('Jane Doe')

    store.applyRenames('mtg-1', { 'Speaker 1': 'Jane Q. Doe' })
    expect(store.getAlias('mtg-1', 'Speaker 1')).toBe('Jane Q. Doe')
  })
})
