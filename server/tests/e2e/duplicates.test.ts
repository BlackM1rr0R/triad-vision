import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin, sessionAgent, ORIGIN } from '../helpers/api';
import { createUser, TEST_PASSWORD } from '../helpers/factories';
import { prisma, waitFor } from '../helpers/db';
import { createCaseVia, expectStatus, uploadRequired } from '../helpers/workflow';
import { foldName, nameKey, normEmail, normPhone, normPassport } from '../../src/lib/duplicates/normalize.js';
import { findPairs, scanAllDuplicates } from '../../src/lib/duplicates/detect.js';
import { mergeRelations } from '../../src/lib/userMerge.js';

type Opts = Partial<Prisma.UserUncheckedCreateInput>;
/** A client with profile fields set directly. */
const client = async (data: Opts = {}) => {
  const u = await asClient({ firstName: (data.firstName as string) ?? `F${crypto.randomBytes(3).toString('hex')}`, lastName: (data.lastName as string) ?? `L${crypto.randomBytes(3).toString('hex')}` });
  const user = await prisma.user.update({ where: { id: u.user.id }, data: data as Prisma.UserUncheckedUpdateInput });
  return { ...u, user };
};
const ordered = (x: string, y: string) => (x < y ? [x, y] : [y, x]);
const pairOf = (x: string, y: string) => {
  const [a, b] = ordered(x, y);
  return prisma.duplicatePair.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } });
};
const rules = (p: { reasons: unknown } | null) => ((p?.reasons ?? []) as { rule: string }[]).map((r) => r.rule).sort();

describe('normalisation', () => {
  it('passport, phone, e-mail and names', () => {
    expect(normPassport(' c 0123-4567 ')).toBe('C01234567');
    expect(normPhone('+994 50 123-45-67')).toBe('994501234567');
    expect(normPhone('050 123 45 67')).toBe('994501234567');
    expect(normPhone('00994501234567')).toBe('994501234567');
    expect(normPhone('+49 151 1234567')).toBe('491511234567');
    expect(normEmail('Ali.Mammadov+visa@GoogleMail.com')).toBe('alimammadov@gmail.com');
    expect(normEmail('a.b+x@mail.ru')).toBe('a.b@mail.ru');
    expect(normEmail('merged+abc@invalid')).toBeNull();
    for (const v of ['Məmmədov', 'Mammadov', 'Mamedov', 'Мамедов', 'MEMMEDOV']) expect(foldName(v)).toBe('mamadov');
    for (const v of ['Elçin', 'Elchin', 'Эльчин']) expect(foldName(v)).toBe('alcin');
    for (const v of ['Xəlil', 'Khalil', 'Халил']) expect(foldName(v)).toBe('xalil');
    expect(nameKey('Əli', 'Məmmədov')).toBe(nameKey('MAMMADOV', 'ALI'));
  });
});

describe('detection rules', () => {
  it('same passport number (strong), formatting ignored', async () => {
    const a = await client({ passportNumber: 'C01234567' });
    const b = await client({ passportNumber: 'c 0123-4567' });
    await scanAllDuplicates();
    const p = await pairOf(a.user.id, b.user.id);
    expect(rules(p)).toEqual(['PASSPORT']);
    expect(p!.score).toBe(100);
    expect(p!.status).toBe('OPEN');
  });

  it('same normalised phone (+994 vs local 0 prefix)', async () => {
    const a = await client({ phone: '+994501234567' });
    const b = await client({ phone: '050 123 45 67' });
    const c = await client({ phone: '+994501234568' });
    await scanAllDuplicates();
    expect(rules(await pairOf(a.user.id, b.user.id))).toEqual(['PHONE']);
    expect(await pairOf(a.user.id, c.user.id)).toBeNull();
  });

  it('same e-mail ignoring case, +tags and dots for Gmail only', async () => {
    const base = `ali.mammadov.${Date.now()}`;
    const a = await client({ email: `${base}+visa@googlemail.com` });
    const b = await client({ email: `${base.replace(/\./g, '').toUpperCase()}@GMAIL.com` });
    const c = await client({ email: `x.y${Date.now()}@mail.ru` });
    const d = await client({ email: c.user.email.replace('x.y', 'xy') });
    await scanAllDuplicates();
    expect(rules(await pairOf(a.user.id, b.user.id))).toEqual(['EMAIL']);
    expect(await pairOf(c.user.id, d.user.id)).toBeNull();
  });

  it('same name after transliteration + same birth date (strong); other birth date → no pair', async () => {
    const birthDate = new Date('1990-05-14T00:00:00Z');
    const a = await client({ firstName: 'Əli', lastName: 'Məmmədov', birthDate });
    const b = await client({ firstName: 'ALI', lastName: 'MAMMADOV', birthDate });
    const c = await client({ firstName: 'Мамедов', lastName: 'Али', birthDate }); // Cyrillic, swapped order
    const d = await client({ firstName: 'Ali', lastName: 'Mammadov', birthDate: new Date('1991-05-14T00:00:00Z') });
    await scanAllDuplicates();
    expect(rules(await pairOf(a.user.id, b.user.id))).toEqual(['NAME_BIRTHDATE']);
    expect(rules(await pairOf(a.user.id, c.user.id))).toEqual(['NAME_BIRTHDATE']);
    expect((await pairOf(a.user.id, b.user.id))!.score).toBe(90);
    expect(await pairOf(a.user.id, d.user.id)).toBeNull();
  });

  it('similar name (Jaro–Winkler ≥ 0.92) + same birth date or same city (medium)', async () => {
    const birthDate = new Date('1985-01-02T00:00:00Z');
    const a = await client({ firstName: 'Elchin', lastName: 'Huseynov', birthDate });
    const b = await client({ firstName: 'Elcin', lastName: 'Huseinov', birthDate });
    const c = await client({ firstName: 'Tural', lastName: 'Abdullayev', city: 'Gəncə' });
    const e = await client({ firstName: 'Tural', lastName: 'Abdulayeva', city: 'Gence' });
    const f = await client({ firstName: 'Tural', lastName: 'Abdullayev', city: 'Bakı' }); // other city, no birth date
    await scanAllDuplicates();
    const ab = await pairOf(a.user.id, b.user.id);
    expect(rules(ab)).toEqual(['SIMILAR_NAME_BIRTHDATE']);
    expect(ab!.score).toBe(75);
    expect(rules(await pairOf(c.user.id, e.user.id))).toEqual(['SIMILAR_NAME_CITY']);
    expect(await pairOf(c.user.id, f.user.id)).toBeNull();
  });

  it('several rules add up; staff and company accounts are never candidates', async () => {
    const a = await client({ phone: '+994551112233', passportNumber: 'AZE1234567' });
    const b = await client({ phone: '+994551112233', passportNumber: 'AZE1234567' });
    const staff = await createUser({ role: 'STAFF', phone: '+994551112233' });
    await scanAllDuplicates();
    const p = await pairOf(a.user.id, b.user.id);
    expect(rules(p)).toEqual(['PASSPORT', 'PHONE']);
    expect(p!.score).toBe(100);
    expect(await prisma.duplicatePair.count({ where: { OR: [{ userAId: staff.user.id }, { userBId: staff.user.id }] } })).toBe(0);
  });

  it('findPairs: blocking keeps the work linear for distinct people', () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({ id: `u${i}`, firstName: `Name${i}`, lastName: `Person${i}`, email: `p${i}@x.az`, phone: `+9945000${String(i).padStart(5, '0')}`, passportNumber: `P${100000 + i}`, birthDate: null, city: null }));
    const t0 = Date.now();
    expect(findPairs(many)).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it('"not a duplicate" sticks across scans and can be reopened; stale open pairs disappear', async () => {
    const admin = await asAdmin();
    const a = await client({ passportNumber: 'C11111111' });
    const b = await client({ passportNumber: 'C11111111' });
    expectStatus(await admin.agent.post('/api/admin/duplicates/scan'), 200);
    const p = (await pairOf(a.user.id, b.user.id))!;
    expectStatus(await admin.agent.post(`/api/admin/duplicates/${p.id}/not-duplicate`), 200);
    await scanAllDuplicates();
    expect((await pairOf(a.user.id, b.user.id))!.status).toBe('NOT_DUPLICATE');
    const list = expectStatus(await admin.agent.get('/api/admin/duplicates'), 200).body;
    expect(list.items).toHaveLength(0);
    expect(expectStatus(await admin.agent.get('/api/admin/duplicates?status=NOT_DUPLICATE'), 200).body.items).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: 'DUPLICATE_DISMISSED' } })).toBe(1);
    expectStatus(await admin.agent.post(`/api/admin/duplicates/${p.id}/reopen`), 200);
    expect((await pairOf(a.user.id, b.user.id))!.status).toBe('OPEN');
    // The data changes → the open pair no longer matches and goes away.
    await prisma.user.update({ where: { id: b.user.id }, data: { passportNumber: 'C22222222' } });
    await scanAllDuplicates();
    expect(await pairOf(a.user.id, b.user.id)).toBeNull();
  });

  it('registration and a profile change scan the client right away', async () => {
    const existing = await client({ passportNumber: 'C55555555', firstName: 'Nigar', lastName: 'Aliyeva' });
    const res = await anon()
      .post('/api/auth/register')
      .set('Origin', ORIGIN)
      .send({ email: `nigar${Date.now()}@test.local`, password: 'Password123', firstName: 'Nigar', lastName: 'Əliyeva', phone: '+994 70 111 22 33', birthDate: '1995-03-01', passportNumber: 'c5555 5555' });
    expectStatus(res, 201);
    const pair = await waitFor(() => pairOf(existing.user.id, res.body.user.id));
    expect(rules(pair)).toContain('PASSPORT');

    const other = await client({ phone: '+994701112299' });
    expectStatus(await other.agent.patch('/api/auth/me').send({ phone: '+994701112233' }), 200);
    const p2 = await waitFor(() => pairOf(other.user.id, res.body.user.id));
    expect(rules(p2)).toContain('PHONE');
  });
});

describe('authorization', () => {
  it('staff and clients get 403; admins review; merging needs SUPER_ADMIN unless allowed in the settings', async () => {
    const a = await client({ passportNumber: 'C77777777' });
    const b = await client({ passportNumber: 'C77777777' });
    for (const actor of [await asStaff(), await asClient()]) {
      expectStatus(await actor.agent.get('/api/admin/duplicates'), 403);
      expectStatus(await actor.agent.post('/api/admin/duplicates/merge').send({ primaryId: a.user.id, secondaryId: b.user.id, confirm: 'MERGE' }), 403);
    }
    const admin = await asAdmin();
    const list = expectStatus(await admin.agent.get('/api/admin/duplicates'), 200).body;
    expect(list.canMerge).toBe(false);
    expectStatus(await admin.agent.get(`/api/admin/duplicates/compare?a=${a.user.id}&b=${b.user.id}`), 200);
    expect(expectStatus(await admin.agent.post('/api/admin/duplicates/merge').send({ primaryId: a.user.id, secondaryId: b.user.id, confirm: 'MERGE' }), 403).body.error).toBe('MERGE_NOT_ALLOWED');
    expectStatus(await admin.agent.put('/api/admin/duplicates/settings').send({ mergeMinRole: 'ADMIN' }), 403);

    const sa = await asSuperAdmin();
    expectStatus(await sa.agent.put('/api/admin/duplicates/settings').send({ mergeMinRole: 'ADMIN' }), 200);
    expect(expectStatus(await admin.agent.get('/api/admin/duplicates'), 200).body.canMerge).toBe(true);
    expect(expectStatus(await admin.agent.post('/api/admin/duplicates/merge').send({ primaryId: a.user.id, secondaryId: b.user.id, confirm: 'merge' }), 400).body.error).toBe('CONFIRMATION_MISMATCH');
    expectStatus(await admin.agent.post('/api/admin/duplicates/merge').send({ primaryId: a.user.id, secondaryId: b.user.id, confirm: 'MERGE' }), 200);
  });
});

describe('merge refusals', () => {
  it('never staff, company or already merged accounts; two active cases of the same visa type need a confirmation', async () => {
    const sa = await asSuperAdmin();
    const merge = (primaryId: string, secondaryId: string, extra: Record<string, unknown> = {}) =>
      sa.agent.post('/api/admin/duplicates/merge').send({ primaryId, secondaryId, confirm: 'MERGE', ...extra });
    const c1 = await client();
    const staff = await createUser({ role: 'STAFF' });
    const company = await createUser({ role: 'COMPANY' });
    expect(expectStatus(await merge(c1.user.id, staff.user.id), 400).body.error).toBe('CANNOT_MERGE_STAFF');
    expect(expectStatus(await merge(sa.user.id, c1.user.id), 400).body.error).toBe('CANNOT_MERGE_STAFF');
    expect(expectStatus(await merge(c1.user.id, company.user.id), 400).body.error).toBe('CANNOT_MERGE_COMPANY');
    expect(expectStatus(await merge(c1.user.id, c1.user.id), 400).body.error).toBe('SAME_ACCOUNT');
    expect(expectStatus(await merge(c1.user.id, 'nope'), 404).body.error).toBe('USER_NOT_FOUND');

    // Both with an active WORK case.
    const c2 = await client();
    const case1 = await createCaseVia(c1.agent);
    const case2 = await createCaseVia(c2.agent);
    expect(expectStatus(await merge(c1.user.id, c2.user.id), 409).body.error).toBe('TWO_ACTIVE_CASES');
    const cmp = expectStatus(await sa.agent.get(`/api/admin/duplicates/compare?a=${c1.user.id}&b=${c2.user.id}`), 200).body;
    expect(cmp.activeCaseClashes).toHaveLength(1);
    const ok = expectStatus(await merge(c1.user.id, c2.user.id, { allowTwoActiveCases: true }), 200).body;
    expect(ok.drive.mode).toBe('KEEP');
    // Cases stay separate, both under the primary client.
    const cases = await prisma.case.findMany({ where: { id: { in: [case1.id, case2.id] } } });
    expect(cases.map((c) => c.clientId)).toEqual([c1.user.id, c1.user.id]);
    expect(expectStatus(await merge(c1.user.id, c2.user.id), 409).body.error).toBe('ALREADY_MERGED');
  });
});

describe('merge', () => {
  it('repoints every relation, combines applications, moves drive files, closes the secondary and audits', async () => {
    const sa = await asSuperAdmin();
    const staff = await createUser({ role: 'STAFF' });
    const birthDate = new Date('1992-07-01T00:00:00Z');
    const P = await client({ firstName: 'Ali', lastName: 'Mammadov', birthDate, phone: '+994501110000', city: 'Bakı', whatsappOptIn: false });
    const S = await client({ firstName: 'Əli', lastName: 'Məmmədov', birthDate, phone: '+994502220000', passportNumber: 'C99999999', profession: 'Sürücü' });
    const sOldEmail = S.user.email;

    // Cases and drive folders (the primary's case is closed, so the active cases do not clash).
    const pCase = await createCaseVia(P.agent);
    const sCase = await createCaseVia(S.agent);
    await uploadRequired(S.agent, sCase.id, 'INITIAL');
    await prisma.case.update({ where: { id: pCase.id }, data: { status: 'APPROVED', closedAt: new Date() } });
    const pFolder = await waitFor(async () => (await prisma.case.findUnique({ where: { id: pCase.id } }))?.driveFolderId);
    const sFolder = await waitFor(async () => (await prisma.case.findUnique({ where: { id: sCase.id } }))?.driveFolderId);
    const file = (parentId: string, name: string) =>
      prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FILE', name, parentId, storageKey: crypto.randomUUID(), mimeType: 'application/pdf', size: 3 } });
    const folder = (parentId: string, name: string) => prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name, parentId } });
    await file(pFolder, 'Pasport.pdf');
    const sPass = await file(sFolder, 'pasport.pdf'); // clashes (names ignore case)
    const sOnly = await file(sFolder, 'Diplom.pdf');
    const pSub = await folder(pFolder, 'Tərcümələr ');
    const sSub = await folder(sFolder, 'Tərcümələr ');
    await file(pSub.id, 'a.pdf');
    const sSubFile = await file(sSub.id, 'a.pdf');

    // One row of many relation types on the secondary.
    const caseMsg = await prisma.caseMessage.create({ data: { caseId: sCase.id, authorId: S.user.id, body: 'Salam' } });
    const notif = await prisma.notification.create({ data: { userId: S.user.id, type: 'INFO', title: 't', body: 'b' } });
    const vacancy1 = await prisma.vacancy.create({ data: { slug: `v1-${Date.now()}`, title: { az: 'x' }, description: { az: 'x' } } });
    const vacancy2 = await prisma.vacancy.create({ data: { slug: `v2-${Date.now()}`, title: { az: 'y' }, description: { az: 'y' } } });
    const pApp = await prisma.vacancyApplication.create({ data: { vacancyId: vacancy1.id, userId: P.user.id, status: 'SHORTLISTED', staffNote: 'note P' } });
    const sApp = await prisma.vacancyApplication.create({ data: { vacancyId: vacancy1.id, userId: S.user.id, status: 'INTERVIEW', staffNote: 'note S', matchScore: 80 } });
    const sApp2 = await prisma.vacancyApplication.create({ data: { vacancyId: vacancy2.id, userId: S.user.id, status: 'NEW' } });
    const interview = await prisma.interview.create({ data: { candidateId: S.user.id, applicationId: sApp.id, startsAt: new Date(), endsAt: new Date(Date.now() + 3600_000) } });
    const slot = await prisma.consultationSlot.create({ data: { staffId: staff.user.id, startsAt: new Date(Date.now() + 86400_000), endsAt: new Date(Date.now() + 90000_000) } });
    const booking = await prisma.booking.create({ data: { slotId: slot.id, userId: S.user.id, name: 'Əli', email: sOldEmail, meetingUrl: 'https://meet', manageToken: crypto.randomUUID() } });
    const review = await prisma.review.create({ data: { userId: S.user.id, caseId: sCase.id, tokenHash: crypto.randomUUID() } });
    const task = await prisma.task.create({ data: { number: 9001, title: 'Call client', caseId: sCase.id } });
    await prisma.taskAssignee.createMany({ data: [{ taskId: task.id, userId: S.user.id }, { taskId: task.id, userId: P.user.id }] });
    const task2 = await prisma.task.create({ data: { number: 9002, title: 'Other' } });
    await prisma.taskAssignee.create({ data: { taskId: task2.id, userId: S.user.id } });
    const sigReq = await prisma.signatureRequest.create({ data: { title: 'Contract', originalName: 'c.pdf', originalKey: crypto.randomUUID(), originalSha256: 'a'.repeat(64), originalSize: 1, originalPages: 1, caseId: sCase.id } });
    const signer = await prisma.signatureSigner.create({ data: { requestId: sigReq.id, role: 'CANDIDATE', name: 'Əli', email: sOldEmail, userId: S.user.id } });
    const settlement = await prisma.settlementEntry.create({ data: { clientName: 'Əli Məmmədov', caseId: sCase.id } });
    const agentUser = await createUser({ role: 'AGENT' });
    const agent = await prisma.agent.create({ data: { userId: agentUser.user.id, code: `AG${Date.now()}` } });
    await prisma.user.update({ where: { id: S.user.id }, data: { referredByAgentId: agent.id, referredAt: new Date() } });
    const commission = await prisma.agentCommission.create({ data: { agentId: agent.id, clientId: S.user.id, event: 'CASE_CREATED', amountCents: 1000 } });
    const privacy = await prisma.privacyRequest.create({ data: { userId: S.user.id, email: sOldEmail, type: 'EXPORT', dueAt: new Date(Date.now() + 30 * 86400_000) } });
    const survey = await prisma.satisfactionSurvey.create({ data: { caseId: sCase.id, clientId: S.user.id, trigger: 'CASE_CLOSED', tokenHash: crypto.randomBytes(32).toString('hex') } });
    // Consents: the primary withdrew WhatsApp earlier, the secondary opted in later → opt-in wins (newest explicit record).
    await prisma.consentRecord.create({ data: { userId: P.user.id, type: 'WHATSAPP', granted: false, version: '1', source: 'PROFILE', createdAt: new Date(Date.now() - 86400_000) } });
    const consent = await prisma.consentRecord.create({ data: { userId: S.user.id, type: 'WHATSAPP', granted: true, version: '1', source: 'PROFILE' } });
    const device = await prisma.pushDevice.create({ data: { userId: S.user.id, token: crypto.randomUUID(), platform: 'android' } });
    const vault = await prisma.vaultDocument.create({ data: { userId: S.user.id, kind: 'PASSPORT', title: 'Pass', storageKey: crypto.randomUUID(), filename: 'p.pdf', mimeType: 'application/pdf', size: 1 } });
    const channel = await prisma.chatChannel.create({ data: { kind: 'PRIVATE', name: 'dup-test' } });
    await prisma.chatMember.createMany({ data: [{ channelId: channel.id, userId: S.user.id }, { channelId: channel.id, userId: P.user.id }] });
    const sDocs = await prisma.document.findMany({ where: { uploadedById: S.user.id }, select: { id: true } });
    expect(sDocs.length).toBeGreaterThan(0);

    // An open pair exists (same name + birth date).
    await scanAllDuplicates();
    const pair = (await pairOf(P.user.id, S.user.id))!;
    expect(pair.status).toBe('OPEN');

    // Comparison: the secondary has the active case → suggested as primary; we pick P explicitly.
    const cmp = expectStatus(await sa.agent.get(`/api/admin/duplicates/compare?a=${P.user.id}&b=${S.user.id}`), 200).body;
    expect(cmp.suggestedPrimaryId).toBe(S.user.id);
    expect(cmp.conflicts).toEqual(expect.arrayContaining(['email', 'firstName', 'lastName', 'phone']));
    expect(cmp.blocker).toBeNull();

    const res = expectStatus(
      await sa.agent.post('/api/admin/duplicates/merge').send({
        primaryId: P.user.id,
        secondaryId: S.user.id,
        confirm: 'MERGE',
        fields: { email: 'secondary', phone: 'secondary', firstName: 'primary' },
        informClient: true,
      }),
      200,
    ).body;
    expect(res.drive.mode).toBe('MERGE');
    expect(res.informed).toBe(true);

    // Every relation now points to the primary.
    const pid = P.user.id;
    expect((await prisma.case.findUnique({ where: { id: sCase.id } }))!.clientId).toBe(pid);
    expect(await prisma.document.count({ where: { id: { in: sDocs.map((d) => d.id) }, uploadedById: pid } })).toBe(sDocs.length);
    expect((await prisma.caseMessage.findUnique({ where: { id: caseMsg.id } }))!.authorId).toBe(pid);
    expect((await prisma.notification.findUnique({ where: { id: notif.id } }))!.userId).toBe(pid);
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))!.userId).toBe(pid);
    expect((await prisma.review.findUnique({ where: { id: review.id } }))!.userId).toBe(pid);
    expect((await prisma.signatureSigner.findUnique({ where: { id: signer.id } }))!.userId).toBe(pid);
    expect((await prisma.settlementEntry.findUnique({ where: { id: settlement.id }, include: { case: true } }))!.case!.clientId).toBe(pid);
    expect((await prisma.agentCommission.findUnique({ where: { id: commission.id } }))!.clientId).toBe(pid);
    expect((await prisma.privacyRequest.findUnique({ where: { id: privacy.id } }))!.userId).toBe(pid);
    expect((await prisma.satisfactionSurvey.findUnique({ where: { id: survey.id } }))!.clientId).toBe(pid);
    expect((await prisma.consentRecord.findUnique({ where: { id: consent.id } }))!.userId).toBe(pid);
    expect((await prisma.pushDevice.findUnique({ where: { id: device.id } }))!.userId).toBe(pid);
    expect((await prisma.vaultDocument.findUnique({ where: { id: vault.id } }))!.userId).toBe(pid);
    expect((await prisma.interview.findUnique({ where: { id: interview.id } }))!.candidateId).toBe(pid);
    // Task assignees: the duplicate join row is dropped, the other one moved.
    expect(await prisma.taskAssignee.findMany({ where: { taskId: task.id } })).toEqual([expect.objectContaining({ userId: pid })]);
    expect((await prisma.taskAssignee.findMany({ where: { taskId: task2.id } })).map((x) => x.userId)).toEqual([pid]);
    expect((await prisma.chatMember.findMany({ where: { channelId: channel.id } })).map((m) => m.userId)).toEqual([pid]);
    // Sessions of the secondary are gone; no relation of the schema still points at it.
    expect(await prisma.session.count({ where: { userId: S.user.id } })).toBe(0);
    for (const rel of mergeRelations()) {
      const n = await (prisma as unknown as Record<string, { count: (a: unknown) => Promise<number> }>)[rel.delegate].count({ where: { [rel.fk]: S.user.id } });
      expect({ rel: `${rel.model}.${rel.fk}`, n }).toEqual({ rel: `${rel.model}.${rel.fk}`, n: 0 });
    }

    // Applications: one per vacancy, the more advanced status, notes joined, the interview follows.
    const apps = await prisma.vacancyApplication.findMany({ where: { userId: pid }, orderBy: { createdAt: 'asc' } });
    expect(apps.map((a) => a.id).sort()).toEqual([pApp.id, sApp2.id].sort());
    const kept = apps.find((a) => a.id === pApp.id)!;
    expect(kept.status).toBe('INTERVIEW');
    expect(kept.staffNote).toBe('note P\n---\nnote S');
    expect(kept.matchScore).toBe(80);
    expect(await prisma.vacancyApplication.findUnique({ where: { id: sApp.id } })).toBeNull();
    expect((await prisma.interview.findUnique({ where: { id: interview.id } }))!.applicationId).toBe(pApp.id);

    // Drive: the secondary's files sit in the primary's client folder; clashes renamed, same-name folders merged.
    const moved = await prisma.driveNode.findMany({ where: { id: { in: [sPass.id, sOnly.id, sSubFile.id] } } });
    const byId = new Map(moved.map((n) => [n.id, n]));
    expect(byId.get(sPass.id)).toMatchObject({ parentId: pFolder, name: 'pasport (2).pdf' });
    expect(byId.get(sOnly.id)).toMatchObject({ parentId: pFolder, name: 'Diplom.pdf' });
    expect(byId.get(sSubFile.id)).toMatchObject({ parentId: pSub.id, name: 'a (2).pdf' });
    expect((await prisma.driveNode.findUnique({ where: { id: sFolder } }))!.deletedAt).not.toBeNull();
    expect((await prisma.driveNode.findUnique({ where: { id: sSub.id } }))!.deletedAt).not.toBeNull();
    expect((await prisma.case.findUnique({ where: { id: sCase.id } }))!.driveFolderId).toBeNull();

    // Fields: chosen values, consent rule, referral carried over.
    const p = (await prisma.user.findUnique({ where: { id: pid } }))!;
    expect(p.email).toBe(sOldEmail);
    expect(p.phone).toBe('+994502220000');
    expect(p.firstName).toBe('Ali');
    expect(p.passportNumber).toBe('C99999999'); // empty on the primary → taken by default
    expect(p.profession).toBe('Sürücü');
    expect(p.city).toBe('Bakı');
    expect(p.whatsappOptIn).toBe(true);
    expect(p.referredByAgentId).toBe(agent.id);

    // Secondary: anonymised, disabled, redirected.
    const s = (await prisma.user.findUnique({ where: { id: S.user.id } }))!;
    expect(s).toMatchObject({ email: `merged+${S.user.id}@invalid`, isActive: false, mergedIntoId: pid, phone: null, passportNumber: null, birthDate: null, firstName: 'Merged' });
    expect(s.mergedAt).not.toBeNull();
    expect(expectStatus(await sessionAgent(S.token).get('/api/auth/me'), 200).body.user).toBeNull();
    expect((await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: `merged+${S.user.id}@invalid`, password: TEST_PASSWORD })).status).not.toBe(200);
    // The old address now logs into the primary.
    const login = await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: sOldEmail, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(pid);
    const resolved = expectStatus(await sa.agent.get(`/api/admin/duplicates/user/${S.user.id}`), 200).body;
    expect(resolved).toMatchObject({ resolvedId: pid, merged: true });
    expect(resolved.merges).toHaveLength(1);

    // Pair, merge record, audit, e-mail.
    expect((await pairOf(P.user.id, S.user.id))!).toMatchObject({ status: 'MERGED', decidedById: sa.user.id });
    const record = (await prisma.userMerge.findFirst({ where: { primaryId: pid } }))!;
    const snap = record.snapshot as { relations: Record<string, { moved: string[]; dropped: string[] }>; drive: { moved: string[]; renamed: unknown[] } };
    expect(snap.relations['Case.clientId'].moved).toEqual([sCase.id]);
    expect(snap.relations['TaskAssignee.userId'].dropped).toEqual([`${task.id}:${S.user.id}`]);
    expect(snap.drive.renamed).toHaveLength(2);
    expect((record.secondary as { email: string }).email).toBe(sOldEmail);
    const log = await prisma.auditLog.findFirst({ where: { action: 'USER_MERGED' } });
    expect(log).toMatchObject({ actorId: sa.user.id, target: `user:${pid}` });
    const details = log!.details as { counts: Record<string, number>; fields: Record<string, string>; secondaryId: string };
    expect(details.secondaryId).toBe(S.user.id);
    expect(details.counts['Case.clientId']).toBe(1);
    expect(details.fields.email).toBe('secondary');
    expect(await prisma.emailLog.count({ where: { to: sOldEmail } })).toBeGreaterThan(0);

    // A re-scan never pairs the closed stub again.
    await scanAllDuplicates();
    expect(await prisma.duplicatePair.count({ where: { status: 'OPEN', OR: [{ userAId: S.user.id }, { userBId: S.user.id }] } })).toBe(0);
    const badge = expectStatus(await sa.agent.post('/api/admin/duplicates/open-users').send({ ids: [pid, S.user.id] }), 200).body;
    expect(badge.ids).toEqual([]);
  });

  it('carries "not a duplicate" decisions over to the primary; badge endpoints', async () => {
    const sa = await asSuperAdmin();
    const P = await client({ passportNumber: 'C10101010' });
    const S = await client({ passportNumber: 'C10101010', phone: '+994503334455' });
    const X = await client({ phone: '+994503334455' });
    await scanAllDuplicates();
    const sx = (await pairOf(S.user.id, X.user.id))!;
    expectStatus(await sa.agent.post(`/api/admin/duplicates/${sx.id}/not-duplicate`), 200);
    expectStatus(await sa.agent.post('/api/admin/duplicates/merge').send({ primaryId: P.user.id, secondaryId: S.user.id, confirm: 'MERGE', fields: { phone: 'secondary' } }), 200);
    // The decision "S is not X" now holds for P (whose phone is X's now) — no new open pair.
    const px = (await pairOf(P.user.id, X.user.id))!;
    expect(px.status).toBe('NOT_DUPLICATE');
    expect(await prisma.duplicatePair.count({ where: { status: 'OPEN' } })).toBe(0);
    // The admin badge endpoint lists an open pair for the primary when there is one.
    const Y = await client({ passportNumber: 'C10101010' });
    await scanAllDuplicates();
    const badge = expectStatus(await sa.agent.post('/api/admin/duplicates/open-users').send({ ids: [P.user.id, Y.user.id, X.user.id] }), 200).body;
    expect(badge.ids.sort()).toEqual([P.user.id, Y.user.id].sort());
    const one = expectStatus(await sa.agent.get(`/api/admin/duplicates/user/${P.user.id}`), 200).body;
    expect(one.openPairs).toHaveLength(1);
  });
});
