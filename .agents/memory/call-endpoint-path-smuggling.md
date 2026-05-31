---
name: call_endpoint path-smuggling defense
description: Why the admin/traversal guard must run on the FINAL substituted path, not just the user-supplied template.
---

# Validate the final substituted path, not just the template

`call_endpoint` (discovery meta-tool) accepts a `path` that may be an OpenAPI
template (e.g. `/api/company/{country}/{id}`) plus `params` that fill the
placeholders. Placeholders are filled with `encodeURIComponent(value)`.

**The trap:** validating only the incoming `path` is insufficient. A malicious
param value like `id: "..%2f..%2fadmin%2fkeys"` passes a pre-substitution check
(the template itself is clean), and `encodeURIComponent` turns its `%2f` into
`%252f` — so the smuggled separators only materialize AFTER substitution.

**The defense (must keep all layers):**
- A canonicalizer that case-folds, **iteratively** percent-decodes (multiple
  passes), normalizes backslashes, and resolves `.`/`..` dot-segments — used by
  the admin guard so `/Admin`, `/admin%2Fkeys`, `..%2f..%2fadmin` all resolve.
- A strict path validator that rejects `%25` (the double-encoding marker) in
  addition to `%2f|%5c|%2e`, backslashes, and literal `.`/`..` segments.
- Run BOTH the strict validator AND the admin guard a SECOND time on the final
  substituted path, before building the outbound URL.
- Reject disallowed HTTP methods via the spec's declared methods (405).

**Why:** never rely on the upstream server's decode behavior to keep `%252f` from
routing to admin — enforce it locally (defense in depth).

**How to apply:** `npm run security-check` (`scripts/security-check.mjs`) is the
regression matrix; keep it green. Any change to the path-handling in
`callEndpoint`/`canonicalizeForPolicy`/`assertSafeCallPath` must re-run it.
