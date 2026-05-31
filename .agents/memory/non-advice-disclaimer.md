---
name: Non-advice / decision-support disclaimer
description: Martin's standing requirement that KYB/sanctions/AML/risk outputs are framed as guidance, never professional advice — and where that framing must live.
---

# KYB & compliance outputs must be framed as decision-support, not advice

**Rule:** every compliance-adjacent output (kyb_full, screen_sanctions, PEP, adverse-media, risk scores) must be presented to AI agents and end users as **informational decision-support / guidance — NOT legal, compliance, financial, or professional advice, and not a definitive determination**. A match/score is a "signal to review," not a verdict; users must verify independently.

**Why:** Martin (AddonNordic) requires this for liability reasons — the product must not be perceived as real advice. Stated explicitly May 31, 2026.

**How to apply:** when adding or editing any compliance/risk tool, prompt, or resource, the disclaimer must travel on ALL agent-consumed surfaces, so the framing survives no matter which surface a client reads:
- server `instructions` (returned in `initialize`) — the global carrier
- the tool's `description`
- any prompt's BOTH `description` (metadata) and `build()` body
- relevant resources (e.g. getting-started) and the package README

There is **no Terms doc in this repo** — Terms live on the addonnordic.com website. Keeping the same disclaimer in the website Terms is advisory-only (out of repo scope); flag it to Martin / the website owner rather than trying to edit it here.

## Two-layer design — avoid double-printing

The disclaimer exists at **two layers** and they are complementary, NOT redundant:
- **Backend data layer:** the Nordic Data API embeds a `disclaimer` field (**English text — Martin's decision May 31, 2026; originally Danish**) in the compliance response objects (`/kyc/full`, `/risk/*`, `/screening/full`, `/sanctions/screen|search|match`). This is the source of truth and travels to ALL consumers (direct API, any app), not just MCP. Plain factual lookups (company data, bankruptcy lists) deliberately have NO disclaimer field.
- **MCP metadata layer (this repo):** instructions / tool descriptions / prompts shape the AGENT's behaviour so it actually surfaces the disclaimer to the user.

**Disclaimer language = always English, verbatim, never translate** (Martin's choice May 31, 2026). Claude mirrors the *conversation* language for its own prose, so without an explicit rule a Danish chat would translate the disclaimer. The MCP instructions/tool-descriptions/prompts therefore say "present the disclaimer in English verbatim — do not translate, even when the rest of the reply is in another language." Three text languages in any answer: Claude's prose = conversation language (not ours); raw registry data = source language (not ours); disclaimer = English (the only one we control).

## Agent-native UX: "call-before-action" + recommended next step

Competitor (Kord Agencies) framing was adopted as a differentiator: tool descriptions + server `instructions` + prompts tell the agent to (1) call BEFORE a consequential action (onboard supplier, approve payment, issue invoice, sign contract) and (2) give a recommended next step — **clear / review / escalate**.
**Why:** more actionable for agents than "here is data".
**How to apply:** the recommended next step is **agent guidance only — NEVER a fabricated `agent_action`/verdict field injected into the response data.** Two reasons: the MCP is a thin adapter (no scoring/business logic), and a hard verdict would contradict the non-advice disclaimer. Always frame as "a signal to review, not a verdict/approval/decision."

**Rule to prevent two disclaimers reaching the user:** the MCP layer must tell the agent to **surface the response's `disclaimer` field if present, and only author its own if the field is absent — show it once, never stack two.** (Absent case matters because the backend field only goes live after the backend is deployed.) Keep static-doc disclaimers (README, getting-started resource) as-is — those are docs, not agent output, so no double-print risk.
