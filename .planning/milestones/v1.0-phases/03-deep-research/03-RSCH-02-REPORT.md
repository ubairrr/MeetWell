# RSCH-02: Speaker Diarization Approach Report

**Phase:** 3 — Deep Research
**Requirement:** RSCH-02
**Status:** Complete
**Date:** 2026-06-25

---

## Decision Summary

**V1 diarization standard:** Speaker labels without names — "Speaker 1", "Speaker 2", "Speaker 3", etc. V1 caps at **8 speakers reliably**. Named speaker attribution (Alice, Bob) is a **v2 post-meeting confirmation flow** (deferred per D-10).

This decision satisfies the three locked constraints from CONTEXT.md:
- **D-09:** MVP diarization standard = Speaker labels without names ✓
- **D-10:** Named speaker attribution is v2 ✓
- **D-11:** Target speaker count for v1 = up to 8 speakers reliably ✓

---

## Deepgram Nova-3 Diarization Capabilities

[CITED: deepgram.com/learn/nextgen-speaker-diarization-and-language-detection-models]

| Capability | Value | Notes |
|-----------|-------|-------|
| Maximum speakers supported | **12** | Upgraded from 6–8 in Nova-2 |
| Overall accuracy improvement | **53.1%** over prior version | Aggregate across domains |
| Meeting-domain improvement | **61.5%** over prior version | Most relevant for MeetingAssist |
| Cost | **Free** with all ASR models | No additional per-minute charge |
| Training data | 100,000+ speakers, 80+ languages | Broad coverage |
| Speed | 10× faster than next-fastest vendor | Per Deepgram benchmarks |
| Known weakness | **Overlapping speech** | Performance degrades when speakers talk simultaneously |

[CITED: deepgram.com/learn/speech-to-text-benchmarks]

- Deepgram outperforms open-source alternatives (PyAnnote) on domain-specific real-world meeting data
- **No published per-speaker-count accuracy breakdown** — "up to 12 reliable" is the official claim, without cliff data across speaker counts

### Key Capability Note

The 61.5% improvement for meetings (versus the 53.1% aggregate) is the most relevant benchmark for MeetingAssist. Meeting audio typically has:
- Overlapping speech during active discussions
- Multiple speakers with similar acoustic profiles (conference room acoustics)
- Code-switching and shared terminology

Nova-3 is trained specifically for this domain and is free with all ASR models — no cost penalty for enabling diarization.

---

## V1 Speaker Cap Recommendation

**V1 cap: 8 speakers** — rationale for the specific choice:

| Factor | Detail |
|--------|--------|
| Deepgram official limit | 12 speakers |
| Accuracy at 12 | No published accuracy breakdown by count |
| Primary quality cliff | Overlapping speech, not total speaker count |
| 8 as buffer | 33% below the 12 limit; conservative without being restrictive |
| Standard team meeting | 4–6 people — well within cap |
| Maximum common meeting | ~8 people — hits the cap cleanly |
| Conference / all-hands | >8 — speaker attribution matters less for action items in these formats |

**Why not cap at 12?** Deepgram officially supports 12, but without per-speaker-count WER or DER data, the accuracy between 9 and 12 speakers is unknown. The overlapping speech degradation characteristic suggests accuracy degrades non-linearly at high speaker counts. 8 is a principled conservative cap that covers the "trustworthy record" use case for virtually all real meeting scenarios.

**Why not cap at 4?** 1:1s and small syncs are the primary use case, but design/tech reviews, standup meetings, and client briefings regularly involve 5–8 participants. A 4-speaker cap would force workarounds in these common scenarios.

---

## V1 Diarization Flow

The recommended architecture for processing audio through Deepgram with diarization:

```
Audio Capture
    ├── Mic channel (getUserMedia)
    └── System audio channel (electron-audio-loopback or AudioTee.js)
             ↓
Two parallel Deepgram Nova-3 WebSocket connections
  (both with diarization=true)
             ↓
Per-word speaker field in response:
  { "word": "hello", "speaker": 0, "confidence": 0.95 }
             ↓
Transcript segment assembly:
  Mic channel speaker 0  → labeled "You"
  System audio speaker 0 → labeled "Speaker 1"
  System audio speaker 1 → labeled "Speaker 2"
  System audio speaker N → labeled "Speaker {N+1}"
             ↓
Final transcript segments:
  "You: Let's start the meeting..."
  "Speaker 1: Thanks for joining..."
  "Speaker 2: Quick question about..."
```

**Critical implementation note (Pitfall 5 from RESEARCH.md):** Each Deepgram WebSocket connection has an **independent speaker ID space**. Speaker "0" in the mic connection and Speaker "0" in the system audio connection are different people. Never merge speaker IDs across channels.

- Mic channel: always mapped to "You" regardless of Deepgram speaker ID
- System audio channel: speaker IDs mapped to "Speaker 1", "Speaker 2", etc. with a separate speaker registry per channel

---

## V2 Named Attribution (Deferred)

Named speaker attribution — mapping "Speaker 1" → "Alice" — is a **v2 differentiator** (D-10).

**Why it's deferred:**
- V1 label foundation (Speaker 1, Speaker 2, Speaker 3) is the prerequisite; v2 adds the name layer without re-processing transcripts
- The UX for name confirmation requires a post-meeting flow that is additional product scope

**V2 implementation design (for PRD awareness):**

A post-meeting confirmation flow: "Speaker 1 said these 3 things — who was this?" The user selects or types a name. The association is stored and used for future meetings where the same voice signature is detected. This is a meaningful differentiator because it requires persistent speaker models across meetings — which sqlite-vec's cross-meeting memory infrastructure (RSCH-05) supports architecturally.

**V2 reference:** Jamie by Fireflies is the only competitor with named attribution across meetings. MeetingAssist's local-first, encrypted storage provides a privacy advantage for this feature that cloud-first competitors cannot match.

---

## Open Questions for PRD

1. **Per-speaker accuracy cliff:** Does Deepgram diarization quality degrade notably between 4 and 8 speakers? No published per-speaker-count WER or DER data exists. The 8-speaker cap stands as conservative below the 12 official limit pending empirical data from the spike (RSCH-04) or user beta testing.

2. **Overlapping speech handling:** When two speakers talk simultaneously, Deepgram degrades. Should MeetingAssist surface a "overlapping speech detected — transcript may be less accurate" indicator? This is a UX question for Phase 5 PRD.

3. **Diarization on the mic channel:** The mic channel always maps to "You" regardless of Deepgram's speaker field. If the user's mic picks up another speaker (e.g., someone in the same physical room), that audio is attributed to "You". This is a known v1 limitation — two people in the same physical room with one laptop mic cannot be separated. Document as a known limitation in PRD.

---

## Data Quality Notes

| Claim | Source Quality |
|-------|----------------|
| 53.1% accuracy improvement | [CITED] — Deepgram official documentation |
| 61.5% meeting-domain improvement | [CITED] — Deepgram official documentation |
| 12-speaker official limit | [CITED] — Deepgram official documentation |
| Free with all ASR models | [CITED] — Deepgram official documentation |
| 8-speaker V1 cap rationale | [ASSUMED] — synthesized from Deepgram data + meeting scenario analysis; no empirical per-count accuracy data published |
| V2 named attribution design | [ASSUMED] — designed from first principles; validated by competitor pattern (Fireflies AskFred / Jamie) |
