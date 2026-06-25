# RSCH-03: Vendor DPA / No-Training Terms Confirmation

**Phase:** 3 — Deep Research
**Requirement:** RSCH-03
**Status:** Complete
**Date:** 2026-06-25

---

## Summary

RSCH-03 confirmed no-training/DPA status for four vendors used in MeetingAssist: **Deepgram, OpenAI, Google Gemini, and AssemblyAI**. All four satisfy DEC-02 data-handling requirements when used correctly.

**Critical constraint:** Gemini API on **paid quota only** — free tier is disqualified and must never be used for meeting transcript processing. The app must validate the user's Gemini API key is on a paid plan.

This report closes the open dependency flagged in DEC-02: *"final no-training/DPA confirmation comes from RSCH-03."* See Task 03-03-T2 for the DEC-02 ADR update.

---

## Deepgram

[CITED: developers.deepgram.com/trust-security/data-privacy-compliance]
[CITED: developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program]

| Requirement | Status | Action Required |
|-------------|--------|-----------------|
| No training on customer data | **Available via opt-out** | Add `mip_opt_out=true` query param to ALL Deepgram API requests |
| Data retention (opted-out) | Minimum — "only for duration necessary to process" | Opt out by default in every request |
| DPA availability | Yes | Contact security@deepgram.com or per-region addendum |
| Compliance certifications | SOC 2 Type 1+2, GDPR, HIPAA, CCPA, PCI | Covered |
| EU data residency | Yes — `api.eu.deepgram.com` endpoint | Use if GDPR-sensitive deployment required |

**Verdict for DEC-02:** Deepgram API with `mip_opt_out=true` query parameter satisfies the DEC-02 local-first + no-training stance. No DPA signature is required for development use; the opt-out parameter is the mechanism. Enterprise DPA is available at security@deepgram.com and is recommended for commercial launch.

**Implementation note:** Every Deepgram API call in MeetingAssist must include `mip_opt_out=true` in the query string. This is a product requirement enforced at the SDK configuration layer, not per-call — set it as a default on the Deepgram client initialization.

---

## OpenAI API

[CITED: openai.com/enterprise-privacy/]

| Requirement | Status | Action Required |
|-------------|--------|-----------------|
| No training on customer data | **Default for API** (since March 1, 2023) | No action required — API data is not used for training by default |
| Data retention | 30 days for abuse monitoring | Request Zero Data Retention (ZDR) via enterprise agreement to reduce to zero |
| Zero Data Retention (ZDR) | Available via enterprise agreement only | Not needed for development; flag for commercial GA launch |
| DPA availability | Yes — Data Processing Addendum available | Sign for GDPR compliance at commercial launch |

**Verdict for DEC-02:** OpenAI API with default settings satisfies the no-training requirement. No configuration is needed — the API does not train on customer data by default (since March 2023). The 30-day retention for abuse monitoring is the only residual; ZDR is available via enterprise agreement and should be evaluated at commercial launch (GA).

---

## Google Gemini API

[CITED: docs.cloud.google.com/gemini/docs/discover/data-governance]

| Requirement | Status | Action Required |
|-------------|--------|-----------------|
| No training on customer data | **PAID API ONLY** — free tier explicitly allows training | **MUST use paid quota** — free tier is disqualified for meeting data |
| Training restriction scope | Section 17 of Service Specific Terms for paid services | Validate user's Gemini key is on a paid plan |
| Zero Data Retention | Available via Vertex AI contractual amendments | Contact Google Cloud account team at launch |
| DPA availability | Cloud Data Processing Addendum (CDPA) available | Sign for GDPR compliance at commercial launch |

> **⚠ CRITICAL WARNING — FREE TIER IS DISQUALIFIED**
>
> Gemini API on the **free tier explicitly allows Google to use submitted data for model training**. Meeting transcript data sent to a free-tier Gemini API key violates DEC-02's no-training stance. This is a product requirement: **MeetingAssist must validate that any Gemini API key provided by the user is on a paid plan, or fall back to a different provider.**
>
> Free-tier keys look identical to paid-tier keys in application code. This is a non-obvious footgun. The Gemini integration must either: (a) surface a clear warning that free-tier Gemini is disqualified, or (b) refuse to use Gemini as an active provider without billing confirmation.

**Verdict for DEC-02:** Gemini API on paid quota satisfies the no-training requirement (Section 17 of Service Specific Terms). **The free tier API is disqualified — never use a free Gemini API key for meeting transcript processing.**

---

## AssemblyAI

[CITED: assemblyai.com/docs/faq/can-i-sign-a-dpa-agreement-with-assemblyai]

| Requirement | Status | Action Required |
|-------------|--------|-----------------|
| DPA | **Auto-included in ToS** — no separate signature needed | None |
| Training opt-out | Available via API flag | Add opt-out flag to all API requests |
| EU data residency | Available (Dublin, Ireland) | Use EU endpoint if needed |
| Compliance | SOC 2, PCI-DSS 4.0 Level 1 (Mar 2025) | Covered |

**Verdict for DEC-02:** AssemblyAI satisfies DEC-02 requirements out of the box. The DPA is automatically included in the Terms of Service — no separate negotiation or signature needed. Training opt-out is available via API flag and should be enabled by default.

---

## DEC-02 Update Required

Task 03-03-T2 updates the DEC-02 ADR at `.planning/phases/02-foundational-decisions-adrs/02-DEC-02-data-handling-privacy.md` with these confirmations to close the open RSCH-03 dependency.

---

## Vendor Comparison Summary

| Vendor | No-Training Mechanism | DPA Type | Additional Action |
|--------|-----------------------|----------|-------------------|
| **Deepgram** | `mip_opt_out=true` query param | Available on request | Set as SDK default |
| **OpenAI API** | Default (since Mar 2023) | Addendum available | None for dev; ZDR at GA |
| **Google Gemini** | Paid quota only (free = disqualified) | CDPA available | **Validate paid plan** |
| **AssemblyAI** | API flag (opt-out) | Auto-included in ToS | Set flag by default |
