/**
 * Probe script: Verify Gemini text-embedding produces 1536-dim output via openai SDK adapter
 *
 * Usage:
 *   GEMINI_API_KEY="your-key-here" node scripts/probe-embedding.mjs
 *
 * Purpose:
 *   The vec_chunks table is fixed at float[1536]. Gemini's gemini-embedding-001 defaults to 3072 dims.
 *   This probe confirms which model + parameter combination produces exactly 1536-dim output
 *   through the openai SDK + baseURL adapter before EmbeddingAdapter.ts is implemented.
 *
 *   Record which attempt prints "=> 1536" and report it as the resume signal for Plan 10-02.
 */

import OpenAI from 'openai'

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('ERROR: GEMINI_API_KEY environment variable is not set.')
  console.error('Usage: GEMINI_API_KEY="your-key-here" node scripts/probe-embedding.mjs')
  process.exit(1)
}

const client = new OpenAI({
  apiKey,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
})

console.log('Probing Gemini text-embedding dimension parameter support...\n')

// Attempt 1: dimensions parameter (OpenAI native field)
try {
  const r1 = await client.embeddings.create({
    model: 'text-embedding-004',
    input: 'probe sentence for dimension test',
    dimensions: 1536,
  })
  const len = r1.data[0].embedding.length
  console.log(`Attempt 1 — text-embedding-004 dimensions:1536 => ${len}${len === 1536 ? ' ✓ PASS' : ' ✗ FAIL (not 1536)'}`)
} catch (e) {
  console.error('Attempt 1 FAILED:', e.message)
}

// Attempt 2: extra_body output_dimensionality (Gemini-native parameter forwarded via extra_body)
try {
  const r2 = await client.embeddings.create({
    model: 'text-embedding-004',
    input: 'probe sentence for dimension test',
    extra_body: { output_dimensionality: 1536 },
  })
  const len = r2.data[0].embedding.length
  console.log(`Attempt 2 — text-embedding-004 extra_body:{output_dimensionality:1536} => ${len}${len === 1536 ? ' ✓ PASS' : ' ✗ FAIL (not 1536)'}`)
} catch (e) {
  console.error('Attempt 2 FAILED:', e.message)
}

// Attempt 3: gemini-embedding-001 default dims (may return 3072 by default)
try {
  const r3 = await client.embeddings.create({
    model: 'gemini-embedding-001',
    input: 'probe sentence for dimension test',
  })
  const len = r3.data[0].embedding.length
  console.log(`Attempt 3 — gemini-embedding-001 default => ${len}${len === 1536 ? ' ✓ PASS' : ' ✗ FAIL (not 1536)'}`)
} catch (e) {
  console.error('Attempt 3 FAILED:', e.message)
}

// Attempt 4: gemini-embedding-001 with dimensions parameter
try {
  const r4 = await client.embeddings.create({
    model: 'gemini-embedding-001',
    input: 'probe sentence for dimension test',
    dimensions: 1536,
  })
  const len = r4.data[0].embedding.length
  console.log(`Attempt 4 — gemini-embedding-001 dimensions:1536 => ${len}${len === 1536 ? ' ✓ PASS' : ' ✗ FAIL (not 1536)'}`)
} catch (e) {
  console.error('Attempt 4 FAILED:', e.message)
}

// Attempt 5: gemini-embedding-001 with extra_body output_dimensionality
try {
  const r5 = await client.embeddings.create({
    model: 'gemini-embedding-001',
    input: 'probe sentence for dimension test',
    extra_body: { output_dimensionality: 1536 },
  })
  const len = r5.data[0].embedding.length
  console.log(`Attempt 5 — gemini-embedding-001 extra_body:{output_dimensionality:1536} => ${len}${len === 1536 ? ' ✓ PASS' : ' ✗ FAIL (not 1536)'}`)
} catch (e) {
  console.error('Attempt 5 FAILED:', e.message)
}

console.log('\nReport the output of whichever attempt(s) printed "=> 1536 ✓ PASS" as the resume signal for Plan 10-02.')
console.log('If all attempts failed or returned wrong dimensions, report the full output so the plan can be revised.')
