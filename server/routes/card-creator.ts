import { Router } from 'express';
import type { LDClient } from '@launchdarkly/node-server-sdk';
import type { LDAIClient } from '@launchdarkly/server-sdk-ai';

const FALLBACK_CONFIG = { enabled: false };

interface TogglemonCard {
  name: string;
  type: 'Fire' | 'Water' | 'Electric' | 'Shadow' | 'Glitch' | 'Void';
  hp: number;
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Holo Rare' | 'Ultra Rare';
  moves: Array<{ name: string; damage: number; description: string }>;
  weakness: string;
  resistance: string;
  flavorText: string;
  imagePrompt: string;
  /** Optional label for special-edition prompts (e.g. "Summer Heat Special Edition"). */
  edition?: string;
}

const VALID_TYPES: TogglemonCard['type'][] = [
  'Fire',
  'Water',
  'Electric',
  'Shadow',
  'Glitch',
  'Void',
];

const VALID_RARITIES: TogglemonCard['rarity'][] = [
  'Common',
  'Uncommon',
  'Rare',
  'Holo Rare',
  'Ultra Rare',
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateMove(value: unknown): value is TogglemonCard['moves'][number] {
  if (!value || typeof value !== 'object') return false;
  const move = value as Record<string, unknown>;
  return (
    isNonEmptyString(move.name) &&
    isFiniteNumber(move.damage) &&
    typeof move.description === 'string'
  );
}

function validateTogglemonCard(body: unknown): TogglemonCard | null {
  if (!body || typeof body !== 'object') return null;
  const card = body as Record<string, unknown>;

  if (!isNonEmptyString(card.name)) return null;
  if (!VALID_TYPES.includes(card.type as TogglemonCard['type'])) return null;
  if (!isFiniteNumber(card.hp)) return null;
  if (!VALID_RARITIES.includes(card.rarity as TogglemonCard['rarity'])) return null;
  if (!Array.isArray(card.moves) || !card.moves.every(validateMove)) return null;
  if (typeof card.weakness !== 'string') return null;
  if (typeof card.resistance !== 'string') return null;
  if (typeof card.flavorText !== 'string') return null;
  if (typeof card.imagePrompt !== 'string') return null;
  // edition is optional; if present it must be a string.
  if (card.edition !== undefined && typeof card.edition !== 'string') return null;

  return {
    name: card.name,
    type: card.type as TogglemonCard['type'],
    hp: card.hp,
    rarity: card.rarity as TogglemonCard['rarity'],
    moves: card.moves,
    weakness: card.weakness,
    resistance: card.resistance,
    flavorText: card.flavorText,
    imagePrompt: card.imagePrompt,
    // Pass through a special-edition label (capped) when the prompt sets one.
    ...(isNonEmptyString(card.edition) ? { edition: card.edition.slice(0, 40) } : {}),
  };
}

/**
 * OpenAI keys are ASCII with no whitespace. Strip any stray characters
 * (e.g. a U+2028 line separator introduced by pasting into a dashboard)
 * that would otherwise break the SDK's HTTP auth header.
 */
function openAiApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.replace(/\s+/g, '');
}

/**
 * Build the LD context for evaluating the AI Config, mirroring the client
 * (src/context/LDContext.tsx) so flag/experiment bucketing and metric events
 * share the same units:
 *   - anonymous  → session-only  { kind: 'session' }
 *   - identified → multi { session, user }
 * Including session lets experiments randomize on session (so anonymous users
 * are bucketed and their conversions attributed).
 */
function ldContextFromBody(userContext?: Record<string, unknown>, sessionKey?: string) {
  const session = isNonEmptyString(sessionKey)
    ? { kind: 'session' as const, key: sessionKey }
    : undefined;

  const isAnonymous = !userContext?.key || userContext.anonymous === true;

  if (isAnonymous) {
    // Match the client: an anonymous visitor is a session-only context.
    return session ?? { kind: 'user' as const, key: 'anonymous-card-creator-user', anonymous: true };
  }

  const user = {
    kind: 'user' as const,
    key: String(userContext!.key),
    name: userContext!.name as string | undefined,
    email: userContext!.email as string | undefined,
    country: userContext!.country as string | undefined,
    state: userContext!.state as string | undefined,
    memberTier: userContext!.memberTier as string | undefined,
    memberSince: userContext!.memberSince as string | undefined,
    lifetimeSpend: userContext!.lifetimeSpend as number | undefined,
    preferredCategory: userContext!.preferredCategory as string | undefined,
    earlyAccessEnabled: userContext!.earlyAccessEnabled as boolean | undefined,
    anonymous: false,
  };

  return session ? { kind: 'multi' as const, session, user } : user;
}

/** Trip the safety gate at/above this toxicity score (0-1). */
const TOXICITY_THRESHOLD = 0.7;

/**
 * Friendly stand-in card returned when a description trips the content-safety
 * gate. Its imagePrompt is wholesome, so the image model draws something cute.
 */
const NONOMON_CARD: TogglemonCard = {
  name: 'NoNoMon',
  type: 'Glitch',
  hp: 1,
  rarity: 'Common',
  moves: [
    {
      name: 'Naughty Filter',
      damage: 0,
      description: "Blocks questionable prompts before they hatch. Let's keep it friendly!",
    },
    {
      name: 'Gentle Reset',
      damage: 0,
      description: 'Describe a cool, family-friendly creature and NoNoMon will step aside.',
    },
  ],
  weakness: 'Kindness',
  resistance: 'Good Manners',
  flavorText:
    'NoNoMon appears when a prompt gets a little too spicy — no hard feelings, give it another go!',
  imagePrompt:
    'An adorable friendly cartoon bear mascot gently shaking its head "no" with a warm smile and one paw raised in a soft "stop" gesture, wholesome family-friendly cute sticker style, soft pastel colors, simple plain background',
};

/**
 * Synchronous content-safety check on the user's description via OpenAI
 * Moderations. Trips on OpenAI's own `flagged` decision or any category score
 * at/above TOXICITY_THRESHOLD. Fails open (allow) if moderation itself errors —
 * the image model's own moderation still guards the generated art.
 */
async function isDescriptionToxic(openai: any, description: string): Promise<boolean> {
  try {
    const mod = await openai.moderations.create({
      model: 'omni-moderation-latest',
      input: description,
    });
    const result = mod.results?.[0];
    if (!result) return false;

    const scores = (result.category_scores ?? {}) as Record<string, number>;
    const maxScore = Math.max(
      0,
      ...Object.values(scores).filter((s): s is number => typeof s === 'number'),
    );

    // Trip at/above the configured threshold. We deliberately do NOT trip on
    // OpenAI's broad `flagged` alone — it blocks mild, silly prompts (e.g.
    // "hits people with his butt" ~0.55 violence) that should still generate.
    // Genuine hate/threats/violence/sexual content scores well above 0.7.
    if (maxScore >= TOXICITY_THRESHOLD) return true;

    // Zero-tolerance: any hint of sexual content involving minors is blocked
    // at a far lower score, regardless of the general threshold.
    const sexualMinors = typeof scores['sexual/minors'] === 'number' ? scores['sexual/minors'] : 0;
    return sexualMinors >= 0.2;
  } catch (error) {
    console.error('[CardCreator] Moderation check failed (allowing):', error);
    return false;
  }
}

export function createCardCreatorRouter(ldClient: LDClient, aiClient: LDAIClient) {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const { description, userContext, sessionKey } = req.body as {
        description: string;
        userContext?: Record<string, unknown>;
        sessionKey?: string;
      };

      if (!description || typeof description !== 'string') {
        res.status(400).json({ error: 'Description is required' });
        return;
      }

      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: openAiApiKey() });

      // Content-safety gate: a toxic description gets the friendly NoNoMon card
      // instead of generating from the bad prompt.
      if (await isDescriptionToxic(openai, description)) {
        res.json(NONOMON_CARD);
        return;
      }

      // Cast to any for the same reason the client does (LDContext.tsx): LD's
      // multi-context type doesn't cleanly accept our inferred literal.
      const context = ldContextFromBody(userContext, sessionKey) as any;

      const aiConfig = await aiClient.completionConfig(
        'togglemon-card-creator',
        context,
        FALLBACK_CONFIG,
      );

      if (!aiConfig.enabled) {
        res.status(503).json({ error: 'Card creator is currently unavailable' });
        return;
      }

      const configMessages = (aiConfig.messages || []) as Array<{ role: string; content: string }>;
      const allMessages = [
        ...configMessages,
        { role: 'user' as const, content: description },
      ];

      const modelName = aiConfig.model?.name || 'gpt-4o';
      const temperature = (aiConfig.model?.parameters?.temperature as number) ?? 0.7;

      let responseText: string;

      if (aiConfig.tracker) {
        // trackOpenAIMetrics auto-extracts tokens (input/output/total) plus
        // duration and success/error from the OpenAI response. The previous
        // trackMetricsOf extractor mis-keyed tokens (inputTokens/outputTokens
        // vs the SDK's usage:{input,output,total}), so only success/error were
        // recorded and the Monitor tab's token columns stayed empty.
        const response = await aiConfig.tracker.trackOpenAIMetrics(() =>
          openai.chat.completions.create({
            model: modelName,
            messages: allMessages as any,
            temperature,
            max_tokens: 1000,
          }),
        );
        responseText = response.choices[0]?.message?.content || '';
      } else {
        const response = await openai.chat.completions.create({
          model: modelName,
          messages: allMessages as any,
          temperature,
          max_tokens: 1000,
        });
        responseText = response.choices[0]?.message?.content || '';
      }

      // Flush AI metrics to LD now. On serverless (Vercel) the function suspends
      // after responding, so the SDK's ~30s timed flush often never fires and
      // the generation metrics (tokens/latency/success) never reach the Monitor
      // tab. Awaiting a flush here guarantees delivery per generation.
      try {
        await ldClient.flush();
      } catch (flushErr) {
        console.error('[CardCreator] LD flush failed:', flushErr);
      }

      const cleaned = responseText.replace(/```json|```/g, '').trim();

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        res.status(500).json({ error: 'Failed to parse card data', raw: responseText });
        return;
      }

      const card = validateTogglemonCard(parsed);
      if (!card) {
        res.status(500).json({ error: 'Invalid card data from model', raw: responseText });
        return;
      }

      res.json(card);
    } catch (error) {
      console.error('[CardCreator] Error:', error);
      // Flush so a failed generation's error metric still reaches the Monitor tab.
      try {
        await ldClient.flush();
      } catch {
        /* ignore */
      }
      res.status(500).json({
        error: 'Failed to generate card',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Phase 2: generate trading-card art from a card's imagePrompt via gpt-image-1.
  router.post('/art', async (req, res) => {
    try {
      const { imagePrompt } = req.body as { imagePrompt?: string };

      if (!isNonEmptyString(imagePrompt)) {
        res.status(400).json({ error: 'imagePrompt is required' });
        return;
      }

      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: openAiApiKey() });

      // The card frame + stats are drawn by the app, so the generated image
      // should be creature art only. Image models render text as gibberish,
      // so explicitly forbid any text, labels, or card framing.
      const artPrompt =
        `${imagePrompt}\n\n` +
        'Render ONLY the creature/scene as a full-bleed illustration. ' +
        'Absolutely no text, words, letters, numbers, labels, captions, titles, ' +
        'logos, or watermarks anywhere in the image. Do not draw a card frame, ' +
        'border, or trading-card layout — just the raw artwork.';

      // gpt-image-1 fails sporadically (transient 429/5xx). Retry those a
      // couple of times with a short backoff so the demo actually shows art;
      // do NOT retry content-policy 400s (they'd just fail again).
      const MAX_ATTEMPTS = 3;
      let lastError: unknown;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const result = await openai.images.generate({
            model: 'gpt-image-1',
            prompt: artPrompt,
            n: 1,
            // Landscape (~1.5:1) matches the card art box (230x150), so the
            // image fills it with almost no cropping.
            size: '1536x1024',
            // 'low' keeps generation well under the function timeout.
            quality: 'low',
            // JPEG payload is far smaller than PNG — faster to transfer/display
            // and safely under the serverless response size limit.
            output_format: 'jpeg',
            output_compression: 80,
          } as any);

          // gpt-image-1 returns base64; DALL·E returns a URL. Support either.
          const image = result.data?.[0];
          const imageUrl = image?.url
            ? image.url
            : image?.b64_json
              ? `data:image/jpeg;base64,${image.b64_json}`
              : undefined;

          if (!imageUrl) throw new Error('No image was returned');

          res.json({ imageUrl });
          return;
        } catch (err) {
          lastError = err;
          const status = (err as { status?: number })?.status;
          console.error(
            `[CardCreator/art] attempt ${attempt}/${MAX_ATTEMPTS} failed` +
              (status ? ` (status ${status})` : '') +
              ':',
            err instanceof Error ? err.message : err,
          );
          const transient = status === undefined || status === 408 || status === 429 || status >= 500;
          if (attempt < MAX_ATTEMPTS && transient) {
            await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
            continue;
          }
          break;
        }
      }

      res.status(500).json({
        error: 'Failed to generate art',
        detail: lastError instanceof Error ? lastError.message : String(lastError),
      });
    } catch (error) {
      console.error('[CardCreator/art] Error:', error);
      res.status(500).json({
        error: 'Failed to generate art',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
