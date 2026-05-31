---
name: Mac publish — github.com DNS "no such host"
description: mcp-publisher login fails to resolve github.com while the browser opens it fine; cause and fix.
---

# `mcp-publisher login github` → `dial tcp: lookup github.com: no such host`

Symptom seen during a release on Martin's Mac: `mcp-publisher login github`
(a Go CLI) fails with `lookup github.com: no such host`, **even though
github.com opens normally in the browser** and `npm publish` succeeded minutes
earlier.

**Why:** the macOS *system* DNS resolver had a stuck negative-cache entry for
`github.com` (a transient NXDOMAIN got cached). CLI tools use the system
resolver, so they keep getting the cached failure. Browsers don't — modern
browsers resolve via their own DNS-over-HTTPS (Secure DNS), so they bypass the
poisoned system cache and appear to work. `npm`'s target (`registry.npmjs.org`)
wasn't negatively cached, so it published fine — which is why "the internet
works" is misleading here.

**How to confirm it's this and not a real outage:**
- github.com opens in the browser → not a full outage.
- `/etc/hosts` is clean (no `0.0.0.0 github.com` / `127.0.0.1 github.com`).
- A non-github CLI call (e.g. `npm publish`) just succeeded.

**Fix:** flush the macOS DNS cache, then retry the login:
`sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
(one Mac-login password prompt; both commands are silent on success). Then
re-run `mcp-publisher login github` — it now reaches the device-code flow.

This is documented in the PUBLISHING.md failure-mode table too.
