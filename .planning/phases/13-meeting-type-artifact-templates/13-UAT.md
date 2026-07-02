---
status: testing
phase: 13-meeting-type-artifact-templates
source: [13-VERIFICATION.md]
started: 2026-07-02T10:25:00Z
updated: 2026-07-02T10:25:00Z
---

## Current Test

number: 1
name: ConsentGate meeting-type selector renders and toggles correctly
expected: |
  Four segmented buttons (General / Standup / 1:1 / Planning) render above the
  consent checkbox with General pre-selected. Clicking a button toggles single
  selection (exactly one active at a time). Starting a meeting requires no
  extra click beyond the existing consent flow — the selector is optional.
awaiting: user response

## Tests

### 1. ConsentGate meeting-type selector renders and toggles correctly
expected: Four segmented buttons (General / Standup / 1:1 / Planning) above the consent checkbox, General pre-selected; clicking toggles single selection; no extra required click to start a meeting.
result: [pending]

### 2. End-to-end meeting-type persistence
expected: Start a meeting with a non-General type selected; after capture starts, the `meetings.meeting_type` value in the DB matches the selected type (verifies the main/index.ts consent-confirmed wiring, which has no automated coverage).
result: [pending]

### 3. Live Standup MOM structure (with General regression)
expected: A real meeting run as Standup produces a MOM with `## Yesterday` / `## Today` / `## Blockers` headings; a General meeting still produces the original four headings.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
