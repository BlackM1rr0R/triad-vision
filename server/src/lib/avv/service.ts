import crypto from 'node:crypto';
import type { AvvAgreement, Locale, Prisma, Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound } from '../http.js';
import { notifyStaff, notifyUser } from '../notifications.js';
import { getRetentionSettings, legalSchema, privacySchema } from '../legalSettings.js';
import { renderContractPdf } from '../contracts/pdf.js';
import { getCountersignSettings } from '../esign/countersign.js';
import { cancelRequest, createRequest, sendRequest, type Actor } from '../esign/service.js';
import { hasMinRole } from '../../middleware/auth.js';
import { AVV_TEMPLATE_VERSION, avvApproved, getAvvSettings, getTrustSettings } from '../trust/settings.js';
import { currentSubprocessors } from '../trust/subprocessors.js';
import { avvCompanySchema, buildAvvText, type AvvCompanyData, type AvvProcessor } from './template.js';

/**
 * AVV (Art. 28 DSGVO) with employers: the company fills its data in the portal → PDF → e-signature by the company
 * user → countersignature by a Triad Vision authorised signatory (/admin/countersign, the STAFF signer is added
 * after the company) → COMPLETED (e-signature completion hook). Hidden from companies until the owner approved
 * the template (Setting avvTemplate, default OFF).
 */

export const AVV_STATUSES = ['DRAFT', 'SENT', 'COMPLETED', 'CANCELLED'] as const;
const AVV_TITLE = 'Auftragsverarbeitungsvertrag (Art. 28 DSGVO)';

// ─── Inputs ────────────────────────────────────────────────────────────

const settingValue = async (key: string) => (await prisma.setting.findUnique({ where: { key } }))?.value ?? {};

/** Triad Vision as processor, from the Impressum / privacy settings (placeholders when not filled). */
export const processorData = async (): Promise<AvvProcessor> => {
  const legal = legalSchema.safeParse(await settingValue('legal'));
  const privacy = privacySchema.safeParse(await settingValue('privacy'));
  const l = legal.success ? legal.data : legalSchema.parse({});
  const name = [l.companyName, l.legalForm && !l.companyName.includes(l.legalForm) ? l.legalForm : ''].filter(Boolean).join(' ');
  const address = [l.street, [l.postalCode, l.city].filter(Boolean).join(' '), l.country].filter(Boolean).join(', ');
  return { name, address, representative: l.representative, email: l.email, dpo: privacy.success ? privacy.data.dpo : '' };
};

/** Suggestions for the company form (company profile + the signing user). */
export const companyPrefill = async (companyId: string, user: { firstName: string; lastName: string; email: string }): Promise<Partial<AvvCompanyData>> => {
  const co = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, legalForm: true, street: true, postalCode: true, city: true, country: true, address: true, managingDirector: true, signatoryName: true, signatoryRole: true, contactName: true, email: true },
  });
  if (!co) throw notFound('COMPANY_NOT_FOUND');
  const me = `${user.firstName} ${user.lastName}`.trim();
  return {
    legalName: `${co.name}${co.legalForm && !co.name.includes(co.legalForm) ? ` ${co.legalForm}` : ''}`,
    street: co.street ?? '',
    postalCode: co.postalCode ?? '',
    city: co.city ?? '',
    country: co.country || 'Deutschland',
    representative: co.managingDirector ?? '',
    privacyContactName: co.contactName ?? me,
    privacyContactEmail: co.email ?? user.email,
    dpo: '',
    signatoryName: co.signatoryName || me,
    signatoryRole: co.signatoryRole ?? '',
  };
};

export const parseAvvData = (raw: unknown) => {
  const parsed = avvCompanySchema.safeParse(raw ?? {});
  if (!parsed.success) throw badRequest('INVALID_VALUES', [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? '')))].join(','));
  return parsed.data;
};

/** The contract PDF for the company data (current template, processor data, sub-processors, TOMs). */
export const renderAvvPdf = async (data: AvvCompanyData, date = new Date()) => {
  const [processor, trust, retention] = await Promise.all([processorData(), getTrustSettings(), getRetentionSettings()]);
  const text = buildAvvText({
    controller: data,
    processor,
    subprocessors: await currentSubprocessors(trust.dataLocation),
    dataLocation: trust.dataLocation,
    backupLocation: trust.backupLocation,
    retentionMonths: retention.months,
    version: AVV_TEMPLATE_VERSION,
    date,
  });
  return renderContractPdf({ title: AVV_TITLE, text, kind: 'SERVICE', language: 'de', parties: [processor.name || 'Triad Vision', data.legalName] });
};

// ─── Status ────────────────────────────────────────────────────────────

/** Brings a SENT agreement in line with its signature request (completed / cancelled / expired / declined). */
export const syncAvv = async (a: AvvAgreement) => {
  if (a.status !== 'SENT' || !a.signatureRequestId) return a;
  const r = await prisma.signatureRequest.findUnique({ where: { id: a.signatureRequestId }, select: { status: true, completedAt: true } });
  if (!r) return a;
  if (r.status === 'COMPLETED') return prisma.avvAgreement.update({ where: { id: a.id }, data: { status: 'COMPLETED', completedAt: r.completedAt ?? new Date() } });
  if (r.status === 'CANCELLED' || r.status === 'EXPIRED' || r.status === 'DECLINED') return prisma.avvAgreement.update({ where: { id: a.id }, data: { status: 'CANCELLED' } });
  return a;
};

const agreementView = async (a: AvvAgreement, userId?: string) => {
  const signer = a.signatureRequestId && userId ? await prisma.signatureSigner.findFirst({ where: { requestId: a.signatureRequestId, userId }, select: { id: true, status: true } }) : null;
  const signers = a.signatureRequestId ? await prisma.signatureSigner.findMany({ where: { requestId: a.signatureRequestId }, select: { role: true, status: true, signedAt: true }, orderBy: { order: 'asc' } }) : [];
  return {
    id: a.id,
    status: a.status,
    templateVersion: a.templateVersion,
    createdAt: a.createdAt,
    completedAt: a.completedAt,
    signerId: signer?.id ?? null,
    signerStatus: signer?.status ?? null,
    companySigned: signers.some((s) => s.role === 'COMPANY' && s.status === 'SIGNED'),
    countersigned: signers.some((s) => s.role === 'STAFF' && s.status === 'SIGNED'),
  };
};

// ─── Company portal ────────────────────────────────────────────────────

export const assertAvvAvailable = async () => {
  if (!avvApproved(await getAvvSettings())) throw notFound('AVV_NOT_AVAILABLE');
};

export const companyAvvOverview = async (companyId: string, user: { id: string; firstName: string; lastName: string; email: string }) => {
  await assertAvvAvailable();
  const rows = await prisma.avvAgreement.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 20 });
  const synced = [];
  for (const r of rows) synced.push(await syncAvv(r));
  const items = [];
  for (const a of synced) items.push(await agreementView(a, user.id));
  const current = synced.find((a) => a.templateVersion === AVV_TEMPLATE_VERSION && a.status !== 'CANCELLED') ?? null;
  return {
    available: true,
    templateVersion: AVV_TEMPLATE_VERSION,
    prefill: current ? (current.data as unknown as AvvCompanyData) : await companyPrefill(companyId, user),
    current: current ? await agreementView(current, user.id) : null,
    items,
  };
};

/** Picks the Triad Vision countersigner: configured default / authorised signatories, else the first active super admin / admin. */
const countersigner = async () => {
  const s = await getCountersignSettings();
  for (const id of [s.defaultSignerId, ...s.signatoryIds].filter((x): x is string => !!x)) {
    const u = await prisma.user.findUnique({ where: { id }, select: { id: true, firstName: true, lastName: true, email: true, locale: true, role: true, isActive: true } });
    if (u?.isActive && hasMinRole(u.role, 'ADMIN')) return u;
  }
  const select = { id: true, firstName: true, lastName: true, email: true, locale: true, role: true, isActive: true } as const;
  return (
    (await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true }, select, orderBy: { createdAt: 'asc' } })) ??
    (await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select, orderBy: { createdAt: 'asc' } }))
  );
};

/**
 * The company signs: stored, PDF rendered, signature request company (1) → Triad Vision (2) created and sent.
 * A still open earlier agreement is cancelled (replaced); a completed one of this version cannot be signed again.
 */
export const signAvv = async (companyId: string, user: { id: string; role: Role; firstName: string; lastName: string; email: string; locale: Locale; phone?: string | null }, raw: unknown) => {
  await assertAvvAvailable();
  const data = parseAvvData(raw);
  const existing = await prisma.avvAgreement.findMany({ where: { companyId, status: { in: ['SENT', 'COMPLETED'] } } });
  for (const e of existing) {
    const a = await syncAvv(e);
    if (a.status === 'COMPLETED' && a.templateVersion === AVV_TEMPLATE_VERSION) throw conflict('ALREADY_SIGNED');
  }
  const cs = await countersigner();
  if (!cs) throw conflict('NO_COUNTERSIGNER');
  if (cs.email.toLowerCase() === user.email.toLowerCase()) throw conflict('DUPLICATE_SIGNER');
  const actor: Actor = { id: user.id, role: user.role, firstName: user.firstName, lastName: user.lastName };
  for (const e of await prisma.avvAgreement.findMany({ where: { companyId, status: 'SENT' } })) {
    if (e.signatureRequestId) await cancelRequest(e.signatureRequestId, actor, 'Replaced by a new AVV').catch(() => undefined);
    await prisma.avvAgreement.update({ where: { id: e.id }, data: { status: 'CANCELLED' } });
  }
  const pdf = await renderAvvPdf(data);
  const req = await createRequest(
    {
      title: `${AVV_TITLE} – ${data.legalName}`.slice(0, 200),
      companyId,
      order: 'SEQUENTIAL',
      signers: [
        { role: 'COMPANY', name: data.signatoryName, email: user.email, userId: user.id, locale: user.locale, phone: user.phone ?? null, order: 1 },
        { role: 'STAFF', name: `${cs.firstName} ${cs.lastName}`.trim(), email: cs.email, userId: cs.id, locale: cs.locale as Locale, order: 2 },
      ],
      pdf,
      fileName: `avv-${data.legalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.pdf`,
    },
    actor,
  );
  await sendRequest(req.id, actor);
  const agreement = await prisma.avvAgreement.create({
    data: {
      companyId,
      status: 'SENT',
      templateVersion: AVV_TEMPLATE_VERSION,
      data: data as unknown as Prisma.InputJsonValue,
      signatureRequestId: req.id,
      pdfSha256: crypto.createHash('sha256').update(pdf).digest('hex'),
      createdById: user.id,
    },
  });
  const signer = await prisma.signatureSigner.findFirst({ where: { requestId: req.id, userId: user.id }, select: { id: true } });
  return { agreement: await agreementView(agreement, user.id), signerId: signer?.id ?? null };
};

/** The final signed PDF of a completed agreement of the company (key in private storage) or null. */
export const companyAvvFile = async (companyId: string, id: string) => {
  const a = await prisma.avvAgreement.findUnique({ where: { id } });
  if (!a || a.companyId !== companyId) throw notFound('AVV_NOT_FOUND');
  const synced = await syncAvv(a);
  if (synced.status !== 'COMPLETED' || !synced.signatureRequestId) throw conflict('NOT_COMPLETED');
  const r = await prisma.signatureRequest.findUnique({ where: { id: synced.signatureRequestId }, select: { finalKey: true } });
  if (!r?.finalKey) throw notFound('FILE_MISSING');
  return r.finalKey;
};

// ─── E-signature completion hook ─────────────────────────────────────────

const DONE: Record<Locale, { title: string; body: string }> = {
  de: { title: 'AVV unterzeichnet', body: 'Der Auftragsverarbeitungsvertrag wurde von beiden Seiten unterzeichnet. Sie finden ihn im Portal unter „Datenschutz (AVV)“.' },
  en: { title: 'DPA signed', body: 'The data processing agreement has been signed by both parties. You find it in the portal under "Data protection (DPA)".' },
  az: { title: 'AVV imzalandı', body: 'Məlumatların emalı müqaviləsi hər iki tərəf tərəfindən imzalandı. Portalda «Məlumatların qorunması (AVV)» bölməsindədir.' },
  ru: { title: 'AVV подписан', body: 'Договор об обработке данных подписан обеими сторонами. Он доступен в портале в разделе «Защита данных (AVV)».' },
};

/** Called by lib/esign/service.ts when a request completes; never throws. */
export const avvSigned = async (requestId: string) => {
  try {
    const a = await prisma.avvAgreement.findUnique({ where: { signatureRequestId: requestId } });
    if (!a || a.status === 'COMPLETED') return;
    const { count } = await prisma.avvAgreement.updateMany({ where: { id: a.id, status: { not: 'COMPLETED' } }, data: { status: 'COMPLETED', completedAt: new Date() } });
    if (!count) return;
    const users = await prisma.user.findMany({ where: { companyId: a.companyId, role: 'COMPANY', isActive: true }, select: { id: true, locale: true } });
    for (const u of users) {
      const t = DONE[u.locale] ?? DONE.de;
      await notifyUser(u.id, { type: 'AVV_COMPLETED', title: t.title, body: t.body, link: '/company/avv' }).catch(() => undefined);
    }
    const co = await prisma.company.findUnique({ where: { id: a.companyId }, select: { name: true } });
    await notifyStaff(`AVV abgeschlossen – ${co?.name ?? ''}`.slice(0, 180), `${co?.name ?? 'Arbeitgeber'}: Auftragsverarbeitungsvertrag ${a.templateVersion} von beiden Seiten unterzeichnet.`, { link: '/admin/trust', type: 'AVV_COMPLETED' });
  } catch (err) {
    console.error('[avv] completion hook failed', requestId, err);
  }
};

// ─── Admin ─────────────────────────────────────────────────────────────

export const adminAvvList = async () => {
  const rows = await prisma.avvAgreement.findMany({ orderBy: { createdAt: 'desc' }, take: 300 });
  const synced = [];
  for (const r of rows) synced.push(await syncAvv(r));
  const companies = await prisma.company.findMany({ where: { id: { in: [...new Set(synced.map((r) => r.companyId))] } }, select: { id: true, name: true } });
  const names = new Map(companies.map((c) => [c.id, c.name]));
  const out = [];
  for (const a of synced) out.push({ ...(await agreementView(a)), companyId: a.companyId, companyName: names.get(a.companyId) ?? '—', signatureRequestId: a.signatureRequestId });
  return out;
};

/** Sample PDF for the admin review (the owner reads the template before approving it). */
export const sampleAvvPdf = () =>
  renderAvvPdf({
    legalName: 'Muster Logistik GmbH',
    street: 'Musterstraße 1',
    postalCode: '28195',
    city: 'Bremen',
    country: 'Deutschland',
    representative: 'Max Mustermann (Geschäftsführer)',
    privacyContactName: 'Erika Musterfrau',
    privacyContactEmail: 'datenschutz@example.com',
    dpo: '',
    signatoryName: 'Max Mustermann',
    signatoryRole: 'Geschäftsführer',
  });
