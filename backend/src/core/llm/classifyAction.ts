// backend/src/core/llm/classifyAction.ts
import { OpenAI } from 'openai';
import { AllowedAction, AllowedActions } from '@shared/types.js';
import { resolveModel } from 'src/lib/openai.js';

interface ActionOut { action: AllowedAction; confidence: number; }

export async function classifyAction(client: OpenAI, userIntent: string): Promise<ActionOut> {
  const sys = `Classify user intent to one of: ${AllowedActions.join(', ')}.
Return JSON: {"action":"...","confidence":0..1}. If ambiguous, prefer LIST_HEADLINES.`;

  const model = resolveModel('fast'); // Fast will be enough for classification
  
  const res = await client.chat.completions.create({
    model,
    messages: [{ role:'system', content: sys }, { role:'user', content: userIntent }],
    response_format: { type:'json_object' }
  });
  return JSON.parse(res.choices[0].message.content ?? '{}') as ActionOut;
}
