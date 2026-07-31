# LD MCP gap: agents cannot detect running experiments

**Reporter:** Scott Shindeldecker · **Found via:** dark-trainers / production
**Severity:** high for any experiment-aware agent workflow

## Summary

The LaunchDarkly MCP server exposes no way to answer **"which flags/configs are in a
running experiment in this environment?"** An agent doing exposure-safety reasoning (e.g.
"is it safe to change how this flag is evaluated?") gets a confidently wrong answer, because
the only experiment-shaped field the MCP returns is always empty.

## How it surfaced

While planning a change to `dark-trainers` that flips the app's flag-evaluation to a
non-eventing (`allFlags`) default, the agent audited production to check whether any flag was
mid-experiment (flipping the default would zero a running experiment's exposures). Using the
available MCP tools it concluded **"no experiments running — safe to flip."**

That was **wrong**: two experiments were live in production —
- `promo-banner-text` (multivariate feature flag)
- `togglemon-card-creator` (**AI Config**)

Neither was detectable via the MCP.

## Root cause / observations

1. **No experiments primitive.** There is no `list-experiments` / `get-experiment` tool.
2. **Flag tools return an empty experiments field.** `list-feature-flags` and
   `get-feature-flag` return `experiments: { baselineIdx: 0, items: [] }` **even for a flag
   that is experiment-targeted**, and **even when `expand=experiments` is passed**.
   Verified on `pdp-hero-layout` and `promo-banner-text`.
3. **AI Config experiments are entirely out of frame.** `togglemon-card-creator` is an AI
   Config, not a feature flag, so `list-feature-flags` cannot surface it under any option.
4. **Audit log is not a substitute.** Experiments do appear as `kind: "experiment"` /
   `createExperiment` entries in `get-audit-log-entries`, but only if the create/stop event
   falls inside the recent (≤20-entry) window; it is account-wide and noisy, and says
   nothing about *current* running state.
5. **The data already exists in REST.** Audit-log canonical links reference
   `GET /api/v2/projects/{proj}/environments/{env}/experiments` — so this is an MCP coverage
   gap, not a platform gap.

## Impact

Any agent that reasons about experiments — "don't break a running experiment," "which flags
are safe to refactor / archive," "summarize active experiments" — will either fail or, worse,
return a false negative that looks authoritative. Exposure/measurement integrity is exactly
the kind of guardrail teams expect an LD-aware agent to respect.

## Suggested fixes (in priority order)

1. Add MCP tools wrapping the existing experiments REST endpoints:
   `list-experiments` and `get-experiment` (project + environment scoped), including status
   (running / stopped) and target flag(s)/metric(s).
2. Populate `experiments.items` on the flag read tools (or add an `expand=experiments` that
   actually returns attached experiments), so flag-centric lookups can report membership.
3. Include **AI Config** experiments in the same surface (or a parallel tool), since
   experiments can target AI Configs, not just flags.

## Minimal repro

```
list-feature-flags   { projectKey: "dark-trainers", env: "production" }
  → every item has experiments.items: []   (2 experiments are actually live)

get-feature-flag     { projectKey: "dark-trainers", featureFlagKey: "promo-banner-text",
                       env: "production", expand: "experiments" }
  → experiments.items: []

(no list-experiments / get-experiment tool exists to cross-check)
```
