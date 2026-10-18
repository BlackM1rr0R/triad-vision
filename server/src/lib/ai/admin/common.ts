import type { Request } from 'express';
import type { Role } from '@prisma/client';
import type { z } from 'zod';
import { HttpError, forbidden } from '../../http.js';
import { DriveAccessCtx } from '../../drive/access.js';
import { FileLockedError } from '../../driveCollab/lock.js';
import type { AiTool, AiToolContext } from '../types.js';
import { toJsonSchema } from './schema.js';

/** Helpers shared by the super-admin tools. */

export type Locale = 'az' | 'de' | 'en' | 'ru';
export type Texts = Record<Locale, string>;

export const localeOf = (ctx: AiToolContext): Locale => {
  const l = (ctx.user.locale ?? '').toLowerCase().slice(0, 2);
  return l === 'de' || l === 'en' || l === 'ru' ? l : 'az';
};

/** Picks the sentence in the user's language. */
export const tr = (ctx: AiToolContext, t: Texts) => t[localeOf(ctx)];

/** Every admin tool runs as the logged-in super admin only. */
export const assertSuper = (ctx: AiToolContext) => {
  if (ctx.user.role !== 'SUPER_ADMIN') throw forbidden('SUPER_ADMIN_ONLY');
};

/** Request-like actor for lib/audit.ts (no IP: the action comes from the assistant). */
export const actorReq = (ctx: AiToolContext): Pick<Request, 'user' | 'ip'> => ({
  user: { id: ctx.user.id, role: ctx.user.role as Role, email: ctx.user.email, firstName: ctx.user.firstName, lastName: ctx.user.lastName, locale: ctx.user.locale },
  ip: undefined,
});

export const driveCtx = (ctx: AiToolContext) => new DriveAccessCtx({ id: ctx.user.id, role: ctx.user.role as Role });

export interface ToolSpec<S extends z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  confirm?: boolean;
  summary?: (args: z.infer<S>, ctx: AiToolContext) => string | Promise<string>;
  run: (args: z.infer<S>, ctx: AiToolContext) => Promise<unknown>;
}

/** Builds an ADMIN tool: JSON parameters from the zod schema, super-admin check before every run. */
export const defineTool = <S extends z.ZodTypeAny>(spec: ToolSpec<S>): AiTool<z.infer<S>> => ({
  name: spec.name,
  description: spec.description,
  scope: 'ADMIN',
  schema: spec.schema as unknown as z.ZodType<z.infer<S>>,
  parameters: toJsonSchema(spec.schema),
  ...(spec.confirm ? { confirm: true } : {}),
  ...(spec.summary ? { summary: spec.summary } : {}),
  run: async (args, ctx) => {
    assertSuper(ctx);
    try {
      return await spec.run(args, ctx);
    } catch (err) {
      throw explain(err);
    }
  },
});

/**
 * The core reports only the code of an HttpError to the model; errors that carry useful detail (who
 * holds a lock, ambiguous candidates) get it into the code, keeping the status.
 */
export const explain = (err: unknown) => {
  if (err instanceof FileLockedError) {
    const e = new HttpError(423, `FILE_LOCKED: locked by ${err.lockedBy.name} since ${err.lockedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    return e;
  }
  if (err instanceof HttpError && err.message && err.message !== err.code && err.message.startsWith(err.code)) return new HttpError(err.status, err.message.slice(0, 300));
  return err;
};

/** "a, b, c and 4 more" for confirm cards. */
export const listNames = (names: string[], max = 5) => {
  const shown = names.slice(0, max).map((n) => `"${n}"`);
  return names.length > max ? `${shown.join(', ')} +${names.length - max}` : shown.join(', ');
};

export const money = (cents: number | null | undefined, currency = '') => (cents == null ? '—' : `${(cents / 100).toFixed(2).replace(/\.00$/, '')}${currency ? ` ${currency}` : ''}`);

/** Formats a per-currency bag { AZN: 12300, EUR: 500 } → "123 AZN, 5 EUR". */
export const bag = (b: Partial<Record<string, number>>) =>
  Object.entries(b)
    .filter(([, v]) => !!v)
    .map(([c, v]) => money(v, c))
    .join(', ') || '0';

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
