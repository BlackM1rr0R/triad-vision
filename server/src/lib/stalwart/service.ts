import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../http.js';
import { seal } from '../secretBox.js';
import { StalwartError } from './client.js';
import { stalwartConfig, stalwartDomain, stalwartMailHost, type StalwartConfig } from './config.js';

/** Helpers shared by the admin and the self-service mailbox routes. */

/** The configuration or 503 MAIL_SERVER_NOT_CONFIGURED. */
export const requireStalwart = (): StalwartConfig => {
  const cfg = stalwartConfig();
  if (!cfg) throw new HttpError(503, 'MAIL_SERVER_NOT_CONFIGURED');
  return cfg;
};

const STATUS: Record<StalwartError['code'], number> = {
  MAIL_SERVER_UNREACHABLE: 502,
  MAIL_SERVER_TIMEOUT: 504,
  MAIL_SERVER_AUTH: 502,
  MAIL_SERVER_ERROR: 502,
  MAIL_DOMAIN_MISSING: 502,
  MAILBOX_NOT_FOUND: 404,
  MAILBOX_EXISTS: 409,
  MAILBOX_INVALID: 400,
  MAILBOX_PASSWORD_WRONG: 400,
};

/** Runs a Stalwart call and turns its errors into HTTP errors (never 401: that would end the web session). */
export const viaStalwart = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StalwartError) {
      if (STATUS[err.code] >= 500) console.warn('[stalwart]', err.code, err.detail ?? '');
      throw new HttpError(STATUS[err.code], err.code, err.detail);
    }
    throw err;
  }
};

// ─── Passwords ───────────────────────────────────────────────────────

/** Mailbox passwords: 10–128 characters with at least one letter and one digit. */
export const mailboxPassword = z
  .string()
  .min(10)
  .max(128)
  .refine((p) => /\p{L}/u.test(p) && /\d/.test(p), { message: 'PASSWORD_TOO_WEAK' })
  .refine((p) => !/[\u0000-\u001f\u007f]/.test(p), { message: 'PASSWORD_INVALID_CHARS' });

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** 4 × 5 unambiguous characters joined by dashes (~114 bits), always with upper, lower and a digit. */
export const generatePassword = (): string => {
  for (;;) {
    const chars = Array.from({ length: 20 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]);
    const p = [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join('')).join('-');
    if (/[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p)) return p;
  }
};

// ─── Addresses ───────────────────────────────────────────────────────

/** RFC-ish local part we allow for new mailboxes and aliases. */
export const localPartSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, 'INVALID_LOCAL_PART')
  .refine((s) => !s.includes('..'), 'INVALID_LOCAL_PART');

export const isOurAddress = (address: string) => address.trim().toLowerCase().endsWith(`@${stalwartDomain()}`);

const fullAddress = (s: string) => {
  const v = s.trim().toLowerCase();
  return v.includes('@') ? v : `${v}@${stalwartDomain()}`;
};

/** The address the website sends its mail with (SMTP_USER); its password must never change from the UI. */
export const siteSenderAddress = () => (process.env.SMTP_USER ? fullAddress(process.env.SMTP_USER) : null);

/** The Stalwart admin login the API uses. */
const apiAdminAddress = () => (process.env.STALWART_ADMIN_USER ? fullAddress(process.env.STALWART_ADMIN_USER) : null);

export type Protection = 'SITE_SENDER' | 'MAIL_ADMIN' | null;

/** Why a mailbox may not be deleted / have its password reset, if at all. */
export const protectionOf = (m: { address: string; isAdmin: boolean }): Protection => {
  const a = m.address.toLowerCase();
  if (a === siteSenderAddress()) return 'SITE_SENDER';
  if (a === apiAdminAddress() || a === `admin@${stalwartDomain()}` || m.isAdmin) return 'MAIL_ADMIN';
  return null;
};

// ─── Workspace mail accounts ─────────────────────────────────────────

/** Workspace (IMAP/SMTP) accounts that log in to this mailbox on our own mail server. */
const workspaceWhere = (address: string) => {
  const host = stalwartMailHost();
  return { username: address.toLowerCase(), OR: [{ imapHost: host }, { smtpHost: host }] };
};

/**
 * After a password change every workspace account using this mailbox gets the new password
 * (encrypted), otherwise its sync starts failing. Returns how many rows were updated.
 */
export const reencryptWorkspaceAccounts = async (address: string, password: string) => {
  const where = workspaceWhere(address);
  const passwordEnc = seal(password);
  const [all] = await prisma.$transaction([
    prisma.mailAccount.updateMany({ where, data: { passwordEnc } }),
    // A sync that failed on the old password can retry right away.
    prisma.mailAccount.updateMany({ where: { ...where, syncStatus: 'ERROR' }, data: { syncStatus: 'IDLE', syncError: null } }),
  ]);
  return all.count;
};

/** Staff users linked to mailboxes: by their login email, or by a workspace account on our server. */
export const linkedUsers = async (addresses: string[]) => {
  const list = addresses.map((a) => a.toLowerCase());
  if (!list.length) return { byEmail: new Map<string, LinkedUser>(), workspace: new Map<string, LinkedUser[]>() };
  const host = stalwartMailHost();
  const [users, accounts] = await Promise.all([
    prisma.user.findMany({ where: { email: { in: list } }, select: { id: true, email: true, firstName: true, lastName: true, role: true } }),
    prisma.mailAccount.findMany({
      where: { username: { in: list }, OR: [{ imapHost: host }, { smtpHost: host }] },
      select: { username: true, user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } } },
    }),
  ]);
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const workspace = new Map<string, LinkedUser[]>();
  for (const a of accounts) {
    const k = a.username.toLowerCase();
    const arr = workspace.get(k) ?? [];
    if (!arr.some((u) => u.id === a.user.id)) arr.push(a.user);
    workspace.set(k, arr);
  }
  return { byEmail, workspace };
};

export interface LinkedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

/** Mailbox addresses on our domain that belong to this staff user (login email or workspace accounts). */
export const ownMailboxAddresses = async (userId: string, email: string) => {
  const host = stalwartMailHost();
  const accounts = await prisma.mailAccount.findMany({
    where: { userId, OR: [{ imapHost: host }, { smtpHost: host }] },
    select: { username: true },
  });
  const set = new Set<string>();
  if (isOurAddress(email)) set.add(email.toLowerCase());
  for (const a of accounts) if (isOurAddress(a.username)) set.add(a.username.toLowerCase());
  return [...set];
};

// ─── Auto-reply input ───────────────────────────────────────────────

export const autoReplySchema = z
  .object({
    enabled: z.boolean(),
    subject: z.string().trim().max(200).nullable().optional(),
    text: z.string().max(10_000).nullable().optional(),
    fromDate: z.string().datetime({ offset: true }).nullable().optional(),
    toDate: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine((v) => !v.enabled || !!v.text?.trim(), { message: 'AUTO_REPLY_TEXT_REQUIRED', path: ['text'] })
  .refine((v) => !v.fromDate || !v.toDate || new Date(v.fromDate) < new Date(v.toDate), { message: 'AUTO_REPLY_DATES', path: ['toDate'] })
  .transform((v) => ({
    enabled: v.enabled,
    subject: v.subject?.trim() || null,
    text: v.text?.replace(/\r\n/g, '\n').trim() || null,
    fromDate: v.fromDate ?? null,
    toDate: v.toDate ?? null,
  }));
