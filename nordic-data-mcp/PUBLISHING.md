# Publishing nordic-data-mcp — step-by-step

Authoritative checklist for releasing a new version. Follow it top-to-bottom; do not skip steps.

This file exists because the publish process has six failure modes that we keep re-discovering. Each one is documented below with its symptom and fix.

## Prerequisites (one-time per machine)

- Logged in to npm as the owner of the `nordic-data-mcp` package
- Git remote `origin` points to `https://github.com/Mnymann/nordic-data-mcp`
- `npm` and `node >= 20` available

## Repo layout reminder

Martin's Mac has the repo at `/Users/martinnymann/nordic-data-mcp/` and the **package itself is at the same path** — `package.json`, `src/`, `dist/`, etc. all live directly in that folder. There is no nested package subfolder.

There may be a second folder `/Users/martinnymann/nordic-data-mcp/nordic-data-mcp/` left over from an earlier clone. **Ignore the inner one** — use only the outer path.

Inside Replit, the same package lives at `nordic-data-mcp/` relative to the workspace root.

## Release flow

### 1. Agent side (in Replit) — prepare the release

```bash
cd nordic-data-mcp
# 1.1 bump version in package.json (e.g. 1.3.0 → 1.3.1)
# 1.2 add a CHANGELOG.md entry at the top
# 1.3 update VERSION constant in src/http.ts and src/index.ts
# 1.4 update USER_AGENT in src/lib/apiClient.ts
npm run typecheck
npm run build
# 1.5 smoke-test locally (see SMOKE_TEST.sh below)
```

Commit the changes. **Then push to GitHub** — the auto-checkpoint only commits locally inside Replit. Martin's Mac cannot pull a commit that hasn't been pushed.

> The agent cannot push to GitHub from Replit (no credentials). Ask Martin to push from his Mac, or push manually via the Replit Git pane. **Always tell Martin explicitly when a push is needed.**

### 2. Martin side (on Mac) — pull and publish

Run these **one at a time**. Do not paste multiple commands on one line, and do not include `#` comments — zsh on macOS treats `#` as part of the argument list and will throw "too many arguments".

```bash
cd /Users/martinnymann/nordic-data-mcp
```

```bash
git status
```

If `git status` shows uncommitted local changes (usually a stale `package.json` from a previous attempt), stash them:

```bash
git stash
```

Then pull:

```bash
git pull
```

You should see `Fast-forward` and a list of changed files including `package.json` and the new `CHANGELOG.md` entry.

Verify the version:

```bash
cat package.json | grep version
```

Install, build, publish:

```bash
npm install
```

```bash
npm run build
```

```bash
npm whoami
```

If `npm whoami` returns `E401 Unauthorized` or `not logged in`, log in first — npm tokens expire periodically (every ~30 days for browser-based logins):

```bash
npm login
```

Then publish:

```bash
npm publish
```

Success looks like `+ nordic-data-mcp@<version>` as the last line.

### 3. Verify Railway auto-deploy

Railway watches GitHub `main`. It usually deploys within 60–90 seconds of the push. Verify:

```bash
curl -s https://nordic-data-mcp-production.up.railway.app/healthz
```

Expected: `{"status":"ok","service":"nordic-data-mcp","version":"<new-version>"}`

If the version is still the old one, wait 60 seconds and try again. If after 5 minutes it has not updated, check Railway's deploy log.

### 4. Verify NPM

```bash
npm view nordic-data-mcp version
```

Expected: the new version. If still old, NPM CDN propagation can take 1–2 minutes.

---

## Known failure modes and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `cd: too many arguments` | Multi-word command pasted with a `#` comment; zsh does not strip comments in interactive mode | Send commands one line at a time, no `#` comments |
| `fatal: not a git repository` after a `cd` | The `cd` failed silently (because of the comment problem above), and subsequent commands ran in `$HOME` | Always check `pwd` after `cd` if any uncertainty |
| `git pull` says `Already up to date` but new commits exist in Replit | Agent never pushed to GitHub from Replit | Push from Replit Git pane before telling Martin to pull |
| `error: Your local changes to ... would be overwritten by merge` | Old `package.json` mod from a previous failed publish | `git stash && git pull`; then `git stash drop` once new version is confirmed live |
| `npm publish` → `E404 Not Found ... do not have permission` | NPM session expired (token TTL ~30 days) | `npm whoami` to confirm; `npm login` to re-authenticate |
| `npm error enoent Could not read package.json` | Ran `npm` outside the package folder | `cd` into `/Users/martinnymann/nordic-data-mcp` first |

## What the agent must do every release

1. Bump version in **all four places**: `package.json`, `src/http.ts` VERSION constant, `src/index.ts` Server constructor, `src/lib/apiClient.ts` USER_AGENT.
2. Add CHANGELOG entry.
3. Typecheck + build + local smoke test.
4. Commit.
5. **Tell Martin explicitly: "push to GitHub from Replit, then run the 8 commands in PUBLISHING.md on your Mac."**
6. After Martin confirms publish success, verify Railway `/healthz` returns the new version.
