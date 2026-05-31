---
name: Secrets leak via attached_assets
description: attached_assets/ is git-tracked and pushed to the GitHub origin, so pasted chat/terminal logs containing real keys leak publicly.
---

# Secrets can leak through `attached_assets/`

The whole Replit workspace is ONE git repo whose `origin` is the public-facing GitHub repo (`github.com/Mnymann/nordic-data-mcp`). `attached_assets/` is **tracked** (only `.local/` is gitignored). Pasted chat snippets and terminal logs get saved there as `.txt`/`.md` files — and if they contain a real API key, that key is committed and pushed to GitHub.

**Incident (May 31, 2026):** real Nordic Data keys (`ndk_…`, `naf_…`) were found in 6 `attached_assets/*.txt` files (pasted "getting started" guides + Mac terminal logs). Scrubbed in the working tree via pattern redaction `(ndk|naf|nrk|nrd)_[A-Za-z0-9]{24,}` → `REDACTED_API_KEY`. No real keys anywhere else in tracked code (all other hits are the variable NAME or `YOUR_KEY_HERE` placeholders).

**Why it matters:** scrubbing only removes keys from NEW commits. Old commits on GitHub still contain them. **The real fix for a leaked key is rotation/revocation in the AddonNordic dashboard**, not history cleaning — history rewrite (filter-repo + force push) is destructive and secondary.

**The actual Replit Secrets** (`NORDIC_API_KEY`, `SESSION_SECRET` in the secret vault) are NOT in code/commits and never reach GitHub — those are safe. The leak vector is purely human-pasted text saved into `attached_assets/`.

**How to apply:** never paste live secrets into chat; if a key must be shown, redact it. When auditing for leaks, `git grep -lE '(ndk|naf|nrk|nrd)_[A-Za-z0-9]{24,}' -- .` catches Nordic keys. Treat any key that ever hit `attached_assets/` as compromised → rotate.
