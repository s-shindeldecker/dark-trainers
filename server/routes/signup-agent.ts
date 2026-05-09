import { Router } from 'express';
import type { LDClient } from '@launchdarkly/node-server-sdk';
import type { LDAIClient } from '@launchdarkly/server-sdk-ai';

const FALLBACK_CONFIG = { enabled: false };

const PRODUCT_CATALOG = `DarkTrainers VIP Membership:

VIP — $14.99/month
- Early access to limited drops before public release
- Member pricing on sneakers (typically 15–20% off standard price)
- Priority support during high-traffic drop windows

Customers may also shop as Standard members or browse as guests; VIP is the premium tier for serious collectors and athletes.`;

const SYSTEM_INSTRUCTIONS = `You are a friendly signup assistant for DarkTrainers VIP membership. Help the customer decide if VIP is right for them through a short, natural conversation.

Conversation flow:
1. Greet warmly and ask what they usually wear sneakers for (running, basketball, lifestyle, training).
2. Ask how often they try to cop limited drops.
3. Ask if member pricing and early access would matter for their rotation.
4. When ready, recommend VIP membership with a brief rationale.

When you recommend VIP, you MUST end your message with a JSON block in exactly this format:
|||RECOMMENDATION:{"planId":"vip-monthly","planName":"DarkTrainers VIP"}|||

Only include that block on the final recommendation turn. Keep each message to 2–3 sentences; one question at a time.

${PRODUCT_CATALOG}`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function ldUserFromBody(userContext?: Record<string, unknown>) {
  if (!userContext?.key) {
    return { kind: 'user' as const, key: 'anonymous-signup-user', anonymous: true };
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

export function createSignupAgentRouter(ldClient: LDClient, aiClient: LDAIClient) {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const { message, history = [], userContext } = req.body as {
        message: string;
        history: ChatMessage[];
        userContext?: Record<string, unknown>;
      };

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      const context = ldUserFromBody(userContext);

      let instructions: string = SYSTEM_INSTRUCTIONS;
      let modelName = 'gpt-4o-mini';
      let temperature = 0.7;
      let tracker: any = null;

      try {
        const agentConfig = await aiClient.agentConfig(
          'darktrainers-signup-agent',
          context,
          FALLBACK_CONFIG,
          { productCatalog: PRODUCT_CATALOG },
        );

        if (agentConfig.enabled) {
          if (agentConfig.instructions) {
            instructions = agentConfig.instructions;
          }
          if (agentConfig.model?.name) {
            modelName = agentConfig.model.name;
          }
          if (agentConfig.model?.parameters?.temperature != null) {
            temperature = agentConfig.model.parameters.temperature as number;
          }
          tracker = agentConfig.tracker;
        }
      } catch (err) {
        console.warn('[SignupAgent] AI Config evaluation failed, using fallback instructions:', err);
      }

      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const allMessages = [
        { role: 'system' as const, content: instructions },
        ...history.map((m: ChatMessage) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: message },
      ];

      let reply: string;

      if (tracker) {
        const response = await tracker.trackMetricsOf(
          (result: any) => ({
            success: true,
            inputTokens: result.usage?.prompt_tokens ?? 0,
            outputTokens: result.usage?.completion_tokens ?? 0,
          }),
          () =>
            openai.chat.completions.create({
              model: modelName,
              messages: allMessages as any,
              temperature,
              max_tokens: 500,
            }),
        );
        reply = response.choices[0]?.message?.content || "I'm not sure how to help with that.";
      } else {
        const response = await openai.chat.completions.create({
          model: modelName,
          messages: allMessages as any,
          temperature,
          max_tokens: 500,
        });
        reply = response.choices[0]?.message?.content || "I'm not sure how to help with that.";
      }

      let recommendedPlan: { planId: string; planName: string } | undefined;
      const recMatch = reply.match(/\|\|\|RECOMMENDATION:(.*?)\|\|\|/);
      if (recMatch) {
        try {
          recommendedPlan = JSON.parse(recMatch[1]);
          reply = reply.replace(/\|\|\|RECOMMENDATION:.*?\|\|\|/, '').trim();
        } catch {
          // ignore
        }
      }

      res.json({ reply, recommendedPlan, source: 'agent-config' });
    } catch (error) {
      console.error('[SignupAgent] Error:', error);
      res.status(500).json({
        error: 'Failed to generate response',
        reply: "I'm having trouble right now. Please try again in a moment.",
      });
    }
  });

  return router;
}
