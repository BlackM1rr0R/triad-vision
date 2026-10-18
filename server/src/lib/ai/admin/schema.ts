import { z } from 'zod';

/**
 * Minimal zod (v3) → JSON schema conversion for the tool parameters sent to the model. Covers what the
 * admin tools use: objects, strings, numbers, booleans, enums, literals, arrays, records, unions,
 * optional / nullable / default and refinements (described by `.describe()`). Anything else becomes `{}`.
 */

type Json = Record<string, unknown>;

const withDesc = (s: Json, def: { description?: string }) => (def.description ? { ...s, description: def.description } : s);

export const toJsonSchema = (schema: z.ZodTypeAny): Json => {
  const def = schema._def as { typeName: string; description?: string } & Record<string, unknown>;
  switch (def.typeName) {
    case 'ZodObject': {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, Json> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = toJsonSchema(value as z.ZodTypeAny);
        if (!(value as z.ZodTypeAny).isOptional()) required.push(key);
      }
      return withDesc({ type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false }, def);
    }
    case 'ZodString': {
      const out: Json = { type: 'string' };
      for (const c of (def.checks as { kind: string; value?: number }[]) ?? []) {
        if (c.kind === 'min') out.minLength = c.value;
        if (c.kind === 'max') out.maxLength = c.value;
      }
      return withDesc(out, def);
    }
    case 'ZodNumber': {
      const checks = (def.checks as { kind: string; value?: number; inclusive?: boolean }[]) ?? [];
      const out: Json = { type: checks.some((c) => c.kind === 'int') ? 'integer' : 'number' };
      for (const c of checks) {
        if (c.kind === 'min') out.minimum = c.value;
        if (c.kind === 'max') out.maximum = c.value;
      }
      return withDesc(out, def);
    }
    case 'ZodBoolean':
      return withDesc({ type: 'boolean' }, def);
    case 'ZodNull':
      return withDesc({ type: 'null' }, def);
    case 'ZodEnum':
      return withDesc({ type: 'string', enum: [...(def.values as string[])] }, def);
    case 'ZodNativeEnum':
      return withDesc({ type: 'string', enum: Object.values(def.values as Record<string, string>) }, def);
    case 'ZodLiteral':
      return withDesc({ const: def.value }, def);
    case 'ZodArray': {
      const out: Json = { type: 'array', items: toJsonSchema(def.type as z.ZodTypeAny) };
      if (def.minLength) out.minItems = (def.minLength as { value: number }).value;
      if (def.maxLength) out.maxItems = (def.maxLength as { value: number }).value;
      return withDesc(out, def);
    }
    case 'ZodRecord':
      return withDesc({ type: 'object', additionalProperties: toJsonSchema(def.valueType as z.ZodTypeAny) }, def);
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': {
      const options = (def.options as z.ZodTypeAny[] | Map<unknown, z.ZodTypeAny>) ?? [];
      const list = Array.isArray(options) ? options : [...options.values()];
      return withDesc({ anyOf: list.map(toJsonSchema) }, def);
    }
    case 'ZodOptional':
      return withDesc(toJsonSchema(def.innerType as z.ZodTypeAny), def);
    case 'ZodDefault': {
      const inner = toJsonSchema(def.innerType as z.ZodTypeAny);
      return withDesc({ ...inner, default: (def.defaultValue as () => unknown)() }, def);
    }
    case 'ZodNullable': {
      const inner = toJsonSchema(def.innerType as z.ZodTypeAny);
      return withDesc({ anyOf: [inner, { type: 'null' }] }, def);
    }
    case 'ZodEffects':
      return withDesc(toJsonSchema(def.schema as z.ZodTypeAny), def);
    case 'ZodPipeline':
      return withDesc(toJsonSchema(def.in as z.ZodTypeAny), def);
    default:
      return withDesc({}, def);
  }
};
