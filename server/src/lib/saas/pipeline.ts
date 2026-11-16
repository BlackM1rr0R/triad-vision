import { z } from 'zod';
import { prisma } from '../../db.js';
import { createCustomer, readCustomers, updateCustomer, type Customer } from '../whitelabel/customers.js';

/**
 * SaaS sales pipeline (System → Customers on the owner's instance):
 *   demo_requested → demo_done → trial → customer   (lost from any stage, and back)
 * It reuses the existing white-label customer list (Setting whitelabel.customers): moving a lead to "trial"
 * creates its customer record (status trial) unless one is linked already; "customer" sets that record active.
 * The contact person (name, e-mail, phone) is read from the linked Inquiry, never copied.
 */

export const SAAS_STAGES = ['demo_requested', 'demo_done', 'trial', 'customer', 'lost'] as const;
export type SaasStage = (typeof SAAS_STAGES)[number];

/** Allowed moves: one step forward, one step back, to/from "lost". */
const ORDER: SaasStage[] = ['demo_requested', 'demo_done', 'trial', 'customer'];
export const canMove = (from: SaasStage, to: SaasStage): boolean => {
  if (from === to) return false;
  if (to === 'lost' || from === 'lost') return true;
  return Math.abs(ORDER.indexOf(to) - ORDER.indexOf(from)) === 1;
};

export const isStage = (v: unknown): v is SaasStage => typeof v === 'string' && (SAAS_STAGES as readonly string[]).includes(v);

/** Customer status implied by a stage (null = leave the record alone). */
export const customerStatusFor = (stage: SaasStage): Customer['status'] | null => (stage === 'trial' ? 'trial' : stage === 'customer' ? 'active' : null);

export const leadPatchSchema = z
  .object({
    stage: z.enum(SAAS_STAGES).optional(),
    demoAt: z.union([z.null(), z.string().datetime()]).optional(),
    staffNotes: z.string().trim().max(5000).optional(),
  })
  .strict();
export type LeadPatch = z.infer<typeof leadPatchSchema>;

/** Counts per stage (pure; the board header). */
export const stageCounts = (rows: { stage: string }[]) => {
  const out = Object.fromEntries(SAAS_STAGES.map((s) => [s, 0])) as Record<SaasStage, number>;
  for (const r of rows) if (isStage(r.stage)) out[r.stage] += 1;
  return out;
};

export const listLeads = async () => {
  const leads = await prisma.saasLead.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  const inquiryIds = leads.map((l) => l.inquiryId).filter((x): x is string => !!x);
  const inquiries = inquiryIds.length
    ? await prisma.inquiry.findMany({
        where: { id: { in: inquiryIds } },
        select: { id: true, contactName: true, email: true, phone: true, message: true, locale: true, anonymizedAt: true, status: true },
      })
    : [];
  const byId = new Map(inquiries.map((i) => [i.id, i]));
  const customers = await readCustomers();
  const custById = new Map(customers.map((c) => [c.id, c]));
  return {
    items: leads.map((l) => {
      const inq = l.inquiryId ? byId.get(l.inquiryId) : undefined;
      const cust = l.customerId ? custById.get(l.customerId) : undefined;
      return {
        ...l,
        contact: inq && !inq.anonymizedAt ? { name: inq.contactName, email: inq.email, phone: inq.phone, locale: inq.locale, message: inq.message } : null,
        customer: cust ? { id: cust.id, name: cust.name, status: cust.status, domain: cust.domain } : null,
      };
    }),
    counts: stageCounts(leads),
    stages: SAAS_STAGES,
  };
};

export const updateLead = async (id: string, patch: LeadPatch) => {
  const lead = await prisma.saasLead.findUnique({ where: { id } });
  if (!lead) return { error: 'LEAD_NOT_FOUND' as const };
  const data: { stage?: string; stageChangedAt?: Date; demoAt?: Date | null; staffNotes?: string | null; customerId?: string | null } = {};
  if (patch.stage && patch.stage !== lead.stage) {
    const from = isStage(lead.stage) ? lead.stage : 'demo_requested';
    if (!canMove(from, patch.stage)) return { error: 'STAGE_TRANSITION' as const };
    data.stage = patch.stage;
    data.stageChangedAt = new Date();
    const status = customerStatusFor(patch.stage);
    if (status) {
      const existing = lead.customerId ? (await readCustomers()).find((c) => c.id === lead.customerId) : undefined;
      if (existing) {
        if (existing.status !== status) await updateCustomer(existing.id, { status });
      } else {
        const inq = lead.inquiryId ? await prisma.inquiry.findUnique({ where: { id: lead.inquiryId }, select: { contactName: true, email: true, phone: true, anonymizedAt: true } }) : null;
        const contact = inq && !inq.anonymizedAt ? inq : null;
        const created = await createCustomer({
          name: lead.agencyName,
          domain: '',
          serverIp: '',
          plan: '',
          pricePerMonth: 0,
          currency: 'EUR',
          status,
          licenseExpiresAt: '',
          contactName: contact?.contactName ?? '',
          contactEmail: contact?.email ?? '',
          contactPhone: contact?.phone ?? '',
          notes: `SaaS pipeline lead ${lead.id}${lead.website ? ` · ${lead.website}` : ''}`,
          licenseToken: '',
          companyId: '',
        });
        data.customerId = created.id;
      }
    }
  }
  if (patch.demoAt !== undefined) data.demoAt = patch.demoAt ? new Date(patch.demoAt) : null;
  if (patch.staffNotes !== undefined) data.staffNotes = patch.staffNotes || null;
  const updated = await prisma.saasLead.update({ where: { id }, data });
  return { lead: updated };
};
