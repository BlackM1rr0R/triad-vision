import { z } from 'zod';
import type { Address } from './address.js';

/**
 * Inbox rules (pure matching; the actions are applied by sync.ts / routes). A rule matches when
 * every (`match: 'all'`, default) or any (`match: 'any'`) of its non-empty conditions holds.
 */
export const ruleConditionsSchema = z
  .object({
    match: z.enum(['all', 'any']).default('all'),
    from: z.string().trim().max(190).optional(),
    to: z.string().trim().max(190).optional(),
    subject: z.string().trim().max(300).optional(),
    hasAttachment: z.boolean().optional(),
  })
  .strict()
  .refine((c) => !!(c.from || c.to || c.subject || c.hasAttachment !== undefined), 'EMPTY_CONDITIONS');

export const ruleActionsSchema = z
  .object({
    addLabelId: z.string().trim().min(1).max(40).optional(),
    markRead: z.boolean().optional(),
    flag: z.boolean().optional(),
    moveToFolderId: z.string().trim().min(1).max(40).optional(),
    caseId: z.string().trim().min(1).max(40).optional(),
  })
  .strict()
  .refine((a) => !!(a.addLabelId || a.markRead || a.flag || a.moveToFolderId || a.caseId), 'EMPTY_ACTIONS');

export type RuleConditions = z.infer<typeof ruleConditionsSchema>;
export type RuleActions = z.infer<typeof ruleActionsSchema>;

export interface RuleMessage {
  fromAddr?: string | null;
  fromName?: string | null;
  toList?: Address[] | unknown;
  ccList?: Address[] | unknown;
  subject?: string | null;
  hasAttachments?: boolean;
}

const addrText = (list: unknown) => (Array.isArray(list) ? (list as Address[]).map((a) => `${a?.name ?? ''} ${a?.address ?? ''}`).join(' ') : '');

const contains = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle.trim().toLowerCase());

export const ruleMatches = (raw: unknown, m: RuleMessage): boolean => {
  const parsed = ruleConditionsSchema.safeParse(raw);
  if (!parsed.success) return false;
  const c = parsed.data;
  const checks: boolean[] = [];
  if (c.from) checks.push(contains(`${m.fromName ?? ''} ${m.fromAddr ?? ''}`, c.from));
  if (c.to) checks.push(contains(`${addrText(m.toList)} ${addrText(m.ccList)}`, c.to));
  if (c.subject) checks.push(contains(m.subject ?? '', c.subject));
  if (c.hasAttachment !== undefined) checks.push(!!m.hasAttachments === c.hasAttachment);
  if (!checks.length) return false;
  return c.match === 'any' ? checks.some(Boolean) : checks.every(Boolean);
};

export const parseActions = (raw: unknown): RuleActions | null => {
  const r = ruleActionsSchema.safeParse(raw);
  return r.success ? r.data : null;
};
