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
}

function ldUserFromBody(userContext?: Record<string, unknown>) {
  if (!userContext?.key) {
    return { kind: 'user' as const, key: 'anonymous-card-creator-user', anonymous: true };
  }
  if (userContext.anonymous === true) {
    return {
      kind: 'user' as const,
      key: String(userContext.key),
      anonymous: true,
    };
  }
  return {
    kind: 'user' as const,
    key: String(userContext.key),
    name: userContext.name as string | undefined,
    email: userContext.email as string | undefined,
    country: userContext.country as string | undefined,
    state: userContext.state as string | undefined,
    memberTier: userContext.memberTier as string | undefined,
    memberSince: userContext.memberSince as string | undefined,
    lifetimeSpend: userContext.lifetimeSpend as number | undefined,
    preferredCategory: userContext.preferredCategory as string | undefined,
    earlyAccessEnabled: userContext.earlyAccessEnabled as boolean | undefined,
    anonymous: false,
  };
}

export function createCardCreatorRouter(_ldClient: LDClient, aiClient: LDAIClient) {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const { description, userContext } = req.body as {
        description: string;
        userContext?: Record<string, unknown>;
      };

      if (!description || typeof description !== 'string') {
        res.status(400).json({ error: 'Description is required' });
        return;
      }

      const context = ldUserFromBody(userContext);

      const aiConfig = await aiClient.completionConfig(
        'togglemon-card-creator',
        context,
        FALLBACK_CONFIG,
      );

      if (!aiConfig.enabled) {
        res.status(503).json({ error: 'Card creator is currently unavailable' });
        return;
      }

      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const configMessages = (aiConfig.messages || []) as Array<{ role: string; content: string }>;
      const allMessages = [
        ...configMessages,
        { role: 'user' as const, content: description },
      ];

      const modelName = aiConfig.model?.name || 'gpt-4o';
      const temperature = (aiConfig.model?.parameters?.temperature as number) ?? 0.7;

      let responseText: string;

      if (aiConfig.tracker) {
        const response = await aiConfig.tracker.trackMetricsOf(
          (result) => ({
            success: true,
            inputTokens: result.usage?.prompt_tokens ?? 0,
            outputTokens: result.usage?.completion_tokens ?? 0,
          }),
          () =>
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

      const cleaned = responseText.replace(/```json|```/g, '').trim();

      let card: TogglemonCard;
      try {
        card = JSON.parse(cleaned) as TogglemonCard;
      } catch {
        res.status(500).json({ error: 'Failed to parse card data', raw: responseText });
        return;
      }

      res.json(card);
    } catch (error) {
      console.error('[CardCreator] Error:', error);
      res.status(500).json({
        error: 'Failed to generate card',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
