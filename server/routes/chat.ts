import { Router } from 'express';
import type { LDClient } from '@launchdarkly/node-server-sdk';
import type { LDAIClient } from '@launchdarkly/server-sdk-ai';

const FALLBACK_CONFIG = { enabled: false };

const GRAVITY_FARMS_CONTEXT = `You are a friendly customer support assistant for Gravity Farms Petfood, a fresh pet food subscription company based in Gravity Falls. You help customers with questions about our products, plans, ingredients, delivery, and general pet nutrition.

Key facts:
- We offer three plans: Basic Bites ($29/mo), Premium Paws ($49/mo), and Deluxe Den ($79/mo)
- All meals are made with human-grade, locally sourced ingredients
- Meals arrive chilled and ready to serve
- We currently focus on dog food, with cat food coming soon
- Free shipping on all orders; flexible skip or cancel anytime
- Founded by animal lovers in Gravity Falls who wanted better food for their dogs Wendy and Mabel
- Recipes developed with real veterinarians and animal nutritionists

Be helpful, warm, and occasionally playful. Keep answers concise.`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function createChatRouter(ldClient: LDClient, aiClient: LDAIClient) {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const { message, history = [], userContext } = req.body as {
        message: string;
        history: ChatMessage[];
        userContext?: Record<string, any>;
      };

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      const context = userContext?.key
        ? {
            kind: 'user' as const,
            key: userContext.key,
            name: userContext.name,
            country: userContext.country,
            petType: userContext.petType,
            planType: userContext.planType,
          }
        : { kind: 'user' as const, key: 'anonymous-chat-user', anonymous: true };

      const aiConfig = await aiClient.completionConfig(
        'gravity-farms-chatbot',
        context,
        FALLBACK_CONFIG,
        { productContext: GRAVITY_FARMS_CONTEXT },
      );

      if (!aiConfig.enabled) {
        res.json({
          reply: "I'm sorry, the chat assistant is currently unavailable. Please check back later or browse our FAQ page for answers to common questions.",
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
