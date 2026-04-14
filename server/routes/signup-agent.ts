import { Router } from 'express';
import type { LDClient } from '@launchdarkly/node-server-sdk';
import type { LDAIClient } from '@launchdarkly/server-sdk-ai';

const FALLBACK_CONFIG = { enabled: false };

const PRODUCT_CATALOG = `Gravity Farms Petfood Plans:

1. Basic Bites ($29/month)
   - Fresh meals delivered weekly
   - Choose from 3 recipes
   - Free shipping on all orders
   - Flexible skip or cancel anytime

2. Premium Paws ($49/month) - Most Popular
   - Everything in Basic Bites
   - Choose from 8 rotating recipes
   - Custom portion sizing
   - Priority delivery windows
   - Vet nutritionist support

3. Deluxe Den ($79/month)
   - Everything in Premium Paws
   - Unlimited recipe selection
   - Allergy-friendly custom meals
   - Monthly treat box included
   - Dedicated account manager
   - Early access to new recipes

Recipes available: Chicken & Sweet Potato, Beef & Brown Rice, Turkey & Pumpkin, Pork & Green Bean.
All recipes are human-grade, vet-formulated, complete and balanced, and gently cooked.`;

const SYSTEM_INSTRUCTIONS = `You are a friendly signup assistant for Gravity Farms Petfood. Your job is to help a customer find the perfect meal plan for their pet through a natural conversation.

Conversation flow:
1. Greet the customer warmly and ask for their pet's name
2. Ask what type of pet they have (dog or cat — note that cat food is "coming soon", but still help them)
3. Ask about their pet's age/life stage (puppy, adult, senior)
4. Ask about any dietary concerns or allergies
5. Ask about activity level (low, moderate, high)
6. Ask about budget preference (budget-friendly, mid-range, premium)
7. Based on their answers, recommend ONE specific plan with a brief rationale

When you make a recommendation, you MUST include a JSON block at the end of your message in exactly this format:
|||RECOMMENDATION:{"planId":"basic"|"premium"|"deluxe","planName":"plan name"}|||

Only include the recommendation block when you have gathered enough information and are ready to recommend. Do not include it in earlier messages.

Be warm, conversational, and occasionally playful. Keep messages concise (2-3 sentences per turn). Ask only one question at a time.

${PRODUCT_CATALOG}`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function createSignupAgentRouter(ldClient: LDClient, aiClient: LDAIClient) {
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
        : { kind: 'user' as const, key: 'anonymous-signup-user', anonymous: true };

      let instructions: string = SYSTEM_INSTRUCTIONS;
      let modelName = 'gpt-4o-mini';
      let temperature = 0.7;
      let tracker: any = null;

      try {
        const agentConfig = await aiClient.agentConfig(
          'gravity-farms-signup-agent',
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
          // Ignore parse errors — just return reply without recommendation
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
