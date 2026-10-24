import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anon, asAdmin, asClient, asStaff, ORIGIN, type Agent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { l10n, l10nList } from '../helpers/factories';
import { makePdf, PDF, SIGNATURE_DATA_URL } from '../helpers/files';
import { runSignatureJobs, signAsSigner } from '../../src/lib/esign/service.js';
import { runPackageOrderJobs } from '../../src/lib/billing/packages.js';
import { createCase } from '../../src/lib/caseFlow.js';

/** Second signature by Triad Vision: client → authorised signatory (lib/esign/countersign.ts). */

const mails = vi.hoisted(() => [] as { to: string; subject: string; html: string }[]);
vi.mock('../../src/lib/mailer.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/lib/mailer.js')>();
  return {
    ...mod,
    sendMail: async (to: string, subject: string, html: string, attachments?: { filename: string; content: Buffer | string }[]) => {
      mails.push({ to, subject, html });
      return mod.sendMail(to, subject, html, attachments);
    },
  };
});

beforeEach(() => {
  mails.length = 0;
});

const DAY = 24 * 60 * 60 * 1000;

const fetchWork = async (agent: Agent) => {
  const res = await agent.get('/api/admin/my-work?fresh=1').expect(200);
  return res.body as { items: { kind: string; refs: Record<string, string | null>; note?: { key: string } }[] };
};

const pkgBody = { slug: 'standard', tier: 'STANDARD', visaTypes: null, title: l10n('Standard'), summary: l10n('S'), features: l10nList('F'), priceCents: 250000, installments: null, published: true };

describe('countersignature settings', () => {
  it('ADMIN+ only; signatories must be active ADMIN+ users; the default signer is one of them', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    await staff.agent.get('/api/admin/countersign/settings').expect(403);
    const empty = (await admin.agent.get('/api/admin/countersign/settings').expect(200)).body;
    expect(empty.settings).toMatchObject({ enabled: false, signatoryIds: [], reminderDays: 2 });
    expect(empty.candidates.map((u: { id: string }) => u.id)).toContain(admin.user.id);
    expect(empty.candidates.map((u: { id: string }) => u.id)).not.toContain(staff.user.id);
    await admin.agent.put('/api/admin/countersign/settings').send({ enabled: true, signatoryIds: [staff.user.id] }).expect(400);
    await admin.agent.put('/api/admin/countersign/settings').send({ enabled: true, signatoryIds: [] }).expect(400);
    const saved = (await admin.agent.put('/api/admin/countersign/settings').send({ enabled: true, signatoryIds: [admin.user.id], defaultSignerId: 'someone-else' }).expect(200)).body.settings;
    expect(saved).toMatchObject({ enabled: true, signatoryIds: [admin.user.id], defaultSignerId: admin.user.id });
  });
});

describe('package order contract: client → Triad Vision', () => {
  it('activates at the client signature, waits for the countersignature (my-work, list, reminders) and completes with both signatures', async () => {
    const signerA = await asAdmin({ firstName: 'Anar', lastName: 'Default' });
    const signerB = await asAdmin({ firstName: 'Bella', lastName: 'Other' });
    const plainAdmin = await asAdmin({ firstName: 'Cem', lastName: 'NotAuthorised' });
    await signerA.agent.put('/api/admin/countersign/settings').send({ enabled: true, signatoryIds: [signerA.user.id, signerB.user.id], defaultSignerId: signerA.user.id }).expect(200);
    const pkg = (await signerA.agent.post('/api/admin/packages').send(pkgBody).expect(201)).body.package;
    const token = crypto.randomBytes(32).toString('base64url');
    await anon()
      .post('/api/packages/orders')
      .set('Origin', ORIGIN)
      .send({ packageId: pkg.id, name: 'Rauf Həsənov', email: 'rauf.cs@test.local', locale: 'de', acceptTerms: true, acceptPrivacy: true, token })
      .expect(201);
    const order = await prisma.packageOrder.findFirstOrThrow();
    const request = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: order.signatureRequestId! }, include: { signers: { orderBy: { order: 'asc' } } } });
    expect(request.signers.map((s) => [s.role, s.order, s.userId])).toEqual([
      ['CANDIDATE', 1, null],
      ['STAFF', 2, signerA.user.id],
    ]);
    const [client, staffSigner] = request.signers;
    expect(staffSigner.invitedAt).toBeNull(); // sequential: Triad Vision is invited after the client

    await signAsSigner(client.id, { mode: 'TYPE', typedName: 'Rauf Həsənov' }, 'EMAIL_OTP', { ip: '127.0.0.1', userAgent: 'vitest' });
    // Activated at the client's signature …
    const active = await prisma.packageOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(active.status).toBe('ACTIVE');
    expect(await prisma.clientInvoice.count({ where: { orderId: order.id } })).toBe(1);
    // … the contract is pending the countersignature, with a longer deadline.
    const pending = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: request.id }, include: { signers: true } });
    expect(pending.status).toBe('SENT');
    expect(pending.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
    expect(pending.signers.find((s) => s.role === 'STAFF')!.invitedAt).toBeTruthy();
    const status = (await anon().get(`/api/packages/orders/${token}`).expect(200)).body.order;
    expect(status.signature).toMatchObject({ status: 'SENT', countersignPending: true });
    expect((await signerA.agent.get('/api/admin/packages/orders/list').expect(200)).body.orders[0]).toMatchObject({ status: 'ACTIVE', countersignPending: true });
    expect(await runPackageOrderJobs()).toEqual({ activated: 0, cancelled: 0 });

    // To countersign: the default signer and every authorised signatory; not a plain admin.
    const listA = (await signerA.agent.get('/api/admin/countersign').expect(200)).body;
    expect(listA.items).toHaveLength(1);
    expect(listA.items[0]).toMatchObject({ requestId: request.id, signerId: staffSigner.id, kind: 'PACKAGE', mine: true, canSign: true, packageOrderStatus: 'ACTIVE' });
    expect(listA.items[0].clientSigners[0].name).toBe('Rauf Həsənov');
    expect((await signerB.agent.get('/api/admin/countersign').expect(200)).body.items[0]).toMatchObject({ mine: false, canSign: true });
    expect((await plainAdmin.agent.get('/api/admin/countersign').expect(200)).body.items[0]).toMatchObject({ canSign: false });
    // My work: the assigned signer under "sign" with the countersign note; other signatories as "countersign".
    const workA = await fetchWork(signerA.agent);
    const mineItem = workA.items.find((i) => i.kind === 'sign_mine');
    expect(mineItem).toMatchObject({ refs: { signerId: staffSigner.id }, note: { key: 'countersign' } });
    expect(workA.items.filter((i) => i.kind === 'countersign')).toHaveLength(0);
    expect((await fetchWork(signerB.agent)).items.filter((i) => i.kind === 'countersign').map((i) => i.refs.signerId)).toEqual([staffSigner.id]);
    expect((await fetchWork(plainAdmin.agent)).items.some((i) => i.kind === 'countersign')).toBe(false);

    // Reminders after 2 days (once per period), to the assigned signer and the other signatories.
    const signedAt = (await prisma.signatureSigner.findUniqueOrThrow({ where: { id: client.id } })).signedAt!;
    expect((await runSignatureJobs(new Date(signedAt.getTime() + DAY))).countersignReminded).toBe(0);
    expect((await runSignatureJobs(new Date(signedAt.getTime() + 2 * DAY + 60_000))).countersignReminded).toBe(1);
    expect((await runSignatureJobs(new Date(signedAt.getTime() + 2 * DAY + 120_000))).countersignReminded).toBe(0);
    const notes = await prisma.notification.findMany({ where: { type: 'COUNTERSIGN_PENDING' } });
    expect(notes.map((n) => n.userId).sort()).toEqual([signerA.user.id, signerB.user.id].sort());

    // A plain admin cannot countersign; another authorised signatory can (the signer row is handed over).
    await plainAdmin.agent.post(`/api/admin/countersign/${staffSigner.id}`).send({ mode: 'TYPE', typedName: 'Cem', agree: true }).expect(403);
    await signerB.agent.post(`/api/admin/countersign/${staffSigner.id}`).send({ mode: 'DRAW', signature: 'data:image/png;base64,AAAA', agree: true }).expect(400);
    const done = (await signerB.agent.post(`/api/admin/countersign/${staffSigner.id}`).send({ mode: 'DRAW', signature: SIGNATURE_DATA_URL, agree: true }).expect(200)).body.request;
    expect(done.status).toBe('COMPLETED');
    expect(done.hasFinal).toBe(true);
    const staffRow = done.signers.find((s: { role: string }) => s.role === 'STAFF');
    expect(staffRow).toMatchObject({ status: 'SIGNED', userId: signerB.user.id, name: 'Bella Other', authMethod: 'PORTAL' });
    expect(done.events.some((e: { note: string | null }) => e.note?.includes('countersignature taken over from Anar Default'))).toBe(true);
    await signerB.agent.post(`/api/admin/countersign/${staffSigner.id}`).send({ mode: 'TYPE', typedName: 'Bella', agree: true }).expect(409);

    // Final PDF on the case (both signatures + certificate); nothing is created twice.
    const docs = await prisma.document.findMany({ where: { caseId: active.caseId!, stage: 'CONTRACT_SIGNED' } });
    expect(docs).toHaveLength(1);
    expect((await prisma.packageOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('ACTIVE');
    expect(await prisma.clientInvoice.count({ where: { orderId: order.id } })).toBe(1);
    expect((await signerA.agent.get('/api/admin/countersign').expect(200)).body.items).toHaveLength(0);
    await waitFor(async () => mails.find((m) => m.to === 'rauf.cs@test.local' && m.subject.includes('Vollständig unterschrieben')));
  });

  it('without countersignature settings the contract has the client as the only signer (unchanged flow)', async () => {
    const admin = await asAdmin();
    const pkg = (await admin.agent.post('/api/admin/packages').send(pkgBody).expect(201)).body.package;
    await anon()
      .post('/api/packages/orders')
      .set('Origin', ORIGIN)
      .send({ packageId: pkg.id, name: 'Rauf Həsənov', email: 'rauf.plain@test.local', locale: 'de', acceptTerms: true, acceptPrivacy: true, token: crypto.randomBytes(32).toString('base64url') })
      .expect(201);
    const order = await prisma.packageOrder.findFirstOrThrow();
    expect(await prisma.signatureSigner.count({ where: { requestId: order.signatureRequestId! } })).toBe(1);
  });
});

describe('case contract', () => {
  it('appends the default authorised signatory after the client unless a Triad Vision signer is already there', async () => {
    const admin = await asAdmin({ firstName: 'Anar', lastName: 'Default' });
    await admin.agent.put('/api/admin/countersign/settings').send({ enabled: true, signatoryIds: [admin.user.id] }).expect(200);
    const client = await asClient({ firstName: 'Leyla', lastName: 'Əliyeva' });
    const kase = await createCase(client.user.id, { profession: 'Tibb bacısı', visaType: 'WORK', quiet: true });
    const create = async (signers: Record<string, unknown>[], caseContract: boolean) =>
      (
        await admin.agent
          .post('/api/admin/signatures')
          .field('payload', JSON.stringify({ title: 'Dienstleistungsvertrag', caseId: kase.id, caseContract, send: false, signers }))
          .attach('file', await makePdf('VERTRAG', 1), { filename: 'vertrag.pdf', ...PDF })
          .expect(201)
      ).body.request;
    const candidate = { role: 'CANDIDATE', name: 'Leyla Əliyeva', email: client.user.email, userId: client.user.id, order: 1 };
    const withCs = await create([candidate], true);
    expect(withCs.signers.map((s: { role: string; order: number; userId: string | null }) => [s.role, s.order, s.userId])).toEqual([
      ['CANDIDATE', 1, client.user.id],
      ['STAFF', 2, admin.user.id],
    ]);
    const other = await asStaff({ firstName: 'Staff', lastName: 'Signer' });
    const manual = await create([candidate, { role: 'STAFF', name: 'Staff Signer', email: other.user.email, order: 2 }], true);
    expect(manual.signers.map((s: { role: string }) => s.role)).toEqual(['CANDIDATE', 'STAFF']);
    const notContract = await create([candidate], false);
    expect(notContract.signers).toHaveLength(1);
  });
});
