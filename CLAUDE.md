# CLAUDE.md

DarkTrainers — a LaunchDarkly demo app (React + Vite frontend, Express server, Python simulation).
For architecture and conventions, see [TECHNICAL_DESIGN_CONTEXT.md](TECHNICAL_DESIGN_CONTEXT.md).

## Secrets & commit safety (required)

Real credentials must never be committed. A `.env.backup` containing live keys was once
committed and exposed; these rules exist to prevent a repeat.

- **Only `.env.example` (placeholders) is tracked.** Every other `.env` / `.env.*` file is
  gitignored — keep real values there, locally only.
- **Before any commit, verify staged changes contain no secrets** (API keys, SDK keys,
  tokens, private keys). Never stage a real `.env*` file.
- **Enforcement:** a pre-commit hook at [`.githooks/pre-commit`](.githooks/pre-commit) scans
  staged changes and blocks env files and credential-shaped tokens. It is dependency-free.
- **Enable it once per clone** (hook path isn't set automatically by git):
  ```sh
  git config core.hooksPath .githooks
  ```
- If the hook blocks a genuine false positive, bypass deliberately with
  `git commit --no-verify` — and only then.

When you (Claude) are about to commit, scan the diff for secrets first; if the hook is not
enabled in this clone, run the `git config` line above before committing.
