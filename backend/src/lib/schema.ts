// src/lib/schema.ts
// Using ESM default import for Ajv v8
import AjvModule, { type JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';

// Bridge Ajv's ESM default to a constructable type - there is always a problem with this in ESM mode - Tony Nagy
const Ajv = AjvModule as unknown as typeof AjvModule.default;

// Create the instance normally
const ajv = new Ajv({
  allErrors: true,
  strict: true,
});

type AjvCtor = typeof AjvModule.default;
type AjvInstance = InstanceType<AjvCtor>;

const addFormatsSafe = addFormats as unknown as (instance: AjvInstance) => unknown;
addFormatsSafe(ajv);

export function validateJson<T>(schema: JSONSchemaType<T>, data: unknown): T {
  const validate = ajv.compile(schema);
  if (!validate(data)) {
    const msg = (validate.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message}`).join('; ');
    throw new Error(`Schema validation failed: ${msg}`);
  }
  return data as T;
}

