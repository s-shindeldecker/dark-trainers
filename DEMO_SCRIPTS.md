## DarkTrainers Demo Scripts

### Scenario 1 — Basic Experiment: Promo Banner Copy

**The story:** "Here's how we run a simple experiment in LaunchDarkly — from flag to results. We're testing two messages on the promo banner to see which drives more VIP upgrades."

**What you show, step by step:**

1. Open DarkTrainers, make sure you're on Guest or Standard persona
2. Show the promo banner at the top — point out it's controlled by the `promo-banner-text` flag
3. Switch to LD → show the `promo-banner-text` flag with two string variations:
  - Control: `"Members get early access -- shop the drop"`
  - Treatment: `"Toggle your savings ON! Become a VIP today"`
4. Open the experiment → show it's measuring `banner-clicks`, `upgraded-to-vip`, and `average-checkout-size-per-user`
5. Show the results — which variation is winning and why it matters

**The insight to land:** "Notice we're not just measuring clicks — we're measuring downstream revenue impact. A banner that gets more clicks but fewer upgrades is actually worse. That's why we chain metrics."

---

### Scenario 2 — Layers / Mutual Exclusion: Checkout Layer

**The story:** "SXF runs multiple experiments simultaneously. Without layers, a user could be in both a PDP layout experiment AND a CTA copy experiment at the same time — and you'd never know which one caused the result. Layers fix that."

**What you show, step by step:**

1. Open LD → Layers → show the "Checkout Layer"
2. Show it contains two experiments:
  - `pdp-hero-layout` (A/B: standard vs editorial)
  - `find-the-best-cta-for-vip-signups` (MAB on `vip-upgrade-cta-copy`)
3. Explain the traffic math — if each experiment gets 50% of eligible traffic, the layer ensures no user is in both
4. Switch to VIP persona in DarkTrainers, go to a PDP — show which layout they're seeing
5. Open the VIP upgrade modal — show which CTA copy they're seeing
6. Go back to LD → show that these are mutually exclusive in the layer

**The insight to land:** "At SXF's scale, with dozens of concurrent experiments, layers are what keep your results trustworthy. Without them you're not running experiments — you're generating noise."

**One thing to be ready for:** Someone will ask what happens to users who don't land in either experiment due to traffic reservation. Have the answer ready — they get the default flag value, which is your control experience.

---

### Scenario 3 — Stratified Sampling: PDP Hero Layout

**The story:** "This is where it gets interesting for a customer like SXF. You have VIP members who spend 7x more than standard members. If random assignment puts 70% of your VIPs in one variation, that variation looks like a winner — but it's not the feature, it's the audience. Stratified sampling fixes that before the experiment even starts."

**What you show, step by step:**

1. Open LD → show `pdp-hero-layout` experiment, **Iteration 1** (no stratified sampling)
2. Show the audience split — point out the VIP user imbalance in the results. Your 27/17 split is the visual proof
3. Explain: "27 VIP users in variation A vs 17 in variation B. At an average VIP order value of $620, that's a $6,200 spend difference before we've even tested anything. That's not signal — that's noise."
4. Now show **Iteration 2** — same experiment, same metric, but with stratified sampling CSV uploaded
5. Show the balanced VIP distribution across variations
6. Show how the results change — or more precisely, how you can now trust them

**The insight to land:** "Iteration 1 might have told you editorial layout drives more revenue. Iteration 2 tells you the truth. For a company running 15+ concurrent experiments at SXF's scale, the difference between these two iterations is the difference between shipping the wrong features confidently and shipping the right ones."

**The SXF connection to make explicitly:** "You mentioned the CUPED bug earlier this year undermined confidence in your experiment results. Stratified sampling is the proactive version of that same trust problem — you're not fixing bad data after the fact, you're preventing imbalanced data from the start."

---

### Scenario 4 — AI Configs, Governance & Experimentation: Togglemon Card Creator

**The story:** "This is where feature management meets AI. The Togglemon Card Creator turns a text description into a trading card with AI-generated art. Every part of that AI behavior — the prompt, the model, the safety rules, even the art style — is controlled in LaunchDarkly, not in code. So you can change it, target it, experiment on it, and prove it's safe, all without a deploy."

**What you show, step by step:**

1. Open the Card Creator (`/collectibles/card-creator`, gated by `show-card-creator`). Describe a creature and generate — a full card renders, then the AI art loads in.
2. **AI Configs are live-editable.** In LD → AI Configs → `togglemon-card-creator`, show the prompt variations (`baseline`, `holographic`, `summer-beach`). Edit the *style* line of a prompt (e.g. "cartoon" → "photoreal"), save, regenerate — the output changes with **no code deploy**. *(Only edit the style/creative lines live — leave the JSON contract and enums alone, or the card fails validation.)*
3. **Experiment across prompts.** Show an experiment split over the variations, measured on `add_to_cart` and `card_downloaded`. Use the demo panel's **New session** button to re-roll the randomization unit and land in different variations; the AI Config **Monitor** tab shows tokens, latency, cost, and success/error **per variation**.
4. **Governance / safety.** Type a clearly inappropriate (but non-graphic) description — e.g. a direct threat — and generate. Instead of a real card you get the friendly **NoNoMon** stand-in: the description was screened by moderation (≥ 0.7) before generation. Point out the **Toxicity judge** attached at 100% sampling scoring every real generation in the Monitor tab.
5. **Integration your way.** Toggle `track-conversions-via-gtm` to show conversions flowing either directly to LaunchDarkly or **through your existing GTM data layer** — one flag, no redeploy.

**The insight to land:** "The AI's prompt, model, safety threshold, and rollout are configuration, not code. That means the people who own the *experience* — product, marketing, trust & safety — can tune and govern the AI in real time, measure it per variation, and prove it's safe, without waiting on an engineering release. That's how you ship AI features responsibly at scale."

**One thing to be ready for:** Image generation is a live model call, so it occasionally fails or is refused — the card gracefully falls back to showing the art prompt as text, and the browser console logs the reason. Frame it as the resilience story: *a flaky dependency never breaks the experience.*

---

### The Discovery Question to Open Your Session

Before diving into any scenario, ask this one question:

**"When you look at your current experiment results, what's the thing your data team is most likely to push back on?"**

Their answer tells you which scenario to lead with:

- "We're not sure the audience is comparable across variations" → go straight to Stratified Sampling
- "We have too many experiments running at once and we're not sure they're interfering" → go to Layers first
- "We're still figuring out which metrics to trust" → start with the Basic Experiment and metric chaining
- "We're shipping AI features and worried about controlling and governing them" → go to the Card Creator (AI Configs + safety)

---

### One Thing to Have Ready for Every Scenario

The LD debugger open in a second browser tab showing Live Events. Being able to say "watch what happens in LaunchDarkly right now as I switch personas" while the events appear in real time is more compelling than any slide. It makes the abstract concrete.