import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { verifyLicenseToken } from '../license/index.js';

/**
 * Owner side of the white-label business (only on the owner's instance, INSTANCE_ROLE=owner): the agencies
 * that bought the platform, one record per customer instance. Stored as one Setting row (no schema change);
 * a few dozen customers are expected. Licence keys are NOT minted here — the private key never lives on a
 * server: the owner runs deploy/whitelabel/issue-license.mjs locally and pastes the token for the record.
 * Monthly invoicing reuses the company invoice module: a customer can be linked to a Company record.
 */

export const WHITELABEL_CUSTOMERS_KEY = 'whitelabel.customers';
export const CUSTOMER_STATUSES = ['trial', 'active', 'past_due', 'cancelled'] as const;
export const CURRENCIES = ['EUR', 'USD', 'AZN', 'TRY', 'UAH', 'GBP'] as const;

const text = (max: number) => z.string().trim().max(max).default('');
const date = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default('');

export const customerInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .regex(/^$|^[a-z0-9.-]+\.[a-z]{2,}$/, 'DOMAIN')
    .default(''),
  serverIp: z
    .string()
    .trim()
    .max(64)
    .regex(/^$|^[0-9a-fA-F:.]+$/, 'IP')
    .default(''),
  plan: text(40),
  pricePerMonth: z.number().min(0).max(1_000_000).default(0),
  currency: z.enum(CURRENCIES).default('EUR'),
  status: z.enum(CUSTOMER_STATUSES).default('trial'),
  licenseExpiresAt: date,
  contactName: text(200),
  contactEmail: z.union([z.literal(''), z.string().trim().toLowerCase().email().max(200)]).default(''),
  contactPhone: text(50),
  notes: text(5000),
  /** The token issued with issue-license.mjs (for the record; verified against the public key). */
  licenseToken: z.string().trim().max(4000).default(''),
  /** Linked Company (company invoices for the monthly subscription). */
  companyId: z.string().trim().max(64).default(''),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

export const customerSchema = customerInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Customer = z.infer<typeof customerSchema>;

const storeSchema = z.object({ items: z.array(customerSchema).default([]) });

export const readCustomers = async (): Promise<Customer[]> => {
  const row = await prisma.setting.findUnique({ where: { key: WHITELABEL_CUSTOMERS_KEY } });
  const parsed = storeSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data.items : [];
};

const writeCustomers = async (items: Customer[]) => {
  const value = { items } as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key: WHITELABEL_CUSTOMERS_KEY }, create: { key: WHITELABEL_CUSTOMERS_KEY, value }, update: { value } });
};

/** What the pasted token says (signature checked with the public key compiled into the app). */
export const describeToken = (token: string) => {
  if (!token) return null;
  const r = verifyLicenseToken(token);
  if (!r.ok) return { valid: false as const, reason: r.reason };
  const p = r.payload;
  return { valid: true as const, id: p.id, customer: p.customer, domain: p.domain, plan: p.plan, modules: p.modules, staffLimit: p.staffLimit, issuedAt: p.issuedAt, expiresAt: p.expiresAt };
};

/** A valid pasted token fills in the plan / expiry / domain fields that are still empty. */
const fillFromToken = (c: CustomerInput): CustomerInput => {
  const t = describeToken(c.licenseToken);
  if (!t?.valid) return c;
  return {
    ...c,
    plan: c.plan || t.plan,
    domain: c.domain || (t.domain.includes('*') ? '' : t.domain),
    licenseExpiresAt: t.expiresAt.slice(0, 10),
  };
};

export const createCustomer = async (input: CustomerInput) => {
  const items = await readCustomers();
  const now = new Date().toISOString();
  const customer: Customer = { ...fillFromToken(input), id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await writeCustomers([...items, customer]);
  return customer;
};

export const updateCustomer = async (id: string, patch: Partial<CustomerInput>) => {
  const items = await readCustomers();
  const i = items.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const { id: _id, createdAt, updatedAt: _u, ...current } = items[i];
  const merged = customerInputSchema.parse({ ...current, ...patch });
  const next: Customer = { ...fillFromToken(merged), id, createdAt, updatedAt: new Date().toISOString() };
  items[i] = next;
  await writeCustomers(items);
  return next;
};

export const deleteCustomer = async (id: string) => {
  const items = await readCustomers();
  const next = items.filter((c) => c.id !== id);
  if (next.length === items.length) return false;
  await writeCustomers(next);
  return true;
};

/** Monthly recurring revenue per currency (active + past_due customers). */
export const mrr = (items: Customer[]) => {
  const out: Record<string, number> = {};
  for (const c of items) if (c.status === 'active' || c.status === 'past_due') out[c.currency] = Math.round(((out[c.currency] ?? 0) + c.pricePerMonth) * 100) / 100;
  return out;
};
