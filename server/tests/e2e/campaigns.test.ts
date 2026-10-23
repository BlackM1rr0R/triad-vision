import { beforeEach, describe, expect, it } from 'vitest';
import type { Locale } from '@prisma/client';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { createUser } from '../helpers/factories';
import { prisma } from '../helpers/db';
import { campaignTick, startCampaign, testOutbox } from '../../src/lib/campaigns/engine.js';
import { pickLocale, campaignContent, bodyToHtml, isAllowedUrl } from '../../src/lib/campaigns/content.js';

const content = (over: Partial<Record<Locale, { subject?: string; body?: string; sms?: string }>> = {}) => ({
  az: { subject: 'Salam {{firstName}}', body: 'Hörmətli {{firstName}}, **yenilik** var: https://triad-vision.de/jobs', sms: 'Salam {{firstName}}' },
  de: { subject: 'Hallo {{firstName}}', body: 'Guten Tag {{firstName}}', sms: '' },
  en: { subject: '', body: '', sms: '' },
  ru: { subject: '', body: '', sms: '' },
  ...over,
});

const ALL_CLIENTS = { op: 'AND', groups: [{ op: 'AND', conditions: [{ field: 'role', values: ['CLIENT'] }] }] };

const makeSegment = async (admin: Agent, definition: unknown = ALL_CLIENTS) => {
  const res = await admin.post('/api/admin/campaigns/segments').send({ name: 'Seg', definition });
  expect(res.status).toBe(201);
  return res.body.item.id as string;
};

const makeCampaign = async (admin: Agent, body: Record<string, unknown> = {}) => {
  const segmentId = (body.segmentId as string | undefined) ?? (await makeSegment(admin));
  const res = await admin.post('/api/admin/campaigns').send({ name: 'Autumn news', kind: 'SERVICE', channels: ['EMAIL'], content: content(), ...body, segmentId });
  expect(res.status).toBe(201);
  return res.body.item.id as string;
};

const scheduleNow = async (admin: Agent, id: string) => {
  const res = await admin.post(`/api/admin/campaigns/${id}/schedule`).send({});
  expect(res.status).toBe(200);
  return res.body;
};

const recipients = (campaignId: string) => prisma.campaignRecipient.findMany({ where: { campaignId }, include: { user: { select: { email: true } } }, orderBy: { createdAt: 'asc' } });

const later = (ms: number) => new Date(Date.now() + ms);

beforeEach(async () => {
  testOutbox.length = 0;
  await prisma.campaignRecipient.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.campaignSegment.deleteMany();
});

describe('authorization', () => {
  it('is for ADMIN and SUPER_ADMIN only', async () => {
    const staff = await asStaff();
    const client = await asClient();
    expect((await staff.agent.get('/api/admin/campaigns')).status).toBe(403);
    expect((await staff.agent.post('/api/admin/campaigns/segments/preview').send({ definition: ALL_CLIENTS })).status).toBe(403);
    expect((await client.agent.get('/api/admin/campaigns')).status).toBe(403);
    expect((await anon().get('/api/admin/campaigns')).status).toBe(401);
    const admin = await asAdmin();
    expect((await admin.agent.get('/api/admin/campaigns')).status).toBe(200);
    const sup = await asSuperAdmin();
    expect((await sup.agent.get('/api/admin/campaigns/segments')).status).toBe(200);
  });

  it('audits writes', async () => {
    const admin = await asAdmin();
    const id = await makeCampaign(admin.agent);
    const actions = (await prisma.auditLog.findMany({ where: { actorId: admin.user.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['CAMPAIGN_SEGMENT_CREATED', 'CAMPAIGN_CREATED']));
    await scheduleNow(admin.agent, id);
    expect(await prisma.auditLog.count({ where: { action: 'CAMPAIGN_SCHEDULED', target: `campaign:${id}` } })).toBe(1);
  });
});

describe('segments', () => {
  it('evaluates AND/OR groups over cases, locale, role and consent; never includes staff', async () => {
    const admin = await asAdmin();
    await asStaff();
    const a = await createUser({ role: 'CLIENT', locale: 'de', firstName: 'A' });
    const b = await createUser({ role: 'CLIENT', locale: 'ru', firstName: 'B' });
    const c = await createUser({ role: 'CLIENT', locale: 'az', firstName: 'C' });
    const company = await prisma.company.create({ data: { name: 'Spedition GmbH', status: 'ACTIVE' } });
    const emp = await createUser({ role: 'COMPANY', firstName: 'Emp' });
    await prisma.user.update({ where: { id: emp.user.id }, data: { companyId: company.id } });
    await prisma.case.create({ data: { number: 'TV-T-1', clientId: a.user.id, profession: 'Driver', status: 'DOCUMENTS_PENDING', visaType: 'WORK' } });
    await prisma.case.create({ data: { number: 'TV-T-2', clientId: b.user.id, profession: 'Nurse', status: 'APPROVED', visaType: 'AUSBILDUNG', closedAt: new Date() } });
    await prisma.user.update({ where: { id: c.user.id }, data: { marketingOptIn: true, city: 'Gəncə' } });
    await prisma.invoice.create({
      data: { number: 'TV-RE-T-1', companyId: company.id, issueDate: new Date(), dueDate: new Date(), items: [], netCents: 100, vatCents: 19, grossCents: 119, status: 'OVERDUE' },
    });

    const preview = async (definition: unknown) => {
      const res = await admin.agent.post('/api/admin/campaigns/segments/preview').send({ definition });
      expect(res.status).toBe(200);
      return res.body as { count: number; sample: { id: string; email: string }[]; marketingOptedIn: number };
    };

    // Empty definition = all active candidates and employer users (no staff, no admins).
    expect((await preview({ op: 'AND', groups: [] })).count).toBe(4);
    expect((await preview({ groups: [{ conditions: [{ field: 'caseStatus', values: ['DOCUMENTS_PENDING'] }] }] })).sample.map((s) => s.id)).toEqual([a.user.id]);
    expect((await preview({ groups: [{ conditions: [{ field: 'caseState', value: 'NONE' }, { field: 'role', values: ['CLIENT'] }] }] })).sample.map((s) => s.id)).toEqual([c.user.id]);
    expect((await preview({ groups: [{ conditions: [{ field: 'caseState', value: 'CLOSED' }] }] })).count).toBe(1);
    // OR inside a group
    const or = await preview({ groups: [{ op: 'OR', conditions: [{ field: 'locale', values: ['de'] }, { field: 'visaType', values: ['AUSBILDUNG'] }] }] });
    expect(or.sample.map((s) => s.id).sort()).toEqual([a.user.id, b.user.id].sort());
    // OR between groups
    const groupsOr = await preview({ op: 'OR', groups: [{ conditions: [{ field: 'city', values: ['Gəncə'] }] }, { conditions: [{ field: 'unpaidInvoice' }] }] });
    expect(groupsOr.sample.map((s) => s.id).sort()).toEqual([c.user.id, emp.user.id].sort());
    // AND between groups
    expect((await preview({ op: 'AND', groups: [{ conditions: [{ field: 'role', values: ['CLIENT'] }] }, { conditions: [{ field: 'marketingOptIn', value: true }] }] })).count).toBe(1);
    expect((await preview({ groups: [{ conditions: [{ field: 'company', values: [company.id] }] }] })).sample.map((s) => s.id)).toEqual([emp.user.id]);
    expect((await preview({ groups: [] })).marketingOptedIn).toBe(1);
    // Invalid definitions are rejected
    expect((await admin.agent.post('/api/admin/campaigns/segments/preview').send({ definition: { groups: [{ conditions: [{ field: 'sql', value: '1=1' }] }] } })).status).toBe(400);
  });

  it('saves, lists, updates and deletes segments', async () => {
    const admin = await asAdmin();
    const id = await makeSegment(admin.agent);
    expect((await admin.agent.get('/api/admin/campaigns/segments')).body.items).toHaveLength(1);
    expect((await admin.agent.patch(`/api/admin/campaigns/segments/${id}`).send({ name: 'Renamed' })).body.item.name).toBe('Renamed');
    expect((await admin.agent.get(`/api/admin/campaigns/segments/${id}`)).body.preview.count).toBe(0);
    expect((await admin.agent.delete(`/api/admin/campaigns/segments/${id}`)).status).toBe(200);
  });
});

describe('content', () => {
  it('picks the language: recipient locale → az → en', () => {
    const c = campaignContent.parse({ de: { subject: 'S', body: 'B' }, en: { subject: 'S', body: 'B' } });
    expect(pickLocale(c, 'de', 'EMAIL')).toBe('de');
    expect(pickLocale(c, 'ru', 'EMAIL')).toBe('en'); // no az → en
    const withAz = campaignContent.parse({ az: { subject: 'S', body: 'B' }, en: { subject: 'S', body: 'B' } });
    expect(pickLocale(withAz, 'ru', 'EMAIL')).toBe('az');
    expect(pickLocale(campaignContent.parse({}), 'az', 'EMAIL')).toBeNull();
    // SMS needs the SMS text or a body
    expect(pickLocale(campaignContent.parse({ de: { sms: 'x' } }), 'az', 'SMS')).toBe('de');
  });

  it('renders formatting safely and checks the link allow-list', () => {
    const html = bodyToHtml('**Hi** <script>x</script>\n\n- one\n- [two](https://triad-vision.de/a)');
    expect(html).toContain('<strong>Hi</strong>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<li><a href="https://triad-vision.de/a"');
    expect(isAllowedUrl('https://triad-vision.de/jobs')).toBe(true);
    expect(isAllowedUrl('https://www.triad-vision.de/x')).toBe(true);
    expect(isAllowedUrl('https://triad-vision.de.evil.com/x')).toBe(false);
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedUrl('https://user:pw@triad-vision.de/')).toBe(false);
  });

  it('queues each recipient in their language with placeholders filled', async () => {
    const admin = await asAdmin();
    await createUser({ role: 'CLIENT', locale: 'de', firstName: 'Hans' });
    await createUser({ role: 'CLIENT', locale: 'ru', firstName: 'Ivan' });
    const id = await makeCampaign(admin.agent);
    await scheduleNow(admin.agent, id);
    const rows = await recipients(id);
    expect(rows.map((r) => r.locale).sort()).toEqual(['az', 'de']); // ru has no text → az
    await campaignTick({ burst: true });
    const subjects = testOutbox.map((m) => m.subject).sort();
    expect(subjects).toEqual(['Hallo Hans', 'Salam Ivan']);
  });

  it('preview renders sample values and reports links outside the allow-list', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.post('/api/admin/campaigns/preview').send({ kind: 'MARKETING', locale: 'az', content: content({ az: { subject: 'Salam {{firstName}}', body: 'Bax: https://evil.example/x və {{caseNumber}}', sms: '' } }) });
    expect(res.status).toBe(200);
    expect(res.body.email.subject).toBe('Salam Əli');
    expect(res.body.email.html).toContain('TV-2026-0042');
    expect(res.body.email.html).not.toContain('href="https://evil.example');
    expect(res.body.rejectedLinks).toEqual(['https://evil.example/x']);
    expect(res.body.sms).toContain('STOP');
  });

  it('sends a test to the admin only', async () => {
    const admin = await asAdmin();
    await createUser({ role: 'CLIENT' });
    const id = await makeCampaign(admin.agent, { channels: ['EMAIL', 'IN_APP'] });
    const res = await admin.agent.post(`/api/admin/campaigns/${id}/test`).send({ locale: 'de' });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual({ EMAIL: 'CONSOLE', IN_APP: 'SENT' });
    const log = await prisma.emailLog.findMany();
    expect(log.map((l) => l.to)).toEqual([admin.user.email]);
    expect(log[0]!.subject).toMatch(/^\[TEST\] Hallo/);
    expect(await prisma.campaignRecipient.count()).toBe(0);
  });
});

describe('compliance', () => {
  it('marketing goes only to recipients with an explicit opt-in (set in the profile, logged)', async () => {
    const admin = await asAdmin();
    const yes = await asClient();
    const no = await asClient();
    expect((await yes.agent.patch('/api/auth/me').send({ marketingOptIn: true })).body.user.marketingOptIn).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: yes.user.id } });
    expect(u.marketingOptInSource).toBe('PROFILE');
    expect(u.marketingOptInAt).toBeInstanceOf(Date);
    expect(await prisma.consentRecord.count({ where: { userId: yes.user.id, type: 'MARKETING_EMAIL', granted: true } })).toBe(1);

    const id = await makeCampaign(admin.agent, { kind: 'MARKETING' });
    await scheduleNow(admin.agent, id);
    const rows = await recipients(id);
    expect(rows.find((r) => r.userId === yes.user.id)?.status).toBe('QUEUED');
    expect(rows.find((r) => r.userId === no.user.id)).toMatchObject({ status: 'SKIPPED', skipReason: 'NO_MARKETING_CONSENT' });
    await campaignTick({ burst: true });
    expect(testOutbox.map((m) => m.to)).toEqual([yes.user.email]);
  });

  it('registration has an optional opt-in, unchecked by default', async () => {
    const base = { password: 'Password123', firstName: 'Reg', lastName: 'User', phone: '+994501112233', birthDate: '1990-01-01', passportNumber: 'C1234567' };
    const off = await anon().post('/api/auth/register').send({ ...base, email: 'reg-off@test.local' });
    expect(off.status).toBe(201);
    expect(off.body.user.marketingOptIn).toBe(false);
    const on = await anon().post('/api/auth/register').send({ ...base, email: 'reg-on@test.local', passportNumber: 'C7654321', phone: '+994501112234', marketingOptIn: true });
    expect(on.status).toBe(201);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: 'reg-on@test.local' } });
    expect(u).toMatchObject({ marketingOptIn: true, marketingOptInSource: 'REGISTER' });
  });

  it('service campaigns respect the e-mail notification preference', async () => {
    const admin = await asAdmin();
    const off = await createUser({ role: 'CLIENT' });
    await prisma.user.update({ where: { id: off.user.id }, data: { emailNotifications: false } });
    const id = await makeCampaign(admin.agent);
    await scheduleNow(admin.agent, id);
    expect((await recipients(id))[0]).toMatchObject({ status: 'SKIPPED', skipReason: 'EMAIL_OPTED_OUT' });
  });

  it('every e-mail has List-Unsubscribe headers, a footer with company info and a working one-click unsubscribe', async () => {
    await prisma.setting.create({ data: { key: 'legal', value: { companyName: 'Triad Vision', legalForm: 'GmbH', street: 'Musterstr. 1', postalCode: '10115', city: 'Berlin', country: 'Deutschland' } } });
    const admin = await asAdmin();
    const client = await createUser({ role: 'CLIENT' });
    await prisma.user.update({ where: { id: client.user.id }, data: { marketingOptIn: true } });
    const id = await makeCampaign(admin.agent, { kind: 'MARKETING' });
    const other = await makeCampaign(admin.agent, { kind: 'MARKETING', name: 'Second' });
    await scheduleNow(admin.agent, id);
    await scheduleNow(admin.agent, other);
    await prisma.campaign.update({ where: { id: other }, data: { status: 'PAUSED' } });
    await campaignTick({ burst: true });

    expect(testOutbox).toHaveLength(1);
    const mail = testOutbox[0]!;
    const r = (await recipients(id))[0]!;
    expect(mail.headers['List-Unsubscribe']).toBe(`<http://localhost:5173/api/unsubscribe/${r.token}>`);
    expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(mail.html).toContain(`/unsubscribe?token=${r.token}`);
    expect(mail.html).toContain('Triad Vision GmbH · Musterstr. 1, 10115 Berlin, Deutschland');
    expect(mail.text).toContain('Musterstr. 1');

    // Page data, then the RFC 8058 POST a mail client sends (form-encoded, no cookie, no Origin).
    const info = await anon().get(`/api/unsubscribe/${r.token}`);
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ kind: 'MARKETING', marketingOptIn: true });
    expect(info.body.email).not.toBe(client.user.email);
    const post = await anon().post(`/api/unsubscribe/${r.token}`).type('form').send('List-Unsubscribe=One-Click');
    expect(post.status).toBe(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } });
    expect(u).toMatchObject({ marketingOptIn: false, marketingOptInSource: 'UNSUBSCRIBE' });
    expect(u.emailNotifications).toBe(true); // marketing only
    expect(await prisma.consentRecord.count({ where: { userId: client.user.id, type: 'MARKETING_EMAIL', granted: false, source: 'UNSUBSCRIBE' } })).toBe(1);
    expect((await recipients(id))[0]!.unsubscribedAt).toBeInstanceOf(Date);
    expect(await prisma.auditLog.count({ where: { action: 'CAMPAIGN_UNSUBSCRIBE' } })).toBe(1);

    // Honoured immediately: the second campaign's queued mail is skipped at send time.
    await prisma.campaign.update({ where: { id: other }, data: { status: 'SENDING' } });
    await campaignTick({ burst: true, now: later(61_000) });
    expect(testOutbox).toHaveLength(1);
    expect((await recipients(other))[0]).toMatchObject({ status: 'SKIPPED', skipReason: 'UNSUBSCRIBED' });

    expect((await anon().get('/api/unsubscribe/not-a-real-token-123456')).status).toBe(404);
  });

  it('marketing SMS carries the STOP opt-out; no SMS during quiet hours (21:00–09:00 Baku)', async () => {
    const admin = await asAdmin();
    const client = await createUser({ role: 'CLIENT', phone: '+994501234567' });
    await prisma.user.update({ where: { id: client.user.id }, data: { marketingOptIn: true } });
    const id = await makeCampaign(admin.agent, { kind: 'MARKETING', channels: ['SMS'] });
    await scheduleNow(admin.agent, id);
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const at = (utcHour: number) => new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), utcHour, 0, 0));
    await campaignTick({ burst: true, now: at(18) }); // 22:00 Baku
    expect((await recipients(id))[0]!.status).toBe('QUEUED');
    await campaignTick({ burst: true, now: at(6) }); // 10:00 Baku
    const r = (await recipients(id))[0]!;
    expect(r.status).toBe('SENT');
    const sms = await prisma.outboundMessage.findFirstOrThrow({ where: { userId: client.user.id } });
    expect(sms.body).toContain('Salam Test');
    expect(sms.body).toContain(`STOP): http://localhost:5173/unsubscribe?token=${r.token}`);
  });
});

describe('sending engine', () => {
  it('throttles e-mails per minute over a sliding window', async () => {
    const admin = await asAdmin();
    for (let i = 0; i < 5; i++) await createUser({ role: 'CLIENT' });
    const id = await makeCampaign(admin.agent, { emailsPerMinute: 2 });
    await scheduleNow(admin.agent, id);
    const t0 = later(1000);
    await campaignTick({ burst: true, now: t0 });
    expect(testOutbox).toHaveLength(2);
    await campaignTick({ burst: true, now: new Date(t0.getTime() + 30_000) });
    expect(testOutbox).toHaveLength(2); // still inside the same minute
    await campaignTick({ burst: true, now: new Date(t0.getTime() + 61_000) });
    expect(testOutbox).toHaveLength(4);
    await campaignTick({ burst: true, now: new Date(t0.getTime() + 122_000) });
    expect(testOutbox).toHaveLength(5);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id } })).status).toBe('COMPLETED');
    // Without burst the scheduled job spreads the budget: at most ceil(30 * 10 s / 60 s) = 5 per tick.
  });

  it('is idempotent: never sends twice to the same recipient and channel', async () => {
    const admin = await asAdmin();
    for (let i = 0; i < 3; i++) await createUser({ role: 'CLIENT' });
    const id = await makeCampaign(admin.agent, { channels: ['EMAIL', 'IN_APP'] });
    await scheduleNow(admin.agent, id);
    expect((await admin.agent.post(`/api/admin/campaigns/${id}/schedule`).send({})).status).toBe(409);
    expect(await startCampaign(id)).toBe(0);
    expect(await prisma.campaignRecipient.count({ where: { campaignId: id } })).toBe(6);
    await Promise.all([campaignTick({ burst: true }), campaignTick({ burst: true })]);
    await campaignTick({ burst: true, now: later(120_000) });
    expect(testOutbox).toHaveLength(3);
    expect(new Set(testOutbox.map((m) => m.to)).size).toBe(3);
    expect(await prisma.notification.count({ where: { type: 'CAMPAIGN' } })).toBe(3);
    // A second row for the same person and channel is impossible.
    const r = (await recipients(id))[0]!;
    await expect(prisma.campaignRecipient.create({ data: { campaignId: id, userId: r.userId, channel: r.channel, locale: 'az', token: 'dup-token-1234567890' } })).rejects.toThrow();
  });

  it('pause stops sending, resume continues, cancel skips the rest', async () => {
    const admin = await asAdmin();
    for (let i = 0; i < 4; i++) await createUser({ role: 'CLIENT' });
    const id = await makeCampaign(admin.agent, { emailsPerMinute: 1 });
    await scheduleNow(admin.agent, id);
    expect((await admin.agent.post(`/api/admin/campaigns/${id}/pause`)).status).toBe(200);
    await campaignTick({ burst: true });
    expect(testOutbox).toHaveLength(0);
    expect((await admin.agent.post(`/api/admin/campaigns/${id}/resume`)).status).toBe(200);
    await campaignTick({ burst: true });
    expect(testOutbox).toHaveLength(1);
    expect((await admin.agent.post(`/api/admin/campaigns/${id}/cancel`)).status).toBe(200);
    await campaignTick({ burst: true, now: later(120_000) });
    expect(testOutbox).toHaveLength(1);
    const rows = await recipients(id);
    expect(rows.filter((r) => r.status === 'SKIPPED' && r.skipReason === 'CANCELLED')).toHaveLength(3);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id } })).status).toBe('CANCELLED');
    expect((await admin.agent.post(`/api/admin/campaigns/${id}/resume`)).status).toBe(409);
    expect((await admin.agent.patch(`/api/admin/campaigns/${id}`).send({ name: 'x' })).status).toBe(409);
  });

  it('starts a scheduled campaign at its time', async () => {
    const admin = await asAdmin();
    await createUser({ role: 'CLIENT' });
    const id = await makeCampaign(admin.agent);
    const sendAt = later(3600_000);
    const res = await admin.agent.post(`/api/admin/campaigns/${id}/schedule`).send({ sendAt: sendAt.toISOString() });
    expect(res.body.queued).toBe(0);
    await campaignTick({ burst: true });
    expect(testOutbox).toHaveLength(0);
    await campaignTick({ burst: true, now: new Date(sendAt.getTime() + 1000) });
    expect(testOutbox).toHaveLength(1);
  });

  it('marks a stuck SENDING row FAILED instead of sending it again', async () => {
    const admin = await asAdmin();
    await createUser({ role: 'CLIENT' });
    const id = await makeCampaign(admin.agent);
    await scheduleNow(admin.agent, id);
    await prisma.campaignRecipient.updateMany({ where: { campaignId: id }, data: { status: 'SENDING', lastAttemptAt: new Date(Date.now() - 20 * 60_000) } });
    await campaignTick({ burst: true });
    expect(testOutbox).toHaveLength(0);
    expect((await recipients(id))[0]).toMatchObject({ status: 'FAILED', error: 'INTERRUPTED' });
  });
});

describe('tracking', () => {
  const sendOne = async (body: Record<string, unknown> = {}) => {
    const admin = await asAdmin();
    await createUser({ role: 'CLIENT' });
    const id = await makeCampaign(admin.agent, body);
    await scheduleNow(admin.agent, id);
    await campaignTick({ burst: true });
    return { admin, id, r: (await recipients(id))[0]! };
  };

  it('rejects links outside the allow-list when scheduling', async () => {
    const admin = await asAdmin();
    const id = await makeCampaign(admin.agent, { content: content({ az: { subject: 'S', body: 'Go [here](https://evil.example/phish)', sms: '' } }) });
    const res = await admin.agent.post(`/api/admin/campaigns/${id}/schedule`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('LINK_NOT_ALLOWED');
  });

  it('tracks clicks through /c/:token with allow-listed destinations only (no open redirect)', async () => {
    const { admin, id, r } = await sendOne();
    expect(testOutbox[0]!.html).toContain(`/api/c/${r.token}/0`);
    expect(testOutbox[0]!.html).not.toContain('href="https://triad-vision.de/jobs"');
    const click = await anon().get(`/api/c/${r.token}/0`);
    expect(click.status).toBe(302);
    expect(click.headers.location).toBe('https://triad-vision.de/jobs');
    // Unknown link index, unknown token, or a destination in the query: always our home page.
    expect((await anon().get(`/api/c/${r.token}/7`)).headers.location).toBe('http://localhost:5173');
    expect((await anon().get('/api/c/forged-token-abcdefghij/0?url=https://evil.example')).headers.location).toBe('http://localhost:5173');
    const after = (await recipients(id))[0]!;
    expect(after.clicks).toBe(1);
    expect(after.clickedAt).toBeInstanceOf(Date);
    expect(after.openedAt).toBeInstanceOf(Date);
    const stats = (await admin.agent.get(`/api/admin/campaigns/${id}`)).body.item.stats;
    expect(stats).toMatchObject({ sent: 1, delivered: 1, clicked: 1, opened: 1 });
  });

  it('serves the open pixel from our domain and records the first open', async () => {
    const { id, r } = await sendOne();
    expect(testOutbox[0]!.html).toContain(`http://localhost:5173/api/o/${r.token}.gif`);
    const res = await anon().get(`/api/o/${r.token}.gif`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/gif');
    expect(res.headers['cache-control']).toContain('no-store');
    const first = (await recipients(id))[0]!.openedAt;
    expect(first).toBeInstanceOf(Date);
    await anon().get(`/api/o/${r.token}.gif`);
    expect((await recipients(id))[0]!.openedAt).toEqual(first);
    // Unknown tokens still get the image.
    expect((await anon().get('/api/o/whatever.gif')).status).toBe(200);
  });

  it('counts in-app reads and lists / exports recipients', async () => {
    const { admin, id, r } = await sendOne({ channels: ['IN_APP'] });
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: r.userId, type: 'CAMPAIGN' } });
    await prisma.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
    const list = await admin.agent.get('/api/admin/campaigns');
    expect(list.body.items[0].stats).toMatchObject({ sent: 1, inAppRead: 1 });
    const rec = await admin.agent.get(`/api/admin/campaigns/${id}/recipients?channel=IN_APP`);
    expect(rec.body.total).toBe(1);
    expect(rec.body.items[0].readAt).toBeTruthy();
    const csv = await admin.agent.get(`/api/admin/campaigns/${id}/recipients.csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('IN_APP');
    expect(csv.text.split('\n')[0]).toContain('firstName,lastName,email');
  });
});
