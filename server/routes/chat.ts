import { Router } from 'express';
import type { LDClient } from '@launchdarkly/node-server-sdk';
import type { LDAIClient } from '@launchdarkly/server-sdk-ai';

const FALLBACK_CONFIG = { enabled: false };

const DARKTRAINERS_CONTEXT = `You are the DarkTrainers virtual assistant. DarkTrainers is a premium limited-drop sneaker brand. You help customers find the right sneaker for their activity, understand our VIP membership benefits, and check on drop schedules. You are knowledgeable, direct, and speak like someone who genuinely loves sneaker culture. Keep responses concise — under 3 sentences unless the customer asks for detail.`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function ldUserFromBody(userContext?: Record<string, unknown>) {
  if (!userContext?.key) {
    return { kind: 'user' as const, key: 'anonymous-chat-user', anonymous: true };
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

export function createChatRouter(_ldClient: LDClient, aiClient: LDAIClient) {
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

      const aiConfig = await aiClient.completionConfig(
        'darktrainers-chatbot',
        context,
        FALLBACK_CONFIG,
        { productContext: DARKTRAINERS_CONTEXT },
      );

      if (!aiConfig.enabled) {
        res.json({
          reply:
            "I'm sorry, the chat assistant is currently unavailable. Please check back later or browse our FAQ page for answers to common questions.",
          source: 'fallback',
        });
        return;
      }

      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const configMessages = (aiConfig.messages || []) as Array<{ role: string; content: string }>;
      const allMessages = [
        ...configMessages,
        ...history.map((m: ChatMessage) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: message },
      ];

      const modelName = aiConfig.model?.name || 'gpt-4o-mini';
      const temperature = (aiConfig.model?.parameters?.temperature as number) ?? 0.7;

      let reply: string;

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
              max_tokens: 500,
            }),
        );
        reply = response.choices[0]?.message?.content || "I'm not sure how to answer that.";
      } else {
        const response = await openai.chat.completions.create({
          model: modelName,
          messages: allMessages as any,
          temperature,
          max_tokens: 500,
        });
        reply = response.choices[0]?.message?.content || "I'm not sure how to answer that.";
      }

      res.json({ reply, source: 'ai-config' });
    } catch (error) {
      console.error('[Chat] Error:', error);
      res.status(500).json({
        error: 'Failed to generate response',
        reply: "I'm having trouble right now. Please try again in a moment.",
      });
    }
  });

  return router;
}
