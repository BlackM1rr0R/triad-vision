import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma, ReferralPartner } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest, forbidden, limiter, notFound, parse } from '../http.js';
import { audit } from '../audit.js';
import { notifyStaff } from '../notifications.js';
import { maskValue } from '../privacy/mask.js';
import { contractView, sendContractFile } from '../partnerRecords/contracts.js'; // shared contract view + file sending (lib/partnerRecords)
import { contractReadiness, extraFieldsOf, legalCrossError, partnerProfileShape, profileChanges } from './profile.js';

/**
 * Partner portal: the partner's own profile and contracts — mounted into /api/partner (role AGENT, linked
 * as ReferralPartner.userId; anything else is 403 there).
 *
 *   GET   /profile                   legal / contact data (no internal note, tags, custom fields; bank masked)
 *   PATCH /profile                   edit the non-internal contact fields (audited, staff notified)
 *   POST  /profile/change-request    { changes: { field: value }, note } for legal data (staff notified, audited)
 *   GET   /contracts                 own contracts (drafts hidden)
 *   GET   /contracts/:id/file        download (?signed=1 the signed copy), own contracts only
 */
export const partnerPortalProfileRouter = Router();

const partnerOf = async (req: Request): Promise<ReferralPartner> => {
  const partner = await prisma.referralPartner.findUnique({ where: { userId: req.user!.id } });
  if (!partner) throw forbidden('NO_PARTNER_PROFILE');
  return partner;
};

/** Fields the partner edits directly (contact and address). */
export const PORTAL_EDITABLE = ['contactPerson', 'phone', 'phone2', 'whatsapp', 'email', 'website', 'address', 'street', 'postalCode', 'city', 'country', 'preferredLanguage'] as const;
/** Legal fields: the partner asks staff to change them (they are what contracts are generated from). */
export const PORTAL_REQUESTABLE = ['name', 'companyName', 'legalForm', 'registerNumber', 'registerCourt', 'vatId', 'taxId', 'betriebsnummer', 'signatoryName', 'signatoryRole'] as const;

const HIDDEN = '••••';

const portalView = (p: ReferralPartner) => ({
  id: p.id,
  name: p.name,
  partnerType: p.partnerType,
  companyName: p.companyName,
  contactPerson: p.contactPerson,
  phone: p.phone,
  phone2: p.phone2,
  whatsapp: p.whatsapp,
  email: p.email,
  website: p.website,
  address: p.address,
  street: p.street,
  postalCode: p.postalCode,
  city: p.city,
  country: p.country,
  preferredLanguage: p.preferredLanguage,
  taxId: p.taxId,
  legalForm: p.legalForm,
  registerNumber: p.registerNumber,
  registerCourt: p.registerCourt,
  vatId: p.vatId,
  betriebsnummer: p.betriebsnummer,
  signatoryName: p.signatoryName,
  signatoryRole: p.signatoryRole,
  // Own bank data only as a hint that it is on file (changes go through the team).
  bank: p.iban || p.bankName ? { bankName: p.bankName ? HIDDEN : null, iban: p.iban ? maskValue(p.iban, 'IBAN') : null } : null,
  extraFields: extraFieldsOf(p.extraFields),
  readiness: contractReadiness(p),
  editable: PORTAL_EDITABLE,
  requestable: PORTAL_REQUESTABLE,
});

partnerPortalProfileRouter.get('/profile', async (req, res) => {
  const partner = await partnerOf(req);
  res.json({ profile: portalView(partner) });
});

const editShape = z.object({
  contactPerson: partnerProfileShape.contactPerson,
  phone: partnerProfileShape.phone2,
  phone2: partnerProfileShape.phone2,
  whatsapp: partnerProfileShape.whatsapp,
  email: z
    .union([z.literal(''), z.string().trim().email().max(191)])
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
  website: partnerProfileShape.website,
  address: partnerProfileShape.address,
  street: partnerProfileShape.street,
  postalCode: partnerProfileShape.postalCode,
  city: partnerProfileShape.city,
  country: partnerProfileShape.country,
  preferredLanguage: partnerProfileShape.preferredLanguage,
});

const profileLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 30, keyGenerator: (req) => `pp-profile:${req.user?.id ?? req.ip}`, skip: () => config.isTest });

partnerPortalProfileRouter.patch('/profile', profileLimiter, async (req, res) => {
  const body = parse(editShape.strict(), req.body);
  const current = await partnerOf(req);
  const pick = <K extends 'country' | 'postalCode'>(k: K) => (body[k] !== undefined ? body[k] : current[k]);
  const cross = legalCrossError({ country: pick('country'), betriebsnummer: current.betriebsnummer, postalCode: pick('postalCode') });
  if (cross) throw badRequest(cross);
  const data = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) as Prisma.ReferralPartnerUpdateInput;
  const { fields, changes } = profileChanges(current as unknown as Record<string, unknown>, data as Record<string, unknown>);
  if (!fields.length) {
    res.json({ profile: portalView(current), changed: [] });
    return;
  }
  const partner = await prisma.referralPartner.update({ where: { id: current.id }, data });
  await audit(req, 'PARTNER_PORTAL_PROFILE_UPDATED', partner.id, { fields, changes: changes as Prisma.InputJsonValue, by: 'partner' });
  void notifyStaff(
    `Partnyor profilini yenilədi: ${partner.name}`,
    `${partner.name} portalda bu sahələri dəyişdi: ${fields.join(', ')}.`,
    { link: `/admin/partners/${partner.id}?tab=history`, type: 'PARTNER_PROFILE' },
  ).catch(() => {});
  res.json({ profile: portalView(partner), changed: fields });
});

const requestShape = z
  .object({
    changes: z.record(z.enum(PORTAL_REQUESTABLE), z.string().trim().max(200)).default({}),
    note: z.string().trim().max(2000).optional(),
  })
  .refine((v) => Object.keys(v.changes).length > 0 || !!v.note, 'EMPTY_REQUEST');

/**
 * A change request for legal data: saved on the partner's timeline (PartnerActivity NOTE), audited and sent
 * to the team; staff apply it in the admin profile.
 */
partnerPortalProfileRouter.post('/profile/change-request', profileLimiter, async (req, res) => {
  const body = parse(requestShape, req.body);
  const partner = await partnerOf(req);
  const lines = Object.entries(body.changes).map(([k, v]) => `• ${k}: ${(partner as unknown as Record<string, unknown>)[k] ?? '—'} → ${v || '—'}`);
  const text = ['Partnyor portaldan məlumat dəyişikliyi istəyir:', ...lines, ...(body.note ? ['', body.note] : [])].join('\n');
  const activity = await prisma.partnerActivity.create({ data: { referralPartnerId: partner.id, kind: 'NOTE', body: text, createdById: req.user!.id } });
  await audit(req, 'PARTNER_CHANGE_REQUESTED', partner.id, { fields: Object.keys(body.changes), changes: body.changes, note: body.note ?? null, activityId: activity.id });
  void notifyStaff(`Partnyor məlumat dəyişikliyi istəyir: ${partner.name}`, text, { link: `/admin/partners/${partner.id}?tab=history`, type: 'PARTNER_PROFILE' }).catch(() => {});
  res.status(201).json({ ok: true, activityId: activity.id });
});

/** Statuses the partner sees (drafts are internal). */
const VISIBLE = ['SENT', 'ACTIVE', 'EXPIRED', 'TERMINATED'];

partnerPortalProfileRouter.get('/contracts', async (req, res) => {
  const partner = await partnerOf(req);
  const rows = await prisma.partnerContract.findMany({
    where: { referralPartnerId: partner.id, status: { in: VISIBLE } },
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
  });
  // The shared view (days, file flags, days left) without internal fields.
  res.json({
    items: rows.map((c) => {
      const { note: _n, createdById: _c, templateId: _t, reminderSentAt: _r, reminderDays: _d, valueCents: _v, ...v } = contractView(c);
      return v;
    }),
  });
});

partnerPortalProfileRouter.get('/contracts/:id/file', async (req, res) => {
  const { signed } = parse(z.object({ signed: z.enum(['1', 'true', '0', 'false']).optional() }), req.query);
  const partner = await partnerOf(req);
  // Scoped to the partner's own, visible contracts: another partner's id answers 404 like a missing one.
  const c = await prisma.partnerContract.findFirst({ where: { id: String(req.params.id), referralPartnerId: partner.id, status: { in: VISIBLE } } });
  if (!c) throw notFound('CONTRACT_NOT_FOUND');
  const wantSigned = signed === '1' || signed === 'true';
  if (!(wantSigned ? c.signedFilePath : c.filePath)) throw notFound('FILE_NOT_FOUND');
  await audit(req, 'PARTNER_CONTRACT_DOWNLOADED', partner.id, { contractId: c.id, signed: wantSigned, by: 'partner' });
  sendContractFile(res, c, wantSigned ? 'signed' : 'file', true);
});
