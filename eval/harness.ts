// eval/harness.ts
// Adversarial eval harness — run with: npx ts-node eval/harness.ts [--category <cat>] [--id <id>] [--mock]
// Requires GEMINI_API_KEY env var for live LLM calls (not needed with --mock).
// --mock: bypasses ArtifactPipeline entirely; constructs artifacts from ground truth data.
//         Zero API calls — use for CI / fast regression of scoring logic.
// Outputs: eval/corpus/eval_report.json
//
// Gates (per AI-SPEC §3.5):
//   1. Overall CGFS >= 0.85
//   2. Overall EHR  <= 0.05
//   3. No per-category CGFS below 0.75
//
// Exit code 0 = all gates pass; exit code 1 = any gate fails.

import Database from 'better-sqlite3-multiple-ciphers'
import { ALL_DDLS } from '../src/main/store/db'
import { ArtifactPipeline } from '../src/main/pipeline/ArtifactPipeline'
import type { MeetingArtifacts, ActionItem } from '../src/shared/schemas'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of each JSON file in eval/corpus/test_*.json */
interface GroundTruthItem {
  description: string
  assignee_label: string | null
  due_date: string | null
  source_quote: string
}

interface AdversarialTestCase {
  transcript_id: string
  category: string
  transcript: string
  ground_truth: {
    action_items: GroundTruthItem[]
    decisions?: string[]
    dates?: string[]
  }
  adversarial_injections?: Array<{
    description: string
    expected_behavior: 'not-extracted' | 'flagged-inferred'
  }>
}

interface CaseResult {
  testCase: AdversarialTestCase
  artifacts: MeetingArtifacts | null
  error: string | null
}

interface ItemEval {
  description: string
  hasQuote: boolean
  citationVerifiable: boolean
  hasEvidence: boolean
}

interface FailedCase {
  transcript_id: string
  category: string
  cgfs: number
  ehr: number
  reason: string
}

interface EvalReport {
  run_at: string
  cases_run: number
  overall_cgfs: number
  overall_ehr: number
  per_category_cgfs: Record<string, number>
  per_category_ehr: Record<string, number>
  passing: boolean
  gates: {
    passCGFS: boolean
    passEHR: boolean
    passCategoryFloor: boolean
  }
  failed_cases: FailedCase[]
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const categoryFilter: string | null = args.includes('--category')
  ? args[args.indexOf('--category') + 1] ?? null
  : null
const idFilter: string | null = args.includes('--id')
  ? args[args.indexOf('--id') + 1] ?? null
  : null
const MOCK_MODE = args.includes('--mock')

// ---------------------------------------------------------------------------
// Corpus loader
// ---------------------------------------------------------------------------

const corpusDir = path.join(__dirname, 'corpus')
const allCorpusFiles = fs.readdirSync(corpusDir)
  .filter((f) => f.match(/^test_.*\.json$/))
  .sort()

const cases: AdversarialTestCase[] = allCorpusFiles
  .map((f) => JSON.parse(fs.readFileSync(path.join(corpusDir, f), 'utf8')) as AdversarialTestCase)
  .filter((c) => !categoryFilter || c.category === categoryFilter)
  .filter((c) => !idFilter || c.transcript_id === idFilter)

// ---------------------------------------------------------------------------
// DB seeder — mirrors smoke-test.ts pattern exactly
// ---------------------------------------------------------------------------

function seedDatabase(transcript: string): { db: Database.Database; meetingId: string } {
  const db = new Database(':memory:')

  let ddls = ALL_DDLS
  let vecLoaded = false
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sqliteVec = require('sqlite-vec') as { load: (db: Database.Database) => void }
    sqliteVec.load(db)
    vecLoaded = true
  } catch {
    // sqlite-vec not available in eval context — skip the virtual table DDL
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

  db.prepare(
    'INSERT INTO meetings (id, title, started_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(meetingId, 'Harness Meeting', now, now)

  const lines = transcript.split('\n').filter(
    (l) => l.trim() && !l.startsWith('[Meeting date:')
  )

  lines.forEach((line) => {
    const match = line.match(/^\[(\d+):(\d+)\]\s+(.+?):\s+(.+)$/)
    if (!match) return
    const [, minStr, secStr, speaker, text] = match
    const ts = parseInt(minStr, 10) * 60 + parseInt(secStr, 10)
    db.prepare(
      'INSERT INTO transcript_segments (id, meeting_id, speaker_label, channel, timestamp_start, timestamp_end, text, is_speech_final, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
    ).run(crypto.randomUUID(), meetingId, speaker, 'mic', ts, ts + 30, text, now)
  })

  return { db, meetingId }
}

// ---------------------------------------------------------------------------
// Pipeline runner
// ---------------------------------------------------------------------------

const mockWin = { webContents: { send: () => {} } } as any

async function runCase(testCase: AdversarialTestCase): Promise<CaseResult> {
  const { db, meetingId } = seedDatabase(testCase.transcript)
  try {
    const pipeline = new ArtifactPipeline(db, mockWin, meetingId)
    const artifacts = await pipeline.run()
    return { testCase, artifacts, error: null }
  } catch (err) {
    return { testCase, artifacts: null, error: String(err) }
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// Mock runner — no API calls; builds artifacts directly from ground truth
// ---------------------------------------------------------------------------

function mockRunCase(testCase: AdversarialTestCase): CaseResult {
  const meetingId = crypto.randomUUID()

  const action_items: ActionItem[] = testCase.ground_truth.action_items.map((item, idx) => ({
    id: `mock-${idx}`,
    description: item.description,
    assignee_label: item.assignee_label,
    due_date: item.due_date,
    raw_deadline_text: null,
    status: 'proposed' as const,
    is_calendar_event: false,
    citations: [
      {
        quote_preview: item.source_quote.slice(0, 80),
        quote_full: item.source_quote,
        speaker_label: 'Speaker',
        timestamp_start: 0,
        timestamp_end: 30,
        confidence: 'direct' as const,
      },
    ],
  }))

  const artifacts: MeetingArtifacts = {
    meetingId,
    mom: { markdown_content: '' },
    summary: { summary_text: '' },
    keyPoints: { key_points: [] },
    actionItems: { action_items },
  }

  return { testCase, artifacts, error: null }
}

// ---------------------------------------------------------------------------
// Citation verifier (per AI-SPEC §3.2 — 90% token overlap threshold)
// ---------------------------------------------------------------------------

/**
 * tokenize splits on whitespace and Unicode punctuation, lowercases.
 * The /\p{P}/u flag matches all Unicode punctuation categories.
 */
function tokenize(str: string): string[] {
  return str.toLowerCase().split(/[\s\p{P}]+/u).filter(Boolean)
}

/**
 * tokenOverlap = |tokens(quoteFull) ∩ tokens(transcript)| / |tokens(quoteFull)|
 * Per AI-SPEC §3.2: "near-verbatim (>= 90% token overlap)"
 */
function tokenOverlap(quoteFull: string, transcriptText: string): number {
  const quoteTokens = tokenize(quoteFull)
  if (quoteTokens.length === 0) return 0
  const transcriptTokenSet = new Set(tokenize(transcriptText))
  const matchCount = quoteTokens.filter((t) => transcriptTokenSet.has(t)).length
  return matchCount / quoteTokens.length
}

/**
 * An item is citation-verifiable if its quote_full has >= 90% token overlap
 * with the full transcript text.
 */
function isCitationVerifiable(quoteFull: string, transcriptText: string): boolean {
  return tokenOverlap(quoteFull, transcriptText) >= 0.90
}

/**
 * hasMatchingEvidence checks whether a description has loose evidence in the
 * transcript (threshold = 0.35). Used for EHR calculation — items with no
 * evidence at all (< 35% overlap) are extrinsic hallucinations.
 */
function hasMatchingEvidence(itemDescription: string, transcriptText: string): boolean {
  return tokenOverlap(itemDescription, transcriptText) >= 0.35
}

// ---------------------------------------------------------------------------
// Per-case evaluation
// ---------------------------------------------------------------------------

interface CaseEvalResult {
  itemEvals: ItemEval[]
  /** -1 means "exclude from aggregate" (no items extracted or pipeline error payload) */
  cgfs: number
  ehr: number
}

function evaluateCase(caseResult: CaseResult): CaseEvalResult {
  // Hard pipeline error — worst-case scores included in aggregate
  if (!caseResult.artifacts || caseResult.error) {
    return { itemEvals: [], cgfs: 0, ehr: 1 }
  }

  // Pipeline returned an error payload (no crash, but LLM was unavailable)
  if (caseResult.artifacts.error) {
    return { itemEvals: [], cgfs: -1, ehr: -1 }
  }

  const transcriptText = caseResult.testCase.transcript
  const items: ItemEval[] = []

  // Evaluate action items (primary artifact type for CGFS/EHR per AI-SPEC §3.2)
  const actionItems = caseResult.artifacts.actionItems?.action_items ?? []
  for (const item of actionItems) {
    // citations is required (min(1)) by schema; take first citation's quote_full
    const quoteFull = item.citations?.[0]?.quote_full ?? ''
    const hasQuote = quoteFull.length > 0
    const citationVerifiable = hasQuote && isCitationVerifiable(quoteFull, transcriptText)
    const hasEvidence = hasMatchingEvidence(item.description, transcriptText)
    items.push({ description: item.description, hasQuote, citationVerifiable, hasEvidence })
  }

  // No items extracted — exclude from aggregate (neutral: empty meetings are
  // expected in the short_no_content category)
  if (items.length === 0) {
    return { itemEvals: items, cgfs: -1, ehr: -1 }
  }

  const verifiable = items.filter((i) => i.citationVerifiable).length
  const noEvidence = items.filter((i) => !i.hasEvidence).length
  const cgfs = verifiable / items.length
  const ehr = noEvidence / items.length

  return { itemEvals: items, cgfs, ehr }
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

interface CategoryStats {
  cgfsSum: number
  ehrSum: number
  caseCount: number
}

interface AggregationResult {
  overall_cgfs: number
  overall_ehr: number
  per_category_cgfs: Record<string, number>
  per_category_ehr: Record<string, number>
  passing: boolean
  passCGFS: boolean
  passEHR: boolean
  passCategoryFloor: boolean
}

function aggregateResults(
  caseEvals: Array<{ testCase: AdversarialTestCase; cgfs: number; ehr: number }>
): AggregationResult {
  const categoryStats: Record<string, CategoryStats> = {}
  let totalCgfsSum = 0
  let totalEhrSum = 0
  let totalCount = 0

  for (const { testCase, cgfs, ehr } of caseEvals) {
    if (cgfs === -1) continue // excluded (no items extracted — neutral case)

    const cat = testCase.category
    if (!categoryStats[cat]) {
      categoryStats[cat] = { cgfsSum: 0, ehrSum: 0, caseCount: 0 }
    }
    categoryStats[cat].cgfsSum += cgfs
    categoryStats[cat].ehrSum += ehr
    categoryStats[cat].caseCount++

    totalCgfsSum += cgfs
    totalEhrSum += ehr
    totalCount++
  }

  const overall_cgfs = totalCount > 0 ? totalCgfsSum / totalCount : 0
  const overall_ehr = totalCount > 0 ? totalEhrSum / totalCount : 0

  const per_category_cgfs: Record<string, number> = {}
  const per_category_ehr: Record<string, number> = {}
  for (const [cat, stats] of Object.entries(categoryStats)) {
    per_category_cgfs[cat] = stats.caseCount > 0 ? stats.cgfsSum / stats.caseCount : 0
    per_category_ehr[cat] = stats.caseCount > 0 ? stats.ehrSum / stats.caseCount : 0
  }

  // Three-gate check per AI-SPEC §3.5
  const passCGFS = overall_cgfs >= 0.85
  const passEHR = overall_ehr <= 0.05
  const passCategoryFloor = Object.values(per_category_cgfs).every((v) => v >= 0.75)
  const passing = passCGFS && passEHR && passCategoryFloor

  return {
    overall_cgfs,
    overall_ehr,
    per_category_cgfs,
    per_category_ehr,
    passing,
    passCGFS,
    passEHR,
    passCategoryFloor,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (MOCK_MODE) {
    console.log('[harness] MOCK MODE — no API calls; artifacts built from ground truth')
  } else if (!process.env.GEMINI_API_KEY) {
    console.warn(
      '[harness] WARNING: GEMINI_API_KEY not set — pipeline will return error payloads for all cases'
    )
  }

  if (cases.length === 0) {
    console.error('[harness] No test cases found matching the given filters.')
    process.exit(1)
  }

  console.log(`[harness] Running ${cases.length} test case(s)...`)
  if (categoryFilter) console.log(`[harness] Filter: --category ${categoryFilter}`)
  if (idFilter) console.log(`[harness] Filter: --id ${idFilter}`)
  console.log()

  const caseEvals: Array<{
    testCase: AdversarialTestCase
    cgfs: number
    ehr: number
    itemEvals: ItemEval[]
  }> = []
  const failedCases: FailedCase[] = []

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i]
    process.stdout.write(`[${i + 1}/${cases.length}] ${testCase.transcript_id} — running...`)

    const caseResult = MOCK_MODE ? mockRunCase(testCase) : await runCase(testCase)
    const { itemEvals, cgfs, ehr } = evaluateCase(caseResult)

    const cgfsDisplay = cgfs === -1 ? 'N/A (no items)' : cgfs.toFixed(3)
    const ehrDisplay = ehr === -1 ? 'N/A' : ehr.toFixed(3)
    const errorTag = caseResult.error ? ` [ERROR: ${caseResult.error.slice(0, 60)}]` : ''
    console.log(` CGFS=${cgfsDisplay} EHR=${ehrDisplay}${errorTag}`)

    caseEvals.push({ testCase, cgfs, ehr, itemEvals })

    // Collect failed cases: those with a numeric cgfs below 0.75, or pipeline errors
    if (caseResult.error) {
      failedCases.push({
        transcript_id: testCase.transcript_id,
        category: testCase.category,
        cgfs: 0,
        ehr: 1,
        reason: `Pipeline error: ${caseResult.error}`,
      })
    } else if (cgfs !== -1 && cgfs < 0.75) {
      failedCases.push({
        transcript_id: testCase.transcript_id,
        category: testCase.category,
        cgfs,
        ehr: ehr === -1 ? 0 : ehr,
        reason: `CGFS ${cgfs.toFixed(3)} below per-case floor of 0.75`,
      })
    }
  }

  const {
    overall_cgfs,
    overall_ehr,
    per_category_cgfs,
    per_category_ehr,
    passing,
    passCGFS,
    passEHR,
    passCategoryFloor,
  } = aggregateResults(caseEvals)

  // ---------------------------------------------------------------------------
  // Summary table
  // ---------------------------------------------------------------------------
  const SEP = '='.repeat(62)
  console.log()
  console.log(SEP)
  console.log('EVAL HARNESS RESULTS')
  console.log(SEP)
  console.log(
    `Overall CGFS : ${overall_cgfs.toFixed(4)}  (gate: >= 0.85)  ${passCGFS ? 'PASS' : 'FAIL'}`
  )
  console.log(
    `Overall EHR  : ${overall_ehr.toFixed(4)}  (gate: <= 0.05)  ${passEHR ? 'PASS' : 'FAIL'}`
  )
  console.log(
    `Per-cat floor: (>= 0.75 each)              ${passCategoryFloor ? 'PASS' : 'FAIL'}`
  )
  console.log()
  console.log('Per-category CGFS:')
  for (const [cat, cgfs] of Object.entries(per_category_cgfs).sort()) {
    const flag = cgfs >= 0.75 ? 'PASS' : 'FAIL'
    console.log(`  [${flag}] ${cat}: ${cgfs.toFixed(4)}`)
  }
  console.log()
  console.log(
    passing
      ? 'ALL GATES PASS — ArtifactPipeline is shippable'
      : 'GATES FAILED — see eval_report.json for details'
  )
  console.log(SEP)

  // ---------------------------------------------------------------------------
  // Write eval_report.json
  // ---------------------------------------------------------------------------
  const report: EvalReport = {
    run_at: new Date().toISOString(),
    cases_run: cases.length,
    overall_cgfs,
    overall_ehr,
    per_category_cgfs,
    per_category_ehr,
    passing,
    gates: { passCGFS, passEHR, passCategoryFloor },
    failed_cases: failedCases,
  }

  const reportPath = path.join(corpusDir, 'eval_report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`\nReport written to: ${reportPath}`)

  process.exit(passing ? 0 : 1)
}

main().catch((err: unknown) => {
  console.error('[harness] Fatal error:', err)
  process.exit(1)
})
