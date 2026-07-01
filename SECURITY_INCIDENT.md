# Security Incident Record — dark-trainers secret exposure

**Repo:** `s-shindeldecker/dark-trainers` (public, personal)
**Date of remediation:** 2026-06-30
**Status:** Contained and hardened; key rotation in progress

## What happened
A `.env.backup` file containing real credentials was committed to the repo on **2026-05-09**
(commit `5bd6684`) while the repo was **private**. The file slipped past `.gitignore` because the
ignore rule was `.env` (which does not match `.env.backup`). On **2026-06-30 at ~5:22pm CST
(22:22 UTC)** the repository was manually switched from private to public via the GitHub UI.
Automated scanning detected the credentials during that public window, and the repo was cleaned
up ~16 minutes later.

## Timeline (authoritative)
| Time (CST / UTC) | Event |
|---|---|
| 2026-05-09 | Repo created **private**; `.env.backup` committed (commit `5bd6684`) |
| 2026-06-30 ~5:22pm / 22:22Z | Repo made **public** via UI |
| 2026-06-30 (shortly after) | GitHub partner secret scanning detected the Anthropic key -> **Anthropic auto-revoked it** |
| 2026-06-30 5:38pm / 22:38Z | Secret purged from git history and force-pushed |
| **Public exposure window** | **~16 minutes** |

Prior to going public it was private for ~7 weeks, so exposure during that period was limited to
anyone/anything with access to the private repo.

## What was exposed
- `ANTHROPIC_API_KEY` (auto-revoked by Anthropic)
- `LAUNCHDARKLY_SDK_KEY` (server-side SDK key)
- `LAUNCHDARKLY_CLIENT_KEY` (client-side ID — public by design, low sensitivity)
- Commented-out Snowflake placeholder entries
- **Not** exposed: `OPENAI_API_KEY` (the app's actual — but unused — LLM key was not in the backup)

## Remediation actions taken
1. Untracked the file and hardened `.gitignore` to ignore all `.env.*` variants except `.env.example`.
2. Purged `.env.backup` from all git history using `git filter-repo`; force-pushed the rewritten
   `main` (all commit SHAs changed).
3. Deleted the merged branches that still referenced the secret-bearing commit; verified 0 remote
   branches reach commit `5bd6684`.
4. Deleted all local copies of the secret file and temporary artifacts.
5. Key rotation:
   - Anthropic key: auto-revoked; new key to be generated. (The app does not actually use it.)
   - LaunchDarkly server SDK key: rotated; updated in Vercel env vars (marked Sensitive) and local `.env`.
   - LaunchDarkly client-side ID: low risk; optional rotation.

## Preventive controls now in place
- **Local pre-commit hook** (`.githooks/pre-commit`): dependency-free secret scan that blocks `.env*`
  files in any directory, handles renames/copies, scans full staged content (including `.env.example`),
  and matches Anthropic/OpenAI (incl. project keys)/AWS/LaunchDarkly/GitHub/Google/Slack/PEM patterns.
  Enable per clone: `git config core.hooksPath .githooks`. Bypass a false positive with
  `git commit --no-verify`.
- **`CLAUDE.md`** documents the secrets policy.
- **GitHub account-level push protection**: enabled.
- **GitHub repo-level secret scanning + push protection**: enabled.
- **Partner secret scanning**: always on for public repos (what caught this).
- **`main` branch protection**: force-pushes and deletions blocked; PR required; conversation
  resolution required; admin override retained.

## Residual risk & caveats
- History rewrite does not guarantee removal from GitHub's cache. Commit `5bd6684` may remain
  accessible by direct SHA via cached/pull-request refs until GitHub garbage-collects. Contact
  GitHub Support to expedite if needed. **Rotation is the only definitive remediation** — treat all
  exposed values as compromised.
- Two surviving branches (`feature/launchdarkly-no-flash`, `claude/jolly-allen`) are based on
  pre-rewrite history and would need a rebase if revived.
- Newly enabled repo secret scanning may raise an alert for the old commit — expected; mark
  resolved once keys are rotated.

## Root-cause lesson
The trigger was a hand-made backup of a secret file (`.env.backup`) that got committed. The durable
fix is to never hand-maintain or back up secret files — pull secrets from a managed store
(1Password / Vercel) on demand.
