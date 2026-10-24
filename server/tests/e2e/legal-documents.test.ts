import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { lineDiff, LEGACY_POLICY_VERSION } from '../../src/lib/legal/documents.js';

const L = (s: string) => ({ az: `${s} az`, de: `${s} de`, en: `${s} en`, ru: `${s} ru` });
const REGISTER = { password: 'Password123', firstName: 'Aylin', lastName: 'Məmmədova', phone: '+994501234567', birthDate: '1995-03-02', passportNumber: 'C01234567' };

/** Creates, fills and publishes a version through the admin API. */
const publish = async (admin: Awaited<ReturnType<typeof asAdmin>>, kind: 'TERMS' | 'PRIVACY' | 'COOKIES', over: Record<string, unknown> = {}) => {
  const draft = expectStatus(await admin.agent.post('/api/admin/legal').send({ kind }), 201).body.item;
  expectStatus(await admin.agent.put(`/api/admin/legal/${draft.id}`).send({ body: L(`${kind} text ${over.version ?? draft.version}`), ...over }), 200);
  return expectStatus(await admin.agent.post(`/api/admin/legal/${draft.id}/publish`), 200).body.item;
};

describe('legal documents — versioning and publishing', () => {
  it('serves the built-in fallback until a version is published, then the published one', async () => {
    const before = expectStatus(await anon().get('/api/legal/terms'), 200).body;
    expect(before.fallback).toBe(true);
    expect(before.document.version).toBe(LEGACY_POLICY_VERSION);
    expect(before.document.body.de).toContain('Geltungsbereich');

    const admin = await asAdmin();
    const doc = await publish(admin, 'TERMS', { version: 'agb-1', changeSummary: L('first') });
    const after = expectStatus(await anon().get('/api/legal/TERMS'), 200).body;
    expect(after.fallback).toBe(false);
    expect(after.document).toMatchObject({ id: doc.id, version: 'agb-1', status: 'PUBLISHED' });
    expect(after.document.effectiveAt).toBeTruthy();
    expectStatus(await anon().get('/api/legal/unknown'), 400);
  });

  it('copies the current version into a new draft, archives the previous one on publish and keeps the archive readable', async () => {
    const admin = await asAdmin();
    const v1 = await publish(admin, 'PRIVACY', { version: 'p-1' });
    const draft = expectStatus(await admin.agent.post('/api/admin/legal').send({ kind: 'PRIVACY', version: 'p-2' }), 201).body.item;
    expect(draft.status).toBe('DRAFT');
    expect(draft.body.de).toBe('PRIVACY text p-1 de'); // copied from the current version
    expectStatus(await admin.agent.post('/api/admin/legal').send({ kind: 'PRIVACY', version: 'p-2' }), 409); // label taken

    expectStatus(await admin.agent.put(`/api/admin/legal/${draft.id}`).send({ body: { ...L('x'), de: 'PRIVACY text p-1 de\nNeuer Absatz' } }), 200);
    const diff = expectStatus(await admin.agent.get(`/api/admin/legal/${draft.id}/diff?lang=de`), 200).body;
    expect(diff.previous.version).toBe('p-1');
    expect(diff.lines).toEqual([
      { op: 'same', text: 'PRIVACY text p-1 de' },
      { op: 'add', text: 'Neuer Absatz' },
    ]);

    expectStatus(await admin.agent.post(`/api/admin/legal/${draft.id}/publish`), 200);
    const rows = await prisma.legalDocument.findMany({ where: { kind: 'PRIVACY' }, orderBy: { version: 'asc' } });
    expect(rows.map((r) => [r.version, r.status])).toEqual([
      ['p-1', 'ARCHIVED'],
      ['p-2', 'PUBLISHED'],
    ]);
    // Published versions are read-only; drafts only can be deleted.
    expectStatus(await admin.agent.put(`/api/admin/legal/${draft.id}`).send({ requiresReacceptance: true }), 409);
    expectStatus(await admin.agent.delete(`/api/admin/legal/${v1.id}`), 409);
    expectStatus(await admin.agent.post(`/api/admin/legal/${draft.id}/publish`), 409);

    const archive = expectStatus(await anon().get('/api/legal/privacy/versions'), 200).body.items;
    expect(archive.map((a: { version: string }) => a.version)).toEqual(['p-2', 'p-1']);
    expect(expectStatus(await anon().get('/api/legal/privacy/versions/p-1'), 200).body.document.status).toBe('ARCHIVED');
    expectStatus(await anon().get('/api/legal/privacy/versions/nope'), 404);
  });

  it('refuses to publish without the binding German text and is ADMIN only', async () => {
    const admin = await asAdmin();
    const draft = expectStatus(await admin.agent.post('/api/admin/legal').send({ kind: 'COOKIES' }), 201).body.item;
    expectStatus(await admin.agent.put(`/api/admin/legal/${draft.id}`).send({ body: { az: 'x', de: '  ', en: 'x', ru: 'x' } }), 200);
    expect(expectStatus(await admin.agent.post(`/api/admin/legal/${draft.id}/publish`), 400).body.error).toBe('LEGAL_GERMAN_TEXT_REQUIRED');
    const staff = await asStaff();
    expectStatus(await staff.agent.get('/api/admin/legal'), 403);
    const list = expectStatus(await admin.agent.get('/api/admin/legal'), 200).body.kinds;
    expect(list.map((k: { kind: string }) => k.kind)).toEqual(['TERMS', 'PRIVACY', 'COOKIES']);
    expect(list[2].versions).toHaveLength(1);
    expectStatus(await admin.agent.delete(`/api/admin/legal/${draft.id}`), 200);
  });

  it('computes a line diff (unit)', () => {
    expect(lineDiff('a\nb\nc', 'a\nc\nd')).toEqual([
      { op: 'same', text: 'a' },
      { op: 'del', text: 'b' },
      { op: 'same', text: 'c' },
      { op: 'add', text: 'd' },
    ]);
    expect(lineDiff('', 'x')).toEqual([{ op: 'add', text: 'x' }]);
  });
});

describe('registration consents', () => {
  it('records TERMS and PRIVACY_POLICY with the current versions and document ids', async () => {
    const admin = await asAdmin();
    const terms = await publish(admin, 'TERMS', { version: 't-7' });
    const res = expectStatus(await anon().post('/api/auth/register').send({ ...REGISTER, email: 'agb@test.local', acceptTerms: true }), 201);
    const rows = await prisma.consentRecord.findMany({ where: { userId: res.body.user.id }, orderBy: { type: 'asc' } });
    expect(rows.map((r) => [r.type, r.granted, r.source, r.version, r.legalDocumentId])).toEqual([
      ['PRIVACY_POLICY', true, 'REGISTER', LEGACY_POLICY_VERSION, null], // no privacy version published: legacy label
      ['TERMS', true, 'REGISTER', 't-7', terms.id],
    ]);
  });

  it('rejects an explicit "no" to the AGB and keeps old clients (no field) working without a TERMS row', async () => {
    expect(expectStatus(await anon().post('/api/auth/register').send({ ...REGISTER, email: 'no@test.local', acceptTerms: false }), 400).body.error).toBe('TERMS_REQUIRED');
    const res = expectStatus(await anon().post('/api/auth/register').send({ ...REGISTER, email: 'old@test.local' }), 201);
    expect(await prisma.consentRecord.findMany({ where: { userId: res.body.user.id }, select: { type: true } })).toEqual([{ type: 'PRIVACY_POLICY' }]);
  });
});

describe('re-acceptance', () => {
  it('lists a version flagged "requires re-acceptance" until the user accepts it; staff are not blocked', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    // Accepted the first version at sign-up (by version label, as old rows have no document id).
    await prisma.consentRecord.create({ data: { userId: client.user.id, type: 'TERMS', granted: true, version: 'r-1', source: 'REGISTER' } });
    await publish(admin, 'TERMS', { version: 'r-1' });
    expect(expectStatus(await client.agent.get('/api/legal/me/pending'), 200).body).toEqual({ pending: [], blocking: false });

    // A new version without the flag never blocks.
    await publish(admin, 'TERMS', { version: 'r-2' });
    expect(expectStatus(await client.agent.get('/api/legal/me/pending'), 200).body.pending).toEqual([]);

    const r3 = await publish(admin, 'TERMS', { version: 'r-3', requiresReacceptance: true, changeSummary: L('Neue Preise') });
    const pending = expectStatus(await client.agent.get('/api/legal/me/pending'), 200).body;
    expect(pending.blocking).toBe(true);
    expect(pending.pending).toEqual([expect.objectContaining({ kind: 'TERMS', id: r3.id, version: 'r-3', changeSummary: L('Neue Preise') })]);

    const staff = await asStaff();
    const staffPending = expectStatus(await staff.agent.get('/api/legal/me/pending'), 200).body;
    expect(staffPending.pending).toHaveLength(1);
    expect(staffPending.blocking).toBe(false);

    const accepted = expectStatus(await client.agent.post('/api/legal/me/accept').send({ ids: [r3.id] }), 200).body;
    expect(accepted).toMatchObject({ accepted: [{ kind: 'TERMS', version: 'r-3' }], pending: [], blocking: false });
    const row = await prisma.consentRecord.findFirstOrThrow({ where: { userId: client.user.id, source: 'REACCEPT' } });
    expect(row).toMatchObject({ type: 'TERMS', granted: true, version: 'r-3', legalDocumentId: r3.id });
    // The privacy centre shows the accepted version.
    const state = expectStatus(await client.agent.get('/api/privacy'), 200).body;
    expect(state.legal.find((l: { kind: string }) => l.kind === 'TERMS')).toMatchObject({ current: { version: 'r-3' }, accepted: { version: 'r-3' } });
    expectStatus(await anon().get('/api/legal/me/pending'), 401);
  });
});

describe('cookie consent', () => {
  it('logs the banner choice per category for an anonymous visitor, with the cookie policy version', async () => {
    expectStatus(await anon().post('/api/legal/cookie-consent').send({ analytics: true, marketing: false }), 400); // no visitor id
    expectStatus(await anon().post('/api/legal/cookie-consent').send({ analytics: true, marketing: false, visitorId: 'bad id!' }), 400);
    const res = expectStatus(await anon().post('/api/legal/cookie-consent').send({ analytics: true, marketing: false, visitorId: 'v_abc12345' }), 201);
    expect(res.body.version).toBe('1');
    const rows = await prisma.consentRecord.findMany({ where: { visitorId: 'v_abc12345' }, orderBy: { type: 'asc' } });
    expect(rows.map((r) => [r.type, r.granted, r.source, r.version, r.userId])).toEqual([
      ['COOKIES', true, 'COOKIE_BANNER', '1', null],
      ['COOKIES_ANALYTICS', true, 'COOKIE_BANNER', '1', null],
      ['COOKIES_MARKETING', false, 'COOKIE_BANNER', '1', null],
    ]);
  });

  it('uses the account for signed-in users and the published COOKIES version; admins see the person timeline and exports', async () => {
    const admin = await asAdmin();
    const cookies = await publish(admin, 'COOKIES', { version: 'c-2' });
    const client = await asClient();
    expectStatus(await client.agent.post('/api/legal/cookie-consent').send({ analytics: false, marketing: false, visitorId: 'ignored123', source: 'COOKIE_SETTINGS' }), 201);
    const rows = await prisma.consentRecord.findMany({ where: { userId: client.user.id } });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.visitorId === null && r.version === 'c-2' && r.legalDocumentId === cookies.id && r.source === 'COOKIE_SETTINGS' && !r.granted)).toBe(true);

    const filtered = expectStatus(await admin.agent.get(`/api/admin/privacy/consents?type=COOKIES&version=c-2&source=COOKIE_SETTINGS`), 200).body;
    expect(filtered.total).toBe(1);
    expect(filtered.documents[cookies.id]).toMatchObject({ kind: 'COOKIES', version: 'c-2' });
    expect(filtered.versions).toContain('c-2');

    const timeline = expectStatus(await admin.agent.get(`/api/admin/privacy/consents/person?userId=${client.user.id}`), 200).body;
    expect(timeline.user.id).toBe(client.user.id);
    expect(timeline.items).toHaveLength(3);
    expect(timeline.current.COOKIES_ANALYTICS).toMatchObject({ granted: false, version: 'c-2' });

    const json = await admin.agent.get('/api/admin/privacy/consents?format=download&type=COOKIES');
    expect(json.status).toBe(200);
    expect(json.headers['content-disposition']).toContain('.json');
    const csv = await admin.agent.get('/api/admin/privacy/consents?format=csv');
    expect(csv.text.split('\r\n')[0]).toContain('legalDocumentId');

    // The user's own DSGVO export names the accepted version.
    const exp = await client.agent.get('/api/privacy/export');
    const data = JSON.parse(exp.text);
    expect(data.consents.find((c: { type: string }) => c.type === 'COOKIES').legalDocument).toMatchObject({ kind: 'COOKIES', version: 'c-2' });
  });
});
