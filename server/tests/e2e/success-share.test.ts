import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { CaseStatus } from '@prisma/client';
import { anon, asClient, ORIGIN, type Actor } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { successShareHead } from '../../src/lib/successShare/service.js';

const makeCase = async (client: Actor, status: CaseStatus = 'APPROVED') => {
  const company = await prisma.company.create({ data: { name: `Firma ${uniq('c')}`, city: 'Hamburg, Altona' } });
  return prisma.case.create({
    data: { clientId: client.user.id, number: `TV-2026-${uniq('n')}`, profession: 'LKW-Fahrer', visaType: 'WORK', status, decisionAt: new Date(), companyId: company.id },
  });
};

const pngOf = async (url: string) => {
  const res = await anon().get(url).buffer(true).parse((r, cb) => {
    const chunks: Buffer[] = [];
    r.on('data', (c: Buffer) => chunks.push(c));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  return res;
};

const share = (client: Actor, body: Record<string, unknown>) => client.agent.post('/api/account/success-share').send(body);

describe('visa approved share cards', () => {
  it('needs explicit consent; nothing is public before', async () => {
    const client = await asClient({ firstName: 'Aynur', lastName: 'Qasımova' });
    const c = await makeCase(client);
    expect((await share(client, { caseId: c.id })).status).toBe(400);
    expect((await share(client, { caseId: c.id, consent: false })).status).toBe(400);
    expect(await prisma.setting.count({ where: { key: { startsWith: 'successShare:' } } })).toBe(0);

    const list = await client.agent.get('/api/account/success-share');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ caseId: c.id, share: null, visaLine: 'İş vizası' });
  });

  it('public page shows only the first name / initials, the visa and the city — never the surname', async () => {
    const client = await asClient({ firstName: 'Aynur', lastName: 'Qasımova', locale: 'de' });
    const c = await makeCase(client);
    const res = await share(client, { caseId: c.id, consent: true });
    expect(res.status).toBe(201);
    const { token } = res.body.share;
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(res.body.share).toMatchObject({ nameStyle: 'first', allowIndexing: false, showReferral: true, locale: 'de' });

    const pub = await anon().get(`/api/success/${token}`);
    expect(pub.status).toBe(200);
    expect(pub.headers['x-robots-tag']).toBe('noindex');
    expect(pub.body).toMatchObject({ displayName: 'Aynur', visaLine: 'Arbeitsvisum', city: 'Hamburg', destination: 'Hamburg, Deutschland', allowIndexing: false });
    expect(pub.body.referralCode).toMatch(/^TV[A-Z0-9]{6}$/); // referral programme on by default
    const raw = JSON.stringify(pub.body);
    expect(raw).not.toContain('Qasımova');
    expect(raw).not.toContain(client.user.id);
    expect(raw).not.toContain(c.id);
    expect(raw).not.toContain(client.user.email);

    // Initials instead of the first name, referral off.
    const again = await share(client, { caseId: c.id, consent: true, nameStyle: 'initials', showReferral: false });
    expect(again.body.share.token).toBe(token); // same link, new options
    const pub2 = await anon().get(`/api/success/${token}`);
    expect(pub2.body.displayName).toBe('A. Q.');
    expect(pub2.body.referralCode).toBeNull();
    expect(JSON.stringify(pub2.body)).not.toContain('Qasımova');

    // Head of the page: noindex by default, the card as og:image, no surname.
    const head = await successShareHead(`/de/success/${token}`);
    expect(head).toContain('noindex, nofollow');
    expect(head).toContain(`/api/success/${token}/card-post.png`);
    expect(head).not.toContain('Qasımova');
  });

  it('indexing only when the client opted in', async () => {
    const client = await asClient({ firstName: 'Rauf', lastName: 'Məmmədov' });
    const c = await makeCase(client);
    const { token } = (await share(client, { caseId: c.id, consent: true, allowIndexing: true })).body.share;
    const pub = await anon().get(`/api/success/${token}`);
    expect(pub.headers['x-robots-tag']).toBeUndefined();
    const head = await successShareHead(`/success/${token}`);
    expect(head).toContain('index, follow');
    expect(head).toContain('rel="canonical"');
  });

  it('renders post (1080×1350) and story (1080×1920) PNGs', async () => {
    const client = await asClient({ firstName: 'Leyla', lastName: 'Həsənova' });
    const c = await makeCase(client);
    const { token, cards } = (await share(client, { caseId: c.id, consent: true })).body.share;
    const post = await pngOf(cards.post);
    expect(post.status).toBe(200);
    expect(post.headers['content-type']).toContain('image/png');
    expect(await sharp(post.body as Buffer).metadata()).toMatchObject({ width: 1080, height: 1350, format: 'png' });
    const story = await pngOf(cards.story);
    expect(await sharp(story.body as Buffer).metadata()).toMatchObject({ width: 1080, height: 1920 });
    const dl = await anon().get(`/api/success/${token}/card-post.png?download=1`);
    expect(dl.headers['content-disposition']).toContain('attachment');
    expect((await anon().get(`/api/success/${token}/card-huge.png`)).status).toBe(404);
  });

  it('revoke → page, images and lead form answer 404; only the owner can revoke', async () => {
    const client = await asClient({ firstName: 'Kamran', lastName: 'Əliyev' });
    const other = await asClient();
    const c = await makeCase(client);
    const { token } = (await share(client, { caseId: c.id, consent: true })).body.share;

    expect((await other.agent.delete(`/api/account/success-share/${token}`)).status).toBe(404);
    expect((await anon().get(`/api/success/${token}`)).status).toBe(200);

    expect((await client.agent.delete(`/api/account/success-share/${token}`)).status).toBe(200);
    expect((await anon().get(`/api/success/${token}`)).status).toBe(404);
    expect((await anon().get(`/api/success/${token}/card-post.png`)).status).toBe(404);
    expect((await anon().post(`/api/success/${token}/lead`).set('Origin', ORIGIN).send({ name: 'Vüsal', email: 'v@test.local', consent: true })).status).toBe(404);
    expect(await successShareHead(`/success/${token}`)).toContain('noindex');
    expect((await client.agent.get('/api/account/success-share')).body.items[0].share).toBeNull();
  });

  it('only approved own cases can be shared; a reopened case takes the page down', async () => {
    const client = await asClient();
    const other = await asClient();
    const pending = await makeCase(client, 'DECISION_PENDING');
    expect((await share(client, { caseId: pending.id, consent: true })).status).toBe(409);
    const c = await makeCase(client);
    expect((await share(other, { caseId: c.id, consent: true })).status).toBe(404);
    const { token } = (await share(client, { caseId: c.id, consent: true })).body.share;
    await prisma.case.update({ where: { id: c.id }, data: { status: 'EMBASSY_REVIEW' } });
    expect((await anon().get(`/api/success/${token}`)).status).toBe(404);
  });

  it('"Start your journey" creates a scored inquiry with source success-share:<token>', async () => {
    const client = await asClient({ firstName: 'Nigar', lastName: 'Quliyeva' });
    const c = await makeCase(client);
    const { token } = (await share(client, { caseId: c.id, consent: true })).body.share;
    const lead = (body: Record<string, unknown>) => anon().post(`/api/success/${token}/lead`).set('Origin', ORIGIN).send(body);
    expect((await lead({ name: 'Elvin', consent: true })).status).toBe(400); // no way to reach the person
    expect((await lead({ name: 'Elvin', email: 'elvin@test.local' })).status).toBe(400); // no consent
    const ok = await lead({ name: 'Elvin', email: 'elvin@test.local', phone: '+994 50 123 45 67', consent: true, locale: 'tr' });
    expect(ok.status).toBe(201);
    const inq = await prisma.inquiry.findFirstOrThrow({ where: { email: 'elvin@test.local' } });
    expect(inq.source).toBe(`success-share:${token}`);
    expect(inq.locale).toBe('az'); // Turkish → Azerbaijani team
    expect(inq.scoredAt).not.toBeNull();
    expect((await client.agent.get('/api/account/success-share')).body.items[0].share.leads).toBe(1);
  });
});
