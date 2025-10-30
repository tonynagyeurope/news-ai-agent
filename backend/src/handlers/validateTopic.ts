import { APIGatewayProxyResultV2 } from 'aws-lambda';
import { TopicValidationInput, TopicValidationOutput } from '@shared/types.js';
import { openai, resolveModel } from '../lib/openai.js';
import { JSONSchemaType } from 'ajv';
import { validateJson } from '../lib/schema.js';

const outputSchema: JSONSchemaType<TopicValidationOutput> = {
  type: 'object',
  properties: {
    valid: { type: 'boolean' },
    topic: { type: 'string' },
    reason: { type: 'string', nullable: true }
  },
  required: ['valid','topic'],
  additionalProperties: false
};

export async function handler(event: { body: string }): Promise<APIGatewayProxyResultV2> {
  const input = JSON.parse(event.body ?? '{}') as TopicValidationInput;
  const client = openai();
  const model = resolveModel('fast');

  const system = `You are a strict topic validator.
- Accept short, meaningful topics (1-3 words), e.g. "golf", "blockchain security".
- Reject vague, silly, or unsafe topics.
Output strict JSON: {"valid": boolean, "topic": string, "reason"?: string}`;
  const user = `Topic: "${input.raw}"`;

  const resp = await client.chat.completions.create({
    model,
    messages: [{ role:'system', content: system }, { role:'user', content: user }],
    response_format: { type: 'json_object' }
  });

  const parsed = JSON.parse(resp.choices[0].message.content ?? '{}');
  const data = validateJson(outputSchema, parsed);

  if (!data.valid) {
    return { statusCode: 400, body: JSON.stringify(data) };
  }
  return { statusCode: 200, body: JSON.stringify(data) };
}
