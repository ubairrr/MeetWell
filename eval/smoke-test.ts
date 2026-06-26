// eval/smoke-test.ts
// Run with: npx ts-node eval/smoke-test.ts <fixture_path>
// Example: npx ts-node eval/smoke-test.ts eval/corpus/test_01_standard_sync_01.json

import Database from 'better-sqlite3-multiple-ciphers'
import { ALL_DDLS } from '../src/main/store/db'
import { ArtifactPipeline } from '../src/main/pipeline/ArtifactPipeline'
import * as fs from 'fs'
import * as crypto from 'crypto'

const fixturePath = process.argv[2]
if (!fixturePath) {
  console.error('Usage: npx ts-node eval/smoke-test.ts <fixture_path>')
  process.exit(1)
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))

const db = new Database(':memory:')

let ddls = ALL_DDLS
let vecLoaded = false
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sqliteVec = require('sqlite-vec')
  sqliteVec.load(db)
  vecLoaded = true
} catch {
  console.warn('[smoke-test] sqlite-vec not available — vec_chunks table will be skipped')
}

if (!vecLoaded) {
  ddls = ALL_DDLS.replace(
    /CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks[\s\S]*?;/,
    '-- vec_chunks skipped (sqlite-vec not available)'
  )
}

db.exec(ddls)

const meetingId = crypto.randomUUID()
const now = Date.now()
db.prepare('INSERT INTO meetings (id, title, started_at, created_at) VALUES (?, ?, ?, ?)').run(
  meetingId, 'Smoke Test Meeting', now, now
)

const lines = fixture.transcript.split('\n').filter((l: string) => l.trim() && !l.startsWith('[Meeting date:'))
lines.forEach((line: string) => {
  const match = line.match(/^\[(\d+):(\d+)\]\s+(.+?):\s+(.+)$/)
  if (!match) return
  const [, minStr, secStr, speaker, text] = match
  const ts = parseInt(minStr, 10) * 60 + parseInt(secStr, 10)
  db.prepare(
    'INSERT INTO transcript_segments (id, meeting_id, speaker_label, channel, timestamp_start, timestamp_end, text, is_speech_final, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
  ).run(crypto.randomUUID(), meetingId, speaker, 'mic', ts, ts + 30, text, now)
})

console.log(`[smoke-test] Inserted ${lines.length} transcript segments for meeting ${meetingId}`)
console.log('[smoke-test] Running ArtifactPipeline...')

const mockWin = { webContents: { send: (...args: unknown[]) => console.log('[smoke-test] IPC push:', args[0]) } } as any

const pipeline = new ArtifactPipeline(db, mockWin, meetingId)
pipeline.run().then((result) => {
  console.log('\n[smoke-test] Pipeline complete. Proposals:')
  console.log(JSON.stringify(result, null, 2))
  db.close()
  process.exit(0)
}).catch((err: unknown) => {
  console.error('[smoke-test] Pipeline failed:', err)
  db.close()
  process.exit(1)
})
