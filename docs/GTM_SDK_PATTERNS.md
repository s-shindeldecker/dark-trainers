# GTM ↔ LaunchDarkly SDK Patterns — Option A vs Option B

Where does the LaunchDarkly client live when GTM is in the picture? There are
two patterns, and the choice is really about **who owns identity/context**.
Getting it wrong doesn't throw errors — it silently detaches conversions from
experiments.

> **TL;DR:** Reusing the app's client (Option A) keeps flag exposure and
> conversion on one identity, so experiments attribute correctly. Instantiating
> a separate SDK inside GTM (Option B) is the right move only when the app
> doesn't already have LD — and even then you must feed it the *same* context,
> or your conversions detach from your experiments.

---

## The two patterns

### Option A — app instantiates, GTM reuses (what DarkTrainers does)

The React app initializes one LD client (`LDProvider` in
`src/context/LDContext.tsx`), exposes it on `window.ldClient`
(`exposeLDClientForGTM` in `src/lib/gtmStub.ts`), and the GTM Custom HTML tag
calls `window.ldClient.track(...)`. **One SDK, one context.**

### Option B — GTM instantiates its own

The GTM Custom HTML tag calls `LDClient.initialize(clientSideId, context)`
itself and tracks on *that* client, independent of the app. **A second SDK, a
second context.**

---

## The implication that matters most: attribution

Experimentation only works if the **conversion is tracked against the same
context that received the flag variation.**

- **Option A guarantees this by construction** — a single client means the
  exposure and the conversion share one identity, every time.
- **Option B breaks the guarantee** unless GTM rebuilds the *exact* context the
  app used. This app's context is non-trivial: a **multi-context**
  (`session` + `user`) with a persisted session key and atomic persona
  transitions. If GTM's SDK initializes with anything different — a fresh
  anonymous key, session-only, or a stale user — then the experiment assigns a
  variation to the app's context while the conversion lands on GTM's context.
  They don't join → **conversions don't attribute to the exposure, and
  experiment results undercount or go silent.**

This is the subtle failure: everything *looks* like it's firing (you still see
`track` calls), but the metrics silently detach from the experiment.

---

## Secondary implications

| Concern | Effect under Option B |
|---|---|
| **Duplicate SDK overhead** | Two clients = two streaming connections, two init lifecycles, double the flag-evaluation event traffic. |
| **MAU / billing** | LD bills on contexts. Two SDKs on the *same* key don't inflate it — but if GTM generates its *own* keys (the default failure mode), context counts inflate → higher MAU and diluted data. |
| **Init timing & flush** | Conversions often fire right before navigation. Option A's client is already warm; a tag that instantiates on the fly adds init latency and risks dropping the event if the page unloads before it flushes. |
| **Config drift** | The client-side ID now lives in two places (app env *and* the GTM tag). Not a secret (it's public), but a maintenance seam. |

---

## The counterintuitive part

Option B *feels* like it decouples GTM from the app — but to make it **safe** it
needs *more* app cooperation, not less. The app has to push the full identity
(session key + user key + targeting attributes) onto the dataLayer so GTM's SDK
can `initialize`/`identify` with an identical context. You'd be adding app work
to replicate what Option A already provides for free.

---

## When is Option B actually the right call?

- **The app doesn't use LD at all**, and GTM is the sole integration surface —
  there's no app client to reuse, so GTM-instantiated is how you get LD on the
  page.
- **A separate team owns GTM** and wants to run its own GTM-driven
  flags/experiments independent of engineering's release cycle.

For **DarkTrainers** — which already has LD fully wired with a rich
multi-context — moving to Option B would be a **regression**: duplicate SDK,
attribution risk, MAU inflation, for no benefit. Option A is right here
*precisely because the app already owns a correct context.*

---

## Related

- Conversion routing (`track-conversions-via-gtm`, the shared
  `useTrackConversion` hook): see `FEATURE_FLAGS_GUIDE.md` §18 and
  `TECHNICAL_DESIGN_CONTEXT.md`.
- The GTM Custom HTML tag stub and value forwarding: `src/lib/gtmStub.ts`.
- SPA + LD fundamentals (CSR lifecycle, anti-flicker, LD primitives):
  `docs/SPA_LD_PRIMER.md`.
