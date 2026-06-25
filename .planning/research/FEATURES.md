# Feature Research

**Domain:** AI meeting-assistant / real-time meeting documentation (macOS overlay product — "MeetingAssist")
**Researched:** 2026-06-25
**Confidence:** MEDIUM (verified via multiple independent product pages, 2026 reviews, and legal sources; not first-party benchmarked)

---

## How To Read This Document

The 2026 AI-meeting-assistant market has bifurcated into two architectural camps. Knowing which camp a feature belongs to matters more than the feature itself, because MeetingAssist's DNA forces it into one camp:

- **Bot-joiner camp** (Otter, Fireflies, Fathom, tl;dv, Read.ai, Avoma, Sembly): a server-side bot is admitted into the Zoom/Meet/Teams call as a visible participant, records the cloud stream, and processes server-side. Strong at multi-speaker diarization (it gets per-participant streams) and deep CRM/cloud integrations, but creates a visible "third attendee," is the subject of active consent litigation, and cannot capture in-person or non-integrated calls.
- **Local-capture / no-bot camp** (Granola, Krisp, Fellow's Teams mode, Cluely, SuperIntern, JotMe): a desktop app captures **system audio + mic locally**, transcribes, and never appears in the participant list. Works for *any* audio on the machine (in-person, VoIP, webinars), but **single mixed audio stream makes speaker attribution hard**, and cloud integrations are usually thinner.

**MeetingAssist inherits the local-capture DNA** (dual-channel system-audio + mic capture, overlay rendering). This is the same architecture as Granola/Cluely/SuperIntern. That single fact drives most table-stakes/anti-feature calls below. The DNA's *dual-channel* capture (separate mic vs system-audio sockets) is a meaningful advantage over single-mixed-stream apps for the 2-party "you vs. them" case (see Diarization, Pitfalls).

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these makes the product feel broken versus the 2026 baseline (Otter, Fireflies, Fathom, Granola all ship these).

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Real-time transcription (live, on-screen) | Every competitor shows live text; users watch it scroll | MEDIUM | DNA already has dual-channel Deepgram Nova-2 sockets — largely solved |
| Full transcript saved at meeting end | The baseline artifact; user's own stated #1 | LOW | Persist accumulated transcript; DNA state machine exists |
| Post-meeting AI summary | Universal across all 13 competitors | LOW–MEDIUM | Single LLM call over transcript; DNA provider-agnostic layer ready |
| Action-item extraction | Otter/Fathom/Fireflies all auto-extract w/ owners + deadlines | MEDIUM | LLM structured extraction; quality depends on prompt + speaker labels |
| Key points / highlights | Standard "important moments" output | LOW | Same LLM pass as summary |
| Minutes of Meeting (MOM) / structured notes | Expected for business meetings; templated output | LOW–MEDIUM | Template-driven LLM formatting (Granola's "templates" model) |
| Speaker labeling / attribution ("who said what") | Otter markets this heavily; reviewers penalize tools that lack it | HIGH | **Hard on single mixed stream.** DNA's separate mic/system channels gives a *2-bucket* labeling for free ("You" vs "Others"); per-person naming of remote participants needs diarization (see Pitfalls) |
| No-bot / invisible capture (no extra participant) | Granola's core selling point; users dislike "bot joined" social friction | MEDIUM | DNA system-audio capture already does this; this is a *strength* |
| Cross-platform meeting support (Zoom/Meet/Teams + in-person) | Local-capture tools win here vs. ecosystem-locked Copilot/Gemini | LOW | System-audio capture is platform-agnostic by nature |
| Searchable transcript / find-in-meeting | Baseline; Fellow/MeetGeek build searchable libraries | LOW (single mtg) | Full-text search over saved transcripts |
| Copy / export (Markdown, email, clipboard) | Users must get artifacts out | LOW | Export to MD / clipboard / .txt |
| Calendar/date extraction → exportable event | User's stated feature; common as "follow-ups" | MEDIUM | LLM extraction → .ics generation is the low-dependency path (vs OAuth) |
| Recording/consent disclosure prompt | 2026 legal baseline; *bot presence is NOT sufficient consent* | LOW (UI) | See Privacy/Consent — table stakes for legitimacy now, not optional |

### Differentiators (Competitive Advantage)

These are where MeetingAssist can win, and they map directly onto the inherited DNA (overlay + live assistant + vision + dual-channel). Most bot-joiner competitors **structurally cannot** do the live, in-the-moment ones because they process server-side after the fact.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Live in-meeting assistant (hotkey/keyword-triggered Q&A + research)** | Answer "what's that acronym / pull that stat" mid-call without leaving the meeting. Only Cluely/SuperIntern do this; bot-joiners can't | MEDIUM | **DNA-native** (hotkeys + LLM + overlay already exist). Cluely's weakness is latency (5–10s observed) — winning on *speed* is the differentiation |
| **Context-preserving in-meeting chat** | Chat that knows the whole meeting so far; ask follow-ups grounded in live transcript | MEDIUM | Feed rolling transcript as context window; user's stated advanced feature |
| **Break assist / catch-up summary** | "What did I miss while away?" — summarize from last-seen marker to now. Almost no competitor markets this cleanly | MEDIUM | Mark a timestamp, summarize delta of transcript. Distinctive, high-value for back-to-back meeting people |
| **Rolling live summary (always-current)** | A persistent overlay panel that keeps summary/decisions/actions updated *during* the call (SuperIntern does this) | MEDIUM–HIGH | Incremental summarization; overlay is DNA-native. Strong "glanceable" value |
| **Vision assist (screenshot → multimodal Q&A)** | Ask about a slide/diagram/screen being shared, in-meeting | MEDIUM | **DNA-native** (sharp downscale → vision model). Few meeting tools do screen-content reasoning live |
| **Dual-channel "You vs Them" clean separation** | Reliable 2-bucket attribution + accurate talk-time-for-2 even on a single device | LOW (already built) | DNA captures mic and system audio on *separate* sockets — structurally better than single-mixed-stream rivals for the core case |
| **Local-first / on-device privacy posture** | "Audio never saved, processed on your machine" (Granola's enterprise pitch). Differentiator amid 2026 consent lawsuits | MEDIUM | Granola deletes raw audio post-transcription; a strong on-device or BYO-key posture is a trust moat |
| **BYO-LLM / provider-agnostic (privacy + cost control)** | User picks Ollama/LM Studio local, or any cloud key — no vendor lock, data stays where they choose | LOW (already built) | **DNA-native** (7+ providers). Rare in consumer meeting tools; powerful for privacy-sensitive users |
| **Agenda tracking / live coverage checklist** | Load an agenda; overlay shows which items were covered vs. missed in real time | MEDIUM | Fellow does agendas but pre/post, not live overlay. Live coverage is novel |
| **Decision log (explicit "decisions made" artifact)** | Separate, auditable list of decisions w/ who + when (JotMe, Teams Recap surface this) | LOW | LLM extraction into a dedicated artifact type |
| **Follow-up email draft** | One-click draft summarizing outcomes + actions (Fathom/Coworker/Notion AI do this) | LOW | LLM over artifacts; high perceived value, cheap |
| **Multi-meeting memory / "ask across all meetings"** | "What did the client say about timeline?" across history (Otter Chat, Read.ai knowledge graph) | HIGH | Requires storage + retrieval/RAG layer; defer past MVP but plan the data model now |
| **Real-time translated captions / multilingual notes** | JotMe/Teams Interpreter; valuable for global teams; overlay is ideal surface | MEDIUM–HIGH | Deepgram + translation; differentiator but heavy. v2 candidate |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Stealth / screen-share-invisible "undetectable" mode** | DNA has it (`NSWindowSharingNone`); feels powerful | Becomes the *defining ethical/legal liability*. 2026: active BIPA class-actions vs Otter/Fireflies/Teams; bar associations issuing opinions; "undetectable" is Cluely's reputational poison (CEO scandal, breach of 83k users). For *legitimate* meeting assistance, invisibility to the user's own screen-share is fine, but marketing "undisclosed recording" is a poison pill | Keep overlay invisible to *screen-share* (so your notes aren't broadcast) BUT make recording **disclosed and consented**. Reframe stealth as "private workspace," not "secret recording" |
| Auto-joining bot that dials into every calendar meeting | Convenience; Otter/Fireflies/Fathom default to it | Conflicts with no-bot DNA; reintroduces the "third attendee" + server-side processing + consent friction this product avoids | Local capture on a hotkey/explicit start — user controls when |
| Per-person diarization/naming of all remote speakers as a v1 promise | "Otter names everyone" | On a single mixed system-audio stream, DER climbs to 20%+ with overlap/noise; over-promising = trust loss on the *core* artifact | Ship reliable 2-bucket "You vs Others" (DNA gives this free); offer optional best-effort multi-speaker labeling clearly marked as approximate |
| "Score my meeting" engagement/sentiment report card | Read.ai popularized it; looks impressive | Sentiment from a single mixed stream is noisy and low-trust; distracts from the core transcript→artifacts value; can feel surveillance-y | If wanted later, scope to talk-time-for-2 (reliable from dual channel), not affective sentiment |
| Cloud storage of raw audio/video recordings | Competitors keep video for playback | Largest privacy/liability surface; contradicts local-first differentiator; storage + retention policy burden | Follow Granola: transcribe then **delete raw audio**; persist text artifacts only |
| Deep CRM auto-sync (Salesforce/HubSpot write-back) at MVP | Fireflies/Fathom flagship; sales-team appeal | Heavy OAuth + per-CRM schema work; not aligned with the "trustworthy personal record" core; sales-rep persona may not be the target | Ship clipboard/email/Markdown export first; add CRM later only if persona = sales |
| Video recording + clip/soundbite reels | Fireflies Soundbites, tl;dv clips | Requires storing video (privacy/storage), heavy UI; off the core text-artifact value | Transcript-anchored text quotes; defer media clips |

---

## Feature Dependencies

```
Real-time dual-channel transcription (DNA)
    ├──enables──> Full transcript saved
    │                 ├──enables──> Summary / MOM / key points
    │                 ├──enables──> Action-item extraction ──> Calendar/date extraction ──> .ics export
    │                 ├──enables──> Decision log
    │                 └──enables──> Follow-up email draft
    ├──enables──> Speaker buckets ("You" vs "Others")  [free from separate channels]
    │                 └──enhances──> Action-item attribution, talk-time(2)
    ├──enables──> Context-preserving in-meeting chat
    │                 ├──enables──> Live assistant (hotkey/keyword Q&A)
    │                 └──enables──> Break assist (delta summary)
    └──enables──> Rolling live summary ──enhances──> Agenda tracking (live coverage)

Vision assist (DNA) ──enhances──> Live assistant (screen-content Q&A)

Provider-agnostic LLM (DNA) ──underpins──> ALL AI features + local/BYO-key privacy posture

Persistent local storage of artifacts
    └──required-by──> Multi-meeting memory / "ask across all meetings" (RAG)
                          (plan data model in MVP even if feature deferred)

Recording-consent disclosure  ──gates(legally)──>  any capture at all
Per-person diarization  ──conflicts──>  single-mixed-stream reliability (avoid over-promising)
"Undetectable stealth" framing ──conflicts──> consent/legitimacy positioning
```

### Dependency Notes

- **Everything depends on the DNA capture pipeline.** It already exists, so the risk is in the LLM artifact layer and storage, not audio.
- **Calendar export should start as .ics generation, not OAuth.** Extraction (LLM) is the hard/valuable part; emitting an `.ics` the user imports avoids the Google/Outlook OAuth dependency for v1. Add OAuth write-back later.
- **Multi-meeting memory requires a storage + retrieval layer that must be designed now even if the feature ships later** — retrofitting search/RAG onto an artifact format that wasn't designed for it is costly.
- **Live assistant, in-meeting chat, and break assist all share one substrate**: a rolling transcript-as-context window. Build that substrate once.
- **Consent disclosure legally gates capture itself** — it's a precondition, not a peer feature.

---

## MVP Definition

### Launch With (v1) — the core transcript→artifacts promise + the unique live layer

- [ ] Persistent side-overlay UI (DNA) — the product's form factor and key differentiator
- [ ] Real-time dual-channel transcription with live on-screen text (DNA) — table stakes
- [ ] Full transcript saved at meeting end — user's #1 stated need
- [ ] "You vs Others" 2-bucket speaker labeling (free from dual channel) — honest, reliable attribution
- [ ] Post-meeting Summary + Key Points + MOM (templated) — universal baseline
- [ ] Action-item extraction with owners/deadlines — table stakes
- [ ] Date/deadline/schedule extraction → **.ics export** — user's stated feature, low-dependency path
- [ ] Recording-consent disclosure prompt + setting — 2026 legal baseline for legitimacy
- [ ] Export (Markdown / clipboard / email draft) — get artifacts out
- [ ] BYO-LLM / provider selection (DNA) — privacy + cost differentiator, already built

### Add After Validation (v1.x) — the live-intelligence differentiators

- [ ] Live in-meeting assistant (hotkey/keyword Q&A + research) — trigger: core artifacts trusted; this is the headline differentiator. **Win on latency** vs Cluely
- [ ] Context-preserving in-meeting chat — pairs with live assistant
- [ ] Break assist (catch-up delta summary) — distinctive, builds on chat substrate
- [ ] Rolling live summary overlay panel — glanceable in-meeting value
- [ ] Vision assist for shared-screen Q&A (DNA) — leverage existing multimodal pipeline
- [ ] Decision log artifact — cheap, high-trust addition
- [ ] Local-first audio handling (transcribe-then-delete raw audio) — formalize the privacy story

### Future Consideration (v2+)

- [ ] Multi-meeting memory / "ask across all meetings" (RAG) — defer; needs storage maturity, but design data model in MVP
- [ ] Agenda tracking with live coverage checklist — novel but needs UX validation
- [ ] Real-time translated captions / multilingual notes — heavy; only if global-team persona confirmed
- [ ] CRM / Jira / Notion / Slack integrations — defer until persona (sales vs PM vs generalist) is locked; OAuth-heavy
- [ ] Best-effort multi-speaker (3+) diarization, clearly marked approximate — only if it can clear a trust bar
- [ ] Talk-time analytics (scoped to reliable 2-party case) — low-trust beyond 2 speakers

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Real-time transcription (DNA) | HIGH | LOW (built) | P1 |
| Full transcript saved | HIGH | LOW | P1 |
| Summary / Key Points / MOM | HIGH | LOW | P1 |
| Action-item extraction | HIGH | MEDIUM | P1 |
| Date/deadline → .ics export | HIGH | MEDIUM | P1 |
| "You vs Others" labeling | MEDIUM | LOW (DNA) | P1 |
| Consent disclosure prompt | HIGH (legitimacy) | LOW | P1 |
| Export (MD/clipboard/email) | HIGH | LOW | P1 |
| BYO-LLM provider choice | MEDIUM | LOW (DNA) | P1 |
| Live in-meeting assistant | HIGH | MEDIUM | P2 |
| Context-preserving chat | HIGH | MEDIUM | P2 |
| Break assist | HIGH | MEDIUM | P2 |
| Rolling live summary | MEDIUM | MEDIUM | P2 |
| Vision assist (screen Q&A) | MEDIUM | MEDIUM (DNA) | P2 |
| Decision log | MEDIUM | LOW | P2 |
| Follow-up email draft | MEDIUM | LOW | P2 |
| Local-first audio deletion | MEDIUM (trust) | MEDIUM | P2 |
| Multi-meeting memory (RAG) | HIGH | HIGH | P3 |
| Agenda tracking (live) | MEDIUM | MEDIUM | P3 |
| Real-time translation | MEDIUM | HIGH | P3 |
| CRM/Jira/Notion/Slack sync | MEDIUM (persona-dep) | HIGH | P3 |
| 3+ speaker diarization | MEDIUM | HIGH | P3 |
| Talk-time analytics | LOW–MEDIUM | MEDIUM | P3 |

---

## Competitor Feature Analysis

Categorized by the requested taxonomy. "How it typically works / expected behavior" captured per category.

### Capture / Transcription

| Capability | Bot-joiner (Otter, Fireflies, Fathom, tl;dv, Read.ai) | Local/no-bot (Granola, Krisp, Cluely, SuperIntern) | Native (Zoom/Teams/Meet) | MeetingAssist approach |
|---|---|---|---|---|
| How capture works | Server bot admitted to call, records cloud stream | Desktop app grabs system audio + mic locally | Built into the platform's own pipeline | **Local dual-channel (DNA)** — like Granola, but *separate* mic vs system sockets |
| Appears as participant? | Yes (visible "bot") | No | N/A (native) | No — invisible to participant list |
| Works in-person / any app? | No (needs platform integration) | Yes (any system audio) | No (own platform only) | Yes |
| Live on-screen text | Yes | Granola/SuperIntern yes | Live captions | Yes (overlay) |
| Speaker attribution strength | High (per-participant streams) | Weak (single mixed stream) | High (platform knows speakers) | Strong for 2 (dual channel); approximate for 3+ |

### Summarization / MOM

Expected behavior across all: post-meeting AI summary + key points appears within seconds–minutes; many offer **templates** (Granola points notes at a chosen template). Otter/Teams Recap/JotMe explicitly surface **decisions**. → MeetingAssist: templated MOM + summary + key points + a dedicated **decision log** (differentiator).

### Action-Items / Calendaring

Otter, Fathom, Fireflies auto-extract action items **with owners and deadlines**; Fathom/Coworker create CRM/Jira follow-ups; native tools surface "follow-ups." Calendaring is usually "follow-up reminders," rarely clean calendar-event export. → MeetingAssist gap to exploit: clean **date/deadline → .ics** is under-served; ship it well.

### Live In-Meeting Assistance

Only **Cluely** and **SuperIntern** truly do real-time, in-the-moment assistance (Cluely: hotkey Cmd/Ctrl+Enter, screen+audio scan, ~300ms claimed but 5–10s observed; reputationally tainted). Bot-joiners are post-hoc. → MeetingAssist's **DNA-native hotkey + overlay + vision** is a direct, *legitimately-positioned* answer; **latency and trust** are the wedge.

### Break / Catch-Up

Essentially **unserved as a named feature**. SuperIntern's "rolling summary" is the closest. → MeetingAssist's **break assist** is a genuine white-space differentiator for back-to-back-meeting users.

### Knowledge / Search

Otter Chat (ask across meeting history + connected apps), Read.ai (personal knowledge graph, enterprise search across meetings/emails/docs), Fellow & MeetGeek (searchable meeting libraries). → MeetingAssist: single-meeting search at MVP; **multi-meeting memory (RAG)** as the P3 north star — design storage now.

### Integrations

Fireflies 60+ (CRMs, ATS, Slack, Zapier); Read.ai 20+ (Slack, Jira, Salesforce, Notion, Outlook); Fellow 50+; Otter (Slack, Salesforce, Zoom, Drive); Coworker (auto-creates Jira tickets). Native tools integrate within their suite only (Copilot=Teams, Gemini=Workspace). → MeetingAssist: **start with export, not integrations**; CRM/Jira/Notion/Slack are persona-gated P3.

### Collaboration / Sharing

Fellow (shared agendas, collaborative notes, comments), tl;dv/Fireflies (shareable summaries, soundbites/clips), team folders + global search (Fathom Team). → MeetingAssist: solo-first product; collaboration is later/optional. Shareable export covers the 80%.

### Privacy / Consent

The decisive 2026 shift: **bot presence in the participant list is NOT legally sufficient consent**; 11 all-party-consent US states; **active BIPA class-actions vs Otter.ai, Fireflies.ai, and Microsoft Teams (Aug 2025–Feb 2026)** over voiceprint extraction without written consent; NYC Bar formal opinion (Dec 2025) on lawyers' duties. Granola's local-first, transcribe-then-delete-audio, opt-out-of-training stance is the trust template. → MeetingAssist: **disclosure prompt + local-first + BYO-key + delete-raw-audio** is both table stakes *and* a differentiator, and is the antidote to the "stealth" liability.

---

## DISCOVERED Features / Use-Cases (Beyond the User's Stated List)

Flagged as discovery — these emerged from the teardown and are NOT in the user's starter list. Ranked by fit-to-DNA × white-space.

1. **Recording-consent disclosure & policy layer (HIGH priority — now table stakes).** A one-time/per-meeting disclosure prompt, suggested verbal-disclosure script, and a setting acknowledging the user's jurisdiction. *Discovered because* the 2026 legal landscape (BIPA suits, bar opinions, all-party-consent states) has made this non-optional for a legitimate product — and it directly resolves the PROJECT.md open ethics/stealth question.
2. **Local-first privacy posture: transcribe-then-delete raw audio (HIGH).** Persist only text artifacts. Directly competes with Granola's enterprise pitch and turns the DNA's local capture into a marketed trust moat.
3. **Decision log as a first-class artifact (MEDIUM).** Separate, auditable "decisions made + who + when" — surfaced by JotMe/Teams Recap, absent from the user's list, cheap to add, high trust value for the "trustworthy record" core.
4. **Follow-up email draft (MEDIUM, cheap).** One-click outcome+actions email. Ubiquitous competitor feature, high perceived value, trivial on the existing LLM layer.
5. **Rolling live summary overlay (MEDIUM).** Always-current summary/decisions/actions panel during the call (SuperIntern-style). Natural fit for the persistent overlay; bridges "capture" and "break assist."
6. **Agenda tracking with live coverage checklist (MEDIUM, novel).** Load agenda → overlay marks covered vs. missed items live. Fellow does agendas but not *live coverage* — genuine white space for an overlay product.
7. **Vision/screen-content Q&A in-meeting (MEDIUM, DNA-native).** Ask about a shared slide/diagram. The DNA's multimodal pipeline makes this nearly free; almost no meeting tool reasons over live screen content.
8. **Multi-meeting memory / "ask across all my meetings" (HIGH value, HIGH cost — P3).** Otter Chat / Read.ai knowledge-graph territory; the long-term moat. Design the storage/retrieval data model in MVP even though the feature ships later.
9. **Talk-time (2-party) and basic participation insight (LOW-MEDIUM, scoped).** Reliable *only* for the dual-channel 2-party case the DNA captures cleanly — offer it honestly scoped, avoid the unreliable multi-speaker sentiment/"meeting score" trap.
10. **Real-time translated captions / per-language notes (MEDIUM-HIGH — P3).** JotMe/Teams-Interpreter territory; the overlay is the ideal surface; only if a global-team persona is confirmed.

---

## Sources

Verified 2026-06-25 via web search (MEDIUM confidence — multiple independent product pages, dated 2026 reviews, and legal/industry sources cross-referenced):

- Otter.ai — [features](https://otter.ai/features), [best AI meeting assistant 2026](https://otter.ai/blog/best-ai-meeting-assistant), [in-person notetaker](https://otter.ai/blog/ai-notetaker-for-in-person-meetings)
- Fireflies.ai — [home](https://fireflies.ai/), [features](https://fireflies.ai/features), [real-time](https://fireflies.ai/product/real-time), [HubSpot listing](https://ecosystem.hubspot.com/marketplace/listing/fireflies-ai)
- Granola — [home](https://www.granola.ai/), [local-first vs cloud](https://www.granola.ai/blog/local-first-ai-notetaker-vs-cloud), [transcription docs](https://docs.granola.ai/help-center/taking-notes/transcription), [Zapier explainer](https://zapier.com/blog/granola-ai/)
- Fathom — [home](https://www.fathom.ai/), [pricing/features review 2026](https://screenapp.io/blog/fathom-notetaker-review), [free vs premium](https://help.fathom.video/en/articles/5290881)
- tl;dv / Read.ai / Avoma — [tl;dv vs Avoma](https://tldv.io/blog/tldv-vs-avoma-which-ai-meeting-assistant-do-you-need/), [Read.ai review/alternatives](https://tldv.io/blog/read-ai-review-alternatives/), [best Read.ai alternatives](https://get-alfred.ai/blog/best-read-ai-alternatives)
- Zoom AI Companion / MS Copilot Teams / Google Gemini Meet — [Zoom AI note-taking](https://www.zoom.com/en/products/ai-assistant/features/ai-note-taking/), [Copilot vs Gemini](https://neuronad.com/copilot-vs-gemini/), [Gemini vs Copilot for meeting notes](https://meetingnotes.com/blog/google-gemini-microsoft-copilot-ai-meeting-notes)
- Fellow / Sembly / Krisp — [Fellow](https://fellow.ai/), [AI notetakers for Teams](https://fellow.ai/blog/ai-meeting-notetakers-for-microsoft-teams/), [Krisp AI note-taking apps](https://krisp.ai/blog/ai-note-taking-apps/)
- Overlay / no-bot entrants — [Cluely](https://cluely.com/), [Cluely review (tl;dv)](https://tldv.io/blog/cluely-review/), [SuperIntern overlay/rolling summary](https://super-intern.com/en/blog/2026-ai-notetaker-how-to), [JotMe multilingual](https://www.jotme.io/)
- Knowledge/integrations — [Read.ai best assistants](https://www.read.ai/articles/best-ai-meeting-assistants), [Notion meeting memory](https://www.notion.com/help/guides/preserve-perfect-meeting-memory-with-ai-meeting-notes), [Coworker enterprise](https://coworker.ai/blog/best-ai-meeting-assistant-enterprise), [MeetGeek](https://meetgeek.ai/)
- Privacy / consent / legal — [Circleback consent guide](https://circleback.ai/blog/recording-consent-for-ai-meeting-notes), [Reed Smith legality](https://www.reedsmith.com/our-insights/blogs/employment-law-watch/102ls2n/the-legality-of-ai-powered-recording-and-transcription/), [Scherer Smith CA/BIPA alert](https://sfcounsel.com/ai-alert-using-an-ai-notetaker-without-consent-of-all-parties-violates-ca-law-and-jeopardizes-the-attorney-client-privilege/), [National Law Review](https://natlawreview.com/article/when-ai-takes-notes-protecting-privilege-privacy-and-professional-obligations), [Read.ai consent law](https://www.read.ai/articles/is-recording-without-consent-illegal-know-the-laws)
- Speaker diarization — [AssemblyAI diarization libraries 2026](https://www.assemblyai.com/blog/top-speaker-diarization-libraries-and-apis), [Recall.ai diarization](https://www.recall.ai/blog/speaker-diarization), [M2MeT challenge benchmark](https://arxiv.org/pdf/2309.13573), [Speechmatics](https://www.speechmatics.com/company/articles-and-news/what-is-speaker-diarization-and-why-does-it-matter-in-voice-ai)

---
*Feature research for: AI meeting-assistant (macOS overlay, local-capture DNA)*
*Researched: 2026-06-25*
