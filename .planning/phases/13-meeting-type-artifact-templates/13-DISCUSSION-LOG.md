# Phase 13: Meeting-Type Artifact Templates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 13-meeting-type-artifact-templates
**Areas discussed:** Type selector UI, Per-type MOM structure, Scope of variance across artifacts, Storage & migration

---

## Type Selector UI

| Option | Description | Selected |
|--------|-------------|----------|
| Inside ConsentGate, segmented buttons | Row of 4 buttons above the consent checkbox, General preselected, one screen | ✓ |
| Inside ConsentGate, dropdown select | Same location, `<select>` dropdown instead | |
| Separate screen before ConsentGate | Dedicated selector screen shown first | |

**User's choice:** Inside ConsentGate, segmented buttons
**Notes:** Keeps session start to one screen; matches TMPL-02's non-blocking requirement.

---

## Per-Type MOM Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Bespoke prompt per type | 4 fully independent Stage-2 MOM system prompts | |
| One template, type-conditional sections | Shared skeleton + type-specific focus section inserted based on meeting_type | ✓ |

**User's choice:** One template, type-conditional sections
**Notes:** Follow-up question raised to ensure this still satisfies SC-3 ("distinctly structured, not just relabeled fields").

### Follow-up: Template flex

| Option | Description | Selected |
|--------|-------------|----------|
| Shared skeleton minimal; most sections type-specific | Only Attendees + Action Items table universal; discussion section entirely swapped per type | ✓ |
| Shared skeleton stays large; one section appended per type | Keep full General structure for all types, append one bonus section | |

**User's choice:** Shared skeleton minimal; most sections type-specific
**Notes:** Resolves the tension between "one template" mechanically and genuinely distinct output structurally — see CONTEXT.md D-02/D-03/D-04.

---

## Scope of Variance Across Artifacts

| Option | Description | Selected |
|--------|-------------|----------|
| Only MOM varies by type | Summary/Key Points/Action Items stay generic | ✓ |
| MOM and Summary both vary | Summary gets a type-specific angle too | |
| All four artifacts vary by type | Maximum differentiation, 4x prompt surface | |

**User's choice:** Only MOM varies by type
**Notes:** "Important point" and "commitment" mean the same thing regardless of meeting type; keeps prompt surface minimal.

---

## Storage & Migration

| Option | Description | Selected |
|--------|-------------|----------|
| 4 fixed values, default 'general', tag stored on artifacts too | CHECK constraint + DEFAULT + meeting_type also stamped into content_json | ✓ |
| 4 fixed values, default 'general', no tag in content_json | Same column but renderer always joins back to meetings table | |

**User's choice:** 4 fixed values, default 'general', tag stored on artifacts too
**Notes:** Avoids a second DB join for the renderer.

---

## Claude's Discretion

- Exact migration mechanism for adding `meeting_type` to already-existing `meetings` tables in installed DBs
- Exact `{type_sections}` prompt-templating mechanism (string interpolation vs. per-type object)
- Whether `'1:1'` as a CHECK-constraint value needs SQL escaping/quoting verification
- Segmented button visual styling in ConsentGate.tsx (follow existing inline-style conventions)

## Deferred Ideas

- Type-specific Summary/Key Points/Action Items prompts — explicitly rejected for this phase, could revisit later based on user feedback
- Fully custom user-defined templates beyond the 3 fixed types — already out of scope (REQUIREMENTS.md)
- Meeting-type auto-detection — already out of scope (REQUIREMENTS.md)
