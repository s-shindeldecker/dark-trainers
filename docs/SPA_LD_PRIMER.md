# SPA + LaunchDarkly — Quick Reference

A personal primer for explaining how DarkTrainers (and client-rendered apps in
general) integrate LaunchDarkly. Anchored to this repo so it's concrete.

> **TL;DR:** In a Single-Page App the LD SDK boots *in the browser, after the
> page paints*. That timing gap is why we gate flagged UI behind a loading
> state (`waitForInitialization` + skeleton) instead of rendering the default.
> Server-rendered apps solve the same problem a different way (evaluate flags
> on the server, bootstrap the client). Routing is framework-specific and has
> nothing to do with LD; the LD primitives are the same everywhere.

---

## 1. What an SPA actually is

A **Single-Page Application** ships one nearly-empty `index.html` plus a
JavaScript bundle. The browser downloads the JS, and **JavaScript renders the
entire UI on the client**, swapping "pages" in place with no full reload.

- In this repo: [`index.html`](../index.html) is a shell; `src/main.tsx` mounts
  React into it.
- Contrast with the classic server-rendered world (PHP/JSP/Rails): the server
  produced full HTML per request and the browser just displayed it. SPAs moved
  that rendering *into the browser*.

---

## 2. The client-side rendering (CSR) lifecycle — the key sequence

```
1. Browser requests the site   → gets a near-empty HTML shell
2. Downloads the JS bundle      → (~426 KB gzipped in our production build)
3. React boots, renders the UI  → "mount" / "hydration"
4. NOW app code can run         → LD client initializes, evaluates flags
5. User navigates (client-side) → React swaps components, no reload
```

**The critical fact for LaunchDarkly:** steps 3–4 happen *after* the page is
already visible. There is a brief window where the UI exists but flags have not
evaluated yet. That window is the entire reason for the anti-flicker pattern.

---

## 3. Where LaunchDarkly sits in an SPA

- The LD **client-side SDK** runs *in the browser* (step 4). It initializes once
  at the app root — here, `<LDProvider>` in
  [`src/context/LDContext.tsx`](../src/context/LDContext.tsx).
- Because it initializes client-side, a flag read can land *before* init
  finishes → you briefly get the default value → the UI flashes → then
  corrects. That flash is **"flag flicker."**
- **The correct SPA pattern to avoid flicker** (what this app does in
  [`src/hooks/useFeatureFlag.ts`](../src/hooks/useFeatureFlag.ts)):
  1. `await ldClient.waitForInitialization()` before trusting a value,
  2. expose an `isLoading` boolean,
  3. render a **skeleton/loader** while `isLoading` — never the real default.

> One-liner: *"In an SPA the SDK boots in the browser after the page paints, so
> we gate flagged UI behind a loading state until LD has evaluated — otherwise
> users see a flash of the wrong variant."*

---

## 4. The contrast that makes you sound senior: SSR

If you land in a **server-rendered** codebase (Next.js, Remix), the story flips:

- Flags are evaluated **on the server**, using the **server SDK**, *before* HTML
  is sent.
- The correct value is baked into the initial HTML → **no flicker, no skeleton**
  needed for first paint.
- The client SDK is then "bootstrapped" with those server values so it doesn't
  re-fetch from scratch.

> Framing: *"Client-rendered apps solve flicker with a loading state
> (`waitForInitialization` + skeleton); server-rendered apps solve it by
> evaluating flags server-side and bootstrapping the client. Same problem,
> different layer."*

---

## 5. The three-layer separation (portability crib)

When you jump to *any* other client codebase, sort what you see into these
buckets:

| Layer | This app | Varies by framework? | LD-related? |
|---|---|---|---|
| **Routing** | React Router; routes listed in `App.tsx` | Yes — Next.js uses file-based routing, etc. | ❌ No — LD doesn't touch it |
| **Rendering model** | CSR (browser renders) | Yes — CSR vs SSR vs SSG | ⚠️ Indirectly — dictates *how* you avoid flicker |
| **LD primitives** | context, `variation`, `track`, `identify`, `on('change')` | No — same 5 concepts everywhere | ✅ Yes — the portable part |

If someone drops you into an unfamiliar app, the LD integration is always those
five primitives — only the wrapper syntax and the flicker-handling change.

> Note: `src/pages/` here is **just a folder name**, not Next.js file-based
> routing. Renaming a file there changes no URLs. Routes are declared
> explicitly in [`src/App.tsx`](../src/App.tsx).

---

## 6. Anticipated hard questions + safe answers

- **"Why not just render the default and update?"** → That's the flicker; on a
  persona/targeting change it's visibly wrong, so we gate on `isLoading`.
- **"Isn't client-side flag eval a security risk?"** → Only the **public
  client-side ID** is in the browser; it can only *evaluate*, not read flag
  config or mutate anything. Secrets (server SDK key, OpenAI key) stay
  server-side.
- **"Does the SPA re-request flags on every navigation?"** → No. The SDK holds a
  streaming connection (`streaming: true` in `LDContext.tsx`) and pushes
  changes; navigation is just React swapping components.

---

## 7. The five portable LD primitives (memorize these)

| Primitive | What it does | In this repo |
|---|---|---|
| **context** | Who/what you're evaluating for (session, user, multi) | `LDContext.tsx` builds session-only or `multi{session,user}` |
| **`identify()`** | Switch to a new context (e.g. login) | `LDContextSync.tsx` calls it on persona change |
| **`variation()`** | Read a flag value | wrapped by `useFeatureFlag` |
| **`track()`** | Send a conversion/metric event | `useTrackConversion` (or via GTM dataLayer) |
| **`on('change')`** | React to live flag updates (streaming) | subscribed in `useFeatureFlag` |
