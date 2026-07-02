import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import * as sqliteVec from 'sqlite-vec'
import type { MeetingType } from '../../src/shared/schemas'

// ---- Mock LLMAdapter --------------------------------------------------------
// ArtifactPipeline instantiates LLMAdapter internally (same precedent as
// CaptureService.test.ts mocking DeepgramClient). The mock's generate()
// dispatches a canned response per schemaName and records every
// (schemaName, systemPrompt) pair so tests can inspect exactly what prompt
// was sent for each named call — across multiple run() invocations.

const generateCalls: Array<{ schemaName: string; systemPrompt: string }> = []

vi.mock('../../src/main/llm/LLMAdapter', () => ({
  LLMAdapter: vi.fn().mockImplementation(() => ({
    generate: vi
      .fn()
      .mockImplementation(async (_schema: unknown, schemaName: string, systemPrompt: string) => {
        generateCalls.push({ schemaName, systemPrompt })
        switch (schemaName) {
          case 'quote_anchors':
            return {
              anchors: [
                {
                  quote_preview: "I'll own the Q3 planning doc by",
                  quote_full: "I'll own the Q3 planning doc by next Friday",
                  speaker_label: 'You',
                  timestamp_start: 1,
                  timestamp_end: 3,
                  confidence: 'direct',
                  artifact_hint: 'action_item',
                },
                {
                  quote_preview: 'We decided to ship the overlay redesign',
                  quote_full: 'We decided to ship the overlay redesign in the next release',
                  speaker_label: 'Speaker 1',
                  timestamp_start: 10,
                  timestamp_end: 14,
                  confidence: 'direct',
                  artifact_hint: 'decision',
                },
              ],
            }
          case 'minutes_of_meeting':
            // Deliberately NO meeting_type key — proves the pipeline stamps it
            // programmatically rather than relying on an LLM echo (D-08).
            return { markdown_content: '# stub mom' }
          case 'meeting_summary':
            return { summary_text: 'stub summary' }
          case 'key_points':
            return { key_points: [] }
          case 'action_items':
            return { action_items: [] }
          default:
            throw new Error(`unexpected schemaName: ${schemaName}`)
        }
      }),
  })),
}))

// ---- Import unit under test after mocks -------------------------------------

import { ArtifactPipeline, MOM_SECTION_SPECS } from '../../src/main/pipeline/ArtifactPipeline'
import { ALL_DDLS, runMigrations } from '../../src/main/store/db'

// ---- Helpers ----------------------------------------------------------------

function openTestDb(): Database.Database {
  const db = new Database(':memory:')
  // No PRAGMA key — in-memory, unencrypted for unit tests
  sqliteVec.load(db)
  db.exec(ALL_DDLS)
  runMigrations(db)
  return db
}

function makeMockWin() {
  return {
    webContents: { send: vi.fn() },
  } as unknown as import('electron').BrowserWindow
}

// Fixed start time so meetingDate (interpolated into every prompt) is identical
// across meetings — required for the byte-identical prompt assertions.
const FIXED_STARTED_AT = Date.UTC(2026, 0, 15, 10, 0, 0)

function seedMeeting(db: Database.Database, id: string, meetingType: MeetingType): void {
  db.prepare('INSERT INTO meetings (id, started_at, meeting_type) VALUES (?, ?, ?)').run(
    id,
    FIXED_STARTED_AT,
    meetingType
  )
}

function seedTranscript(db: Database.Database, meetingId: string): void {
  const insert = db.prepare(
    'INSERT INTO transcript_segments (id, meeting_id, speaker_label, channel, timestamp_start, timestamp_end, text) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  insert.run(`${meetingId}-seg-1`, meetingId, 'You', 'mic', 0, 3, "I'll own the Q3 planning doc by next Friday")
  insert.run(
    `${meetingId}-seg-2`,
    meetingId,
    'Speaker 1',
    'system',
    10,
    14,
    'We decided to ship the overlay redesign in the next release'
  )
}

async function runPipeline(db: Database.Database, meetingId: string) {
  const before = generateCalls.length
  const pipeline = new ArtifactPipeline(db, makeMockWin(), meetingId)
  const artifacts = await pipeline.run()
  const calls = generateCalls.slice(before)
  return { artifacts, calls }
}

function promptFor(calls: Array<{ schemaName: string; systemPrompt: string }>, name: string): string {
  const call = calls.find((c) => c.schemaName === name)
  expect(call, `expected a captured LLM call named '${name}'`).toBeDefined()
  return call!.systemPrompt
}

// ---- Tests ------------------------------------------------------------------

describe('MOM_SECTION_SPECS', () => {
  it('standup spec has standup headings and not the general headings', () => {
    expect(MOM_SECTION_SPECS.standup).toContain('## Yesterday')
    expect(MOM_SECTION_SPECS.standup).toContain('## Today')
    expect(MOM_SECTION_SPECS.standup).toContain('## Blockers')
    expect(MOM_SECTION_SPECS.standup).not.toContain('## Agenda Items Discussed')
  })

  it('1:1 spec has the 1:1 headings', () => {
    expect(MOM_SECTION_SPECS['1:1']).toContain('## Discussion Topics')
    expect(MOM_SECTION_SPECS['1:1']).toContain('## Feedback Themes')
    expect(MOM_SECTION_SPECS['1:1']).toContain('## Growth Notes')
    expect(MOM_SECTION_SPECS['1:1']).toContain('## Follow-ups')
  })

  it('planning spec has the planning headings', () => {
    expect(MOM_SECTION_SPECS.planning).toContain('## Decisions')
    expect(MOM_SECTION_SPECS.planning).toContain('## Next Steps')
    expect(MOM_SECTION_SPECS.planning).toContain('## Open Questions')
  })

  it('general spec preserves the original four headings', () => {
    expect(MOM_SECTION_SPECS.general).toContain('## Agenda Items Discussed')
    expect(MOM_SECTION_SPECS.general).toContain('## Key Discussion Points')
    expect(MOM_SECTION_SPECS.general).toContain('## Decisions Made')
    expect(MOM_SECTION_SPECS.general).toContain('## Next Steps')
  })
})

describe('run() — type-conditional MOM generation', () => {
  let db: Database.Database

  beforeEach(() => {
    db = openTestDb()
    generateCalls.length = 0
  })

  afterEach(() => {
    if (db && db.open) db.close()
  })

  it('standup meeting: minutes_of_meeting prompt has standup headings, not general headings', async () => {
    seedMeeting(db, 'mtg-standup', 'standup')
    seedTranscript(db, 'mtg-standup')

    const { artifacts, calls } = await runPipeline(db, 'mtg-standup')
    expect(artifacts.error).toBeUndefined()

    const momPrompt = promptFor(calls, 'minutes_of_meeting')
    expect(momPrompt).toContain('## Yesterday')
    expect(momPrompt).toContain('## Today')
    expect(momPrompt).toContain('## Blockers')
    expect(momPrompt).not.toContain('## Agenda Items Discussed')
    expect(momPrompt).not.toContain('## Key Discussion Points')
    expect(momPrompt).not.toContain('## Decisions Made')
  })

  it('general meeting: minutes_of_meeting prompt has the original general headings (regression)', async () => {
    seedMeeting(db, 'mtg-general', 'general')
    seedTranscript(db, 'mtg-general')

    const { artifacts, calls } = await runPipeline(db, 'mtg-general')
    expect(artifacts.error).toBeUndefined()

    const momPrompt = promptFor(calls, 'minutes_of_meeting')
    expect(momPrompt).toContain('## Agenda Items Discussed')
    expect(momPrompt).toContain('## Key Discussion Points')
    expect(momPrompt).toContain('## Decisions Made')
    expect(momPrompt).toContain('## Next Steps')
    expect(momPrompt).not.toContain('## Yesterday')
    expect(momPrompt).not.toContain('## Blockers')
  })

  it('Stage 1 quote_anchors prompt is byte-identical across meeting types (TMPL-05/D-06)', async () => {
    seedMeeting(db, 'mtg-a', 'standup')
    seedTranscript(db, 'mtg-a')
    seedMeeting(db, 'mtg-b', 'general')
    seedTranscript(db, 'mtg-b')

    const runA = await runPipeline(db, 'mtg-a')
    const runB = await runPipeline(db, 'mtg-b')

    expect(promptFor(runA.calls, 'quote_anchors')).toBe(promptFor(runB.calls, 'quote_anchors'))
  })

  it('Summary, Key Points, and Action Items prompts are each byte-identical across meeting types (D-05)', async () => {
    seedMeeting(db, 'mtg-a', 'standup')
    seedTranscript(db, 'mtg-a')
    seedMeeting(db, 'mtg-b', 'general')
    seedTranscript(db, 'mtg-b')

    const runA = await runPipeline(db, 'mtg-a')
    const runB = await runPipeline(db, 'mtg-b')

    for (const name of ['meeting_summary', 'key_points', 'action_items']) {
      expect(promptFor(runA.calls, name)).toBe(promptFor(runB.calls, name))
    }
  })

  it('stamps mom.meeting_type from the DB even though the mocked LLM response has no meeting_type (D-08)', async () => {
    seedMeeting(db, 'mtg-1on1', '1:1')
    seedTranscript(db, 'mtg-1on1')

    const { artifacts } = await runPipeline(db, 'mtg-1on1')

    expect(artifacts.error).toBeUndefined()
    expect(artifacts.mom.markdown_content).toBe('# stub mom')
    expect(artifacts.mom.meeting_type).toBe('1:1')
  })

  it('empty-transcript early return preserves the seeded non-general meeting_type', async () => {
    seedMeeting(db, 'mtg-empty', 'planning')
    // no transcript_segments rows seeded — empty-transcript early return path

    const { artifacts, calls } = await runPipeline(db, 'mtg-empty')

    expect(calls).toHaveLength(0) // early return before any LLM call
    expect(artifacts.mom.meeting_type).toBe('planning')
  })
})
