import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { emailsTo, prisma } from '../helpers/db';
import { leadToken } from '../../src/lib/toolLeads/tools.js';
import { purgeToolLeads, runToolFollowUps } from '../../src/lib/toolLeads/service.js';

/**
 * Conversion features of the public tools: "e-mail me my result" (lead + consent + double opt-in follow-up +
 * unsubscribe, lib/toolLeads) and the tool counters with the admin report (lib/toolAnalytics).
 */

const DAY = 24 * 60 * 60 * 1000;
const summary = [
  { label: 'Net per month', value: '2.345,67 €' },
  { label: 'Tax class', value: 'I' },
];
const post = (body: Record<string, unknown>) => anon().post('/api/tools/result-email').send({ tool: 'salary-calculator', lng: 'de', summary, ...body });

beforeEach(async () => {
  await prisma.analyticsDaily.deleteMany();
  await prisma.toolResultLead.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.inquiry.deleteMany();
});

describe('POST /api/tools/result-email', () => {
  it('stores a lead for the team, sends the result e-mail and counts it — without follow-up consent nothing else', async () => {
    const r = await post({ email: 'Visitor@Example.com', name: 'Aysel', phone: '+994 50 123 45 67', path: '/de/salary-calculator?gross=3000' });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ ok: true, followUp: false });
    const inquiry = await prisma.inquiry.findFirstOrThrow({ where: { email: 'visitor@example.com' } });
    expect(inquiry.source).toBe('tool:salary-calculator');
    expect(inquiry.message).toContain('Net per month: 2.345,67 €');
    expect(inquiry.locale).toBe('de');
    const lead = await prisma.toolResultLead.findFirstOrThrow();
    expect(lead).toMatchObject({ tool: 'salary-calculator', email: 'visitor@example.com', followUpConsent: false, inquiryId: inquiry.id });
    const mails = await emailsTo('visitor@example.com');
    expect(mails[0].subject).toContain('Ihr Ergebnis');
    expect(await prisma.consentRecord.count({ where: { type: 'MARKETING_EMAIL' } })).toBe(0);
    const counter = await prisma.analyticsDaily.findFirstOrThrow({ where: { metric: 'tool_lead' } });
    expect(counter).toMatchObject({ source: 'salary-calculator', count: 1 });
    // Shows in the staff list under the "tool" source filter.
    const admin = await asAdmin();
    const list = await admin.agent.get('/api/admin/inquiries?source=tool');
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).toContain('tool:salary-calculator');
  });

  it('appends a second result of the same address to the open lead', async () => {
    await post({ email: 'same@example.com' });
    await post({ email: 'same@example.com', tool: 'rent-check', summary: [{ label: 'Rent', value: '12 €/m²' }] });
    expect(await prisma.inquiry.count()).toBe(1);
    expect((await prisma.inquiry.findFirstOrThrow()).message).toContain('Rent: 12 €/m²');
    expect(await prisma.toolResultLead.count()).toBe(2);
  });

  it('needs the double opt-in before the follow-up, logs the consent and sends one follow-up after 3 days', async () => {
    const r = await post({ email: 'doi@example.com', followUp: true });
    expect(r.body.followUp).toBe(true);
    const lead = await prisma.toolResultLead.findFirstOrThrow();
    // Not confirmed: never sent.
    expect((await runToolFollowUps(new Date(Date.now() + 4 * DAY))).sent).toBe(0);
    const token = leadToken(lead.id);
    const c = await anon().post('/api/tools/result-email/confirm').send({ token });
    expect(c.status).toBe(200);
    expect(c.body.status).toBe('ok');
    expect(c.body.lead.email).not.toBe('doi@example.com'); // masked
    const consent = await prisma.consentRecord.findFirstOrThrow({ where: { email: 'doi@example.com', type: 'MARKETING_EMAIL' } });
    expect(consent).toMatchObject({ granted: true, source: 'TOOL_RESULT' });
    // Not due yet, then due once.
    expect((await runToolFollowUps(new Date(Date.now() + DAY))).sent).toBe(0);
    expect((await runToolFollowUps(new Date(Date.now() + 4 * DAY))).sent).toBe(1);
    expect((await runToolFollowUps(new Date(Date.now() + 5 * DAY))).sent).toBe(0);
    const mails = await emailsTo('doi@example.com', 2);
    expect(mails[1].subject).toContain('Wie können wir');
  });

  it('honours unsubscribe (page and RFC 8058 one-click) for every pending follow-up of the address', async () => {
    await post({ email: 'stop@example.com', followUp: true });
    await post({ email: 'stop@example.com', followUp: true, tool: 'budget', summary: [{ label: 'Budget', value: '1.200 €' }] });
    const [a, b] = await prisma.toolResultLead.findMany({ orderBy: { createdAt: 'asc' } });
    for (const l of [a, b]) await anon().post('/api/tools/result-email/confirm').send({ token: leadToken(l.id) });
    const one = await anon().post(`/api/tools/result-email/unsubscribe/${encodeURIComponent(leadToken(a.id))}`).type('form').send('List-Unsubscribe=One-Click');
    expect(one.status).toBe(200);
    expect(await prisma.toolResultLead.count({ where: { unsubscribedAt: null } })).toBe(0);
    expect((await runToolFollowUps(new Date(Date.now() + 4 * DAY))).sent).toBe(0);
    expect(await prisma.consentRecord.count({ where: { email: 'stop@example.com', granted: false } })).toBe(1);
    // A new result of that address does not ask again.
    const again = await post({ email: 'stop@example.com', followUp: true });
    expect(again.body.followUp).toBe(false);
    const page = await anon().post('/api/tools/result-email/unsubscribe').send({ token: leadToken(b.id) });
    expect(page.status).toBe(200);
    expect(page.body.lead.unsubscribed).toBe(true);
  });

  it('expires unconfirmed opt-ins and rejects forged tokens', async () => {
    await post({ email: 'late@example.com', followUp: true });
    const lead = await prisma.toolResultLead.findFirstOrThrow();
    await prisma.toolResultLead.update({ where: { id: lead.id }, data: { createdAt: new Date(Date.now() - 8 * DAY) } });
    const c = await anon().post('/api/tools/result-email/confirm').send({ token: leadToken(lead.id) });
    expect(c.body.status).toBe('expired');
    await purgeToolLeads();
    expect((await prisma.toolResultLead.findUniqueOrThrow({ where: { id: lead.id } })).followUpConsent).toBe(false);
    expect((await anon().post('/api/tools/result-email/confirm').send({ token: `${lead.id}.forgedsignature000000000000000000` })).status).toBe(404);
    expect((await anon().get('/api/tools/result-email/manage?token=abc.def')).status).toBe(404);
  });

  it('validates the input and fakes success for the honeypot', async () => {
    expect((await post({ email: 'not-an-email' })).status).toBe(400);
    expect((await post({ email: 'x@example.com', tool: 'admin' })).status).toBe(400);
    expect((await post({ email: 'x@example.com', summary: [{ label: 'Link', value: 'https://evil.example' }] })).status).toBe(400);
    expect((await post({ email: 'x@example.com', summary: [] })).status).toBe(400);
    const bot = await post({ email: 'bot@example.com', website: 'http://spam' });
    expect(bot.status).toBe(201);
    expect(await prisma.inquiry.count()).toBe(0);
    expect(await prisma.toolResultLead.count()).toBe(0);
  });
});

describe('tool analytics', () => {
  const beacon = (body: unknown, headers: Record<string, string> = {}) => {
    const r = anon().post('/api/tools/track').set('Content-Type', 'text/plain;charset=UTF-8');
    for (const [k, v] of Object.entries(headers)) r.set(k, v);
    return r.send(typeof body === 'string' ? body : JSON.stringify(body));
  };

  it('counts known tools per day and event, nothing per visitor', async () => {
    expect((await beacon({ t: 'salary-calculator', e: 'view' })).status).toBe(204);
    expect((await beacon({ t: 'salary-calculator', e: 'view' })).status).toBe(204);
    expect((await beacon({ t: 'salary-calculator', e: 'use' })).status).toBe(204);
    expect((await beacon({ t: 'work-scenes/truck-cab', e: 'embed_view' })).status).toBe(204);
    const rows = await prisma.analyticsDaily.findMany({ orderBy: [{ metric: 'asc' }, { source: 'asc' }] });
    expect(rows.map((r) => [r.metric, r.source, r.count])).toEqual([
      ['tool_embed_view', 'work-scenes/truck-cab', 1],
      ['tool_use', 'salary-calculator', 1],
      ['tool_view', 'salary-calculator', 2],
    ]);
  });

  it('rejects unknown tools / events and ignores DNT, GPC and bots', async () => {
    expect((await beacon({ t: 'admin', e: 'view' })).status).toBe(400);
    expect((await beacon({ t: 'salary-calculator', e: 'lead' })).status).toBe(400); // leads are counted by the server only
    expect((await beacon('nope')).status).toBe(400);
    await beacon({ t: 'salary-calculator', e: 'view' }, { DNT: '1' });
    await beacon({ t: 'salary-calculator', e: 'view' }, { 'Sec-GPC': '1' });
    await beacon({ t: 'salary-calculator', e: 'view' }, { 'User-Agent': 'Googlebot/2.1' });
    expect(await prisma.analyticsDaily.count()).toBe(0);
  });

  it('serves the per-tool report to staff only', async () => {
    await beacon({ t: 'salary-calculator', e: 'view' });
    await beacon({ t: 'salary-calculator', e: 'register' });
    expect((await anon().get('/api/admin/tool-analytics')).status).toBe(401);
    const client = await asClient();
    expect((await client.agent.get('/api/admin/tool-analytics')).status).toBe(403);
    const staff = await asStaff();
    const r = await staff.agent.get('/api/admin/tool-analytics?days=30');
    expect(r.status).toBe(200);
    expect(r.body.days).toBe(30);
    const row = r.body.items.find((i: { slug: string }) => i.slug === 'salary-calculator');
    expect(row).toMatchObject({ views: 1, registrations: 1, conversionRate: 100 });
    expect(r.body.items.some((i: { slug: string }) => i.slug === 'blue-card-check')).toBe(true);
    expect(JSON.stringify(r.body)).not.toMatch(/@|visitor/i);
    expect((await staff.agent.get('/api/admin/tool-analytics?days=45')).status).toBe(400);
  });
});
