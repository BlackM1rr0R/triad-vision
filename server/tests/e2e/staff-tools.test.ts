import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { emailsTo, prisma } from '../helpers/db';
import { makePdf, PDF } from '../helpers/files';
import { clientCase, createCaseVia, expectStatus } from '../helpers/workflow';
import { hashUploadToken } from '../../src/lib/uploadLinks/token.js';

// Staff tools: originals receipt verification (QR), login-free upload links, rule-change notices, data-quality panel.

const DAY = 24 * 60 * 60 * 1000;

describe('originals receipt verification (public /originals/verify/:code)', () => {
  it('shows only receipt number, date, count, kind, staff first name and initials', async () => {
    const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov' });
    await prisma.user.update({ where: { id: client.user.id }, data: { passportNumber: 'C01234567', phone: '+994501112233' } });
    const staff = await asStaff({ firstName: 'Leyla', lastName: 'Həsənova' });
    const c = await createCaseVia(client.agent);
    const res = expectStatus(
      await staff.agent.post(`/api/originals/cases/${c.id}/receive`).send({ items: [{ title: 'Pasport C01234567', kind: 'PASSPORT' }, { title: 'Bakalavr diplomu', kind: 'DIPLOMA' }] }),
      201,
    ).body;
    const receipt = await prisma.originalReceipt.findUniqueOrThrow({ where: { actNodeId: res.act.nodeId } });
    expect(receipt.code).toMatch(/^[A-Z2-9]{16}$/);

    const v = expectStatus(await anon().get(`/api/originals/verify/${receipt.code}`), 200);
    expect(v.headers['x-robots-tag']).toBe('noindex');
    expect(v.body).toEqual({ valid: true, number: receipt.number, date: receipt.at.toISOString(), documents: 2, status: 'HANDED_OVER', staff: 'Leyla', client: 'Ə. M.' });
    const raw = JSON.stringify(v.body);
    for (const secret of ['C01234567', 'Məmmədov', 'Əli', 'Həsənova', 'Pasport', 'diplomu', '+994', client.user.email, c.id]) expect(raw).not.toContain(secret);

    // Lower-case input works, unknown / malformed codes are 404.
    expectStatus(await anon().get(`/api/originals/verify/${receipt.code.toLowerCase()}`), 200);
    expectStatus(await anon().get('/api/originals/verify/AAAAAAAAAAAAAAAA'), 404);
    expectStatus(await anon().get('/api/originals/verify/x'), 404);

    // The client's portal lists the receipt with its number and check link.
    const mine = expectStatus(await client.agent.get(`/api/originals/my/cases/${c.id}`), 200).body;
    expect(mine.acts[0].receiptNumber).toBe(receipt.number);
    expect(mine.acts[0].verifyUrl).toContain(`/originals/verify/${receipt.code}`);

    // Returning to the client: a new receipt with status RETURNED; signing keeps the same code.
    const back = expectStatus(await staff.agent.post('/api/originals/events/bulk').send({ ids: res.ids, action: 'RETURNED_TO_CLIENT' }), 200).body;
    const r2 = await prisma.originalReceipt.findUniqueOrThrow({ where: { actNodeId: back.act.nodeId } });
    expect(expectStatus(await anon().get(`/api/originals/verify/${r2.code}`), 200).body.status).toBe('RETURNED');
    expectStatus(await staff.agent.post(`/api/originals/events/${back.eventIds[0]}/sign`).send({}), 200);
    expect((await prisma.originalReceipt.findUniqueOrThrow({ where: { actNodeId: back.act.nodeId } })).code).toBe(r2.code);

    // A deleted act no longer verifies.
    await prisma.driveNode.update({ where: { id: back.act.nodeId }, data: { deletedAt: new Date() } });
    expectStatus(await anon().get(`/api/originals/verify/${r2.code}`), 404);
  });
});

describe('login-free case upload links', () => {
  const setup = async () => {
    const client = await asClient({ firstName: 'Aynur', lastName: 'Quliyeva' });
    const staff = await asStaff();
    const c = await createCaseVia(client.agent);
    const reqs = (await clientCase(client.agent, c.id)).requirements.filter((r) => r.stage === 'INITIAL');
    return { client, staff, c, reqs };
  };

  it('happy path: staff creates + e-mails the link, the client uploads without login, staff are notified', async () => {
    const { client, staff, c, reqs } = await setup();
    // Clients cannot create links.
    expect((await client.agent.post(`/api/admin/cases/${c.id}/upload-links`).send({ requirementIds: [reqs[0].id] })).status).toBe(403);
    // Requirements of another case are refused.
    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/upload-links`).send({ requirementIds: ['nope'] }), 400);

    const created = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/upload-links`).send({ requirementIds: [reqs[0].id, reqs[1].id], email: true, note: 'Zəhmət olmasa' }), 201).body;
    expect(created.url).toContain(`/upload/${created.token}`);
    expect(created.emailed).toBe(true);
    expect(created.link.state).toBe('ACTIVE');
    expect(new Date(created.link.expiresAt).getTime() - Date.now()).toBeGreaterThan(6.9 * DAY);
    // Only the hash is stored.
    const row = await prisma.caseUploadLink.findUniqueOrThrow({ where: { id: created.link.id } });
    expect(row.tokenHash).toBe(hashUploadToken(created.token));
    expect(JSON.stringify(row)).not.toContain(created.token);
    const mails = await emailsTo(client.user.email);
    expect(mails.some((m) => m.subject.includes(c.number))).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'UPLOAD_LINK_CREATED' } })).toBe(1);

    const view = expectStatus(await anon().get(`/api/upload-links/${created.token}`), 200).body;
    expect(view.client).toBe('A. Q.');
    expect(view.items.map((i: { id: string }) => i.id).sort()).toEqual([reqs[0].id, reqs[1].id].sort());
    expect(JSON.stringify(view)).not.toContain('Quliyeva');
    expect(view.note).toBe('Zəhmət olmasa');

    const up = await anon().post(`/api/upload-links/${created.token}/files`).field('requirementId', reqs[0].id).attach('file', await makePdf('passport'), { filename: 'pasport.pdf', ...PDF });
    expectStatus(up, 201);
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: up.body.document.id } });
    expect(doc).toMatchObject({ caseId: c.id, requirementId: reqs[0].id, status: 'PENDING', uploadedById: client.user.id, stage: 'INITIAL' });
    expect((await prisma.caseUploadLink.findUniqueOrThrow({ where: { id: created.link.id } })).uploadCount).toBe(1);
    expect(await prisma.notification.count({ where: { userId: staff.user.id, type: 'DOCUMENT_UPLOAD_LINK', caseId: c.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'UPLOAD_LINK_FILE', target: `case:${c.id}` } })).toBe(1);

    // A requirement that is not on the link, a fake PDF and a disallowed type are refused (nothing stored).
    expectStatus(await anon().post(`/api/upload-links/${created.token}/files`).field('requirementId', reqs[2]?.id ?? 'other').attach('file', await makePdf('x'), { filename: 'x.pdf', ...PDF }), 400);
    expectStatus(await anon().post(`/api/upload-links/${created.token}/files`).field('requirementId', reqs[0].id).attach('file', Buffer.from('not a pdf'), { filename: 'x.pdf', ...PDF }), 400);
    expectStatus(await anon().post(`/api/upload-links/${created.token}/files`).field('requirementId', reqs[0].id).attach('file', Buffer.from('<html></html>'), { filename: 'x.html', contentType: 'text/html' }), 400);
    expect(await prisma.document.count({ where: { caseId: c.id } })).toBe(1);

    const list = expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}/upload-links`), 200).body.items;
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(created.token);
  });

  it('expired, revoked and unknown tokens are refused', async () => {
    const { staff, c, reqs } = await setup();
    const a = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/upload-links`).send({ requirementIds: [reqs[0].id], days: 3 }), 201).body;
    const b = expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/upload-links`).send({ requirementIds: [reqs[0].id] }), 201).body;

    await prisma.caseUploadLink.update({ where: { id: a.link.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(expectStatus(await anon().get(`/api/upload-links/${a.token}`), 410).body.error).toBe('UPLOAD_LINK_EXPIRED');
    expectStatus(await anon().post(`/api/upload-links/${a.token}/files`).field('requirementId', reqs[0].id).attach('file', await makePdf('x'), { filename: 'x.pdf', ...PDF }), 410);

    expectStatus(await staff.agent.post(`/api/admin/upload-links/${b.link.id}/revoke`).send({}), 200);
    expect(expectStatus(await anon().get(`/api/upload-links/${b.token}`), 410).body.error).toBe('UPLOAD_LINK_REVOKED');
    expectStatus(await anon().post(`/api/upload-links/${b.token}/files`).field('requirementId', reqs[0].id).attach('file', await makePdf('x'), { filename: 'x.pdf', ...PDF }), 410);
    expect(await prisma.auditLog.count({ where: { action: 'UPLOAD_LINK_REVOKED' } })).toBe(1);

    expectStatus(await anon().get(`/api/upload-links/${'A'.repeat(43)}`), 404);
    expectStatus(await anon().get('/api/upload-links/short'), 404);
    expect(await prisma.document.count({ where: { caseId: c.id } })).toBe(0);

    // A closed case: no new links.
    await prisma.case.update({ where: { id: c.id }, data: { status: 'CANCELLED' } });
    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/upload-links`).send({ requirementIds: [reqs[0].id] }), 409);
  });
});

describe('rule-change notices', () => {
  const body = { title: { az: 'Yeni maaş həddi', de: 'Neue Gehaltsgrenze' }, body: { az: 'Mavi Kart üçün maaş həddi dəyişir.', de: 'Die Gehaltsgrenze für die Blaue Karte ändert sich.' }, visaTypes: ['WORK'], effectiveDate: '2027-01-01', sourceUrl: 'https://www.make-it-in-germany.com/de/visum-aufenthalt/arten/blaue-karte-eu' };

  it('preview counts and publish notifies only clients with an active case of the visa type', async () => {
    const work = await asClient({ firstName: 'Work' });
    const study = await asClient({ firstName: 'Study' });
    const closed = await asClient({ firstName: 'Closed' });
    const quiet = await asClient({ firstName: 'Quiet' });
    const cw = await createCaseVia(work.agent);
    const cs = await createCaseVia(study.agent);
    const cc = await createCaseVia(closed.agent);
    const cq = await createCaseVia(quiet.agent);
    await prisma.case.update({ where: { id: cw.id }, data: { visaType: 'WORK' } });
    await prisma.case.update({ where: { id: cs.id }, data: { visaType: 'STUDY' } });
    await prisma.case.update({ where: { id: cc.id }, data: { visaType: 'WORK', status: 'CANCELLED' } });
    await prisma.case.update({ where: { id: cq.id }, data: { visaType: 'WORK' } });
    await prisma.user.update({ where: { id: quiet.user.id }, data: { emailNotifications: false, locale: 'de' } });
    const staff = await asStaff();
    const admin = await asAdmin();

    // Validation: Azerbaijani text is required, sources must be https.
    expectStatus(await staff.agent.post('/api/admin/rule-changes').send({ ...body, title: { de: 'Nur Deutsch' } }), 400);
    expectStatus(await staff.agent.post('/api/admin/rule-changes').send({ ...body, sourceUrl: 'http://example.org' }), 400);
    expect((await work.agent.post('/api/admin/rule-changes').send(body)).status).toBe(403);

    const draft = expectStatus(await staff.agent.post('/api/admin/rule-changes').send(body), 201).body.item;
    expect(draft.status).toBe('DRAFT');
    expect(expectStatus(await staff.agent.get('/api/admin/rule-changes/preview?visaTypes=WORK'), 200).body).toEqual({ count: 2, email: 1 });
    expect(expectStatus(await staff.agent.get('/api/admin/rule-changes/preview?visaTypes=WORK,STUDY'), 200).body.count).toBe(3);

    // Publishing is ADMIN+.
    expectStatus(await staff.agent.post(`/api/admin/rule-changes/${draft.id}/publish`).send({}), 403);
    const pub = expectStatus(await admin.agent.post(`/api/admin/rule-changes/${draft.id}/publish`).send({}), 200).body.item;
    expect(pub).toMatchObject({ status: 'PUBLISHED', recipientCount: 2, emailCount: 1 });
    expectStatus(await admin.agent.post(`/api/admin/rule-changes/${draft.id}/publish`).send({}), 409);
    expectStatus(await staff.agent.put(`/api/admin/rule-changes/${draft.id}`).send(body), 409);
    expect(await prisma.auditLog.count({ where: { action: 'RULE_CHANGE_PUBLISHED' } })).toBe(1);

    const notified = await prisma.notification.findMany({ where: { type: 'RULE_CHANGE' }, select: { userId: true, title: true } });
    expect(notified.map((n) => n.userId).sort()).toEqual([work.user.id, quiet.user.id].sort());
    expect(notified.find((n) => n.userId === work.user.id)!.title).toBe('Qayda dəyişikliyi: Yeni maaş həddi');
    expect(notified.find((n) => n.userId === quiet.user.id)!.title).toBe('Regeländerung: Neue Gehaltsgrenze');
    await emailsTo(work.user.email);
    expect(await prisma.emailLog.count({ where: { to: quiet.user.email, subject: { contains: 'Regeländerung' } } })).toBe(0);

    // Portal list.
    const mine = expectStatus(await work.agent.get('/api/account/rule-changes'), 200).body.items;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: 'Yeni maaş həddi', sourceUrl: body.sourceUrl, visaTypes: ['WORK'] });
    expect(expectStatus(await study.agent.get('/api/account/rule-changes'), 200).body.items).toHaveLength(0);
    expect(expectStatus(await closed.agent.get('/api/account/rule-changes'), 200).body.items).toHaveLength(0);
    expectStatus(await staff.agent.get('/api/account/rule-changes'), 403);

    // History.
    const hist = expectStatus(await staff.agent.get('/api/admin/rule-changes'), 200).body.items;
    expect(hist[0]).toMatchObject({ id: draft.id, status: 'PUBLISHED', recipientCount: 2 });
  });
});

describe('data-quality panel', () => {
  it('lists active cases worst first with issues; closed cases are left out; STAFF+ only', async () => {
    const a = await asClient();
    const b = await asClient();
    const ca = await createCaseVia(a.agent);
    const cb = await createCaseVia(b.agent);
    await prisma.user.update({ where: { id: b.user.id }, data: { phone: '+994501112233', birthDate: new Date('1990-01-01'), nationality: 'AZ', address: 'Bakı', passportNumber: 'C1', passportExpiry: new Date(Date.now() + 900 * DAY), education: 'Bachelor', germanLevel: 'B1' } });
    const closed = await asClient();
    const cc = await createCaseVia(closed.agent);
    await prisma.case.update({ where: { id: cc.id }, data: { status: 'APPROVED' } });
    const staff = await asStaff();

    expect((await a.agent.get('/api/admin/data-quality')).status).toBe(403);
    const r = expectStatus(await staff.agent.get('/api/admin/data-quality'), 200).body;
    const ids = r.items.map((i: { caseId: string }) => i.caseId);
    expect(ids).toContain(ca.id);
    expect(ids).toContain(cb.id);
    expect(ids).not.toContain(cc.id);
    const sa = r.items.find((i: { caseId: string }) => i.caseId === ca.id);
    const sb = r.items.find((i: { caseId: string }) => i.caseId === cb.id);
    expect(sa.score).toBeLessThan(sb.score);
    expect(ids.indexOf(ca.id)).toBeLessThan(ids.indexOf(cb.id));
    expect(sa.issues.map((i: { key: string }) => i.key)).toContain('PASSPORT_EXPIRY_MISSING');
    expect(sa.missingProfile).toContain('phone');
    expect(sb.missingProfile).not.toContain('phone');
    expect(sa.missingDocs).toBeGreaterThan(0);

    // Filters.
    await prisma.case.update({ where: { id: cb.id }, data: { assignedStaffId: staff.user.id, visaType: 'STUDY' } });
    expect(expectStatus(await staff.agent.get('/api/admin/data-quality?staff=me'), 200).body.items.map((i: { caseId: string }) => i.caseId)).toEqual([cb.id]);
    expect(expectStatus(await staff.agent.get('/api/admin/data-quality?visaType=STUDY'), 200).body.items.map((i: { caseId: string }) => i.caseId)).toEqual([cb.id]);
  });
});
