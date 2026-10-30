import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';
import { runPermitReminders } from '../../src/lib/permits/service.js';
import { runPassportReminders } from '../../src/jobs/reminders.js';

const DAY = 24 * 60 * 60 * 1000;
const day = (d: Date) => d.toISOString().slice(0, 10);
/** A UTC midnight `days` from today. */
const inDays = (days: number) => {
  const d = new Date(Date.now() + days * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const before = (date: Date, days: number) => new Date(date.getTime() - days * DAY + 60 * 60 * 1000);

const worker = async (opts: { staffId?: string | null; locale?: 'az' | 'de' | 'en' | 'ru'; status?: 'APPROVED' | 'DOCUMENTS_PENDING' } = {}) => {
  const client = await asClient({ firstName: 'Kamran', lastName: 'Əliyev', locale: opts.locale ?? 'en' });
  const c = await prisma.case.create({
    data: { clientId: client.user.id, number: uniq('TV-P-'), profession: 'Pflegefachkraft', status: opts.status ?? 'APPROVED', assignedStaffId: opts.staffId ?? null, closedAt: new Date() },
  });
  return { client, c };
};
const notes = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

describe('permit expiry reminders', () => {
  it('Blue Card + insurance entered by staff: 90 / 60 / 30 days and expired, once each, client (in their language, e-mail) + assigned staff', async () => {
    const staff = await asStaff({ locale: 'de' });
    const { client, c } = await worker({ staffId: staff.user.id });
    const expires = inDays(100);
    expectStatus(await staff.agent.patch(`/api/admin/renewals/cases/${c.id}`).send({ residenceTitleExpiresAt: day(expires) }), 200);
    const set = expectStatus(await staff.agent.patch(`/api/admin/permits/cases/${c.id}`).send({ residenceTitleKind: 'EU_BLUE_CARD', healthInsuranceExpiresAt: day(inDays(400)) }), 200).body.permits;
    expect(set).toMatchObject({ active: true, residenceTitleKind: 'EU_BLUE_CARD' });
    expect(set.items.map((i: { item: string }) => i.item)).toEqual(['blueCard', 'insurance']);
    expect(set.items[0].nextReminderAt.slice(0, 10)).toBe(day(new Date(expires.getTime() - 90 * DAY)));
    expect((await staff.agent.patch(`/api/admin/permits/cases/${c.id}`).send({ residenceTitleKind: 'GREEN_CARD' })).status).toBe(400);
    expect((await staff.agent.patch(`/api/admin/permits/cases/${c.id}`).send({ healthInsuranceExpiresAt: '2027-02-30' })).status).toBe(400);
    expect(await prisma.auditLog.count({ where: { action: 'PERMIT_DATES_SET', target: `case:${c.id}` } })).toBe(1);

    expect(await runPermitReminders(before(expires, 95))).toBe(0); // before the widest window
    expect(await runPermitReminders(before(expires, 90))).toBe(1);
    expect(await runPermitReminders(before(expires, 89))).toBe(0); // same window: idempotent
    expect(await runPermitReminders(before(expires, 60))).toBe(1);
    expect(await runPermitReminders(before(expires, 30))).toBe(1);
    expect(await runPermitReminders(new Date(expires.getTime() + 2 * DAY))).toBe(1); // expired notice
    expect(await runPermitReminders(new Date(expires.getTime() + 3 * DAY))).toBe(0);

    const cn = await notes(client.user.id, 'PERMIT_EXPIRY');
    expect(cn.map((n) => n.title)).toEqual(['EU Blue Card: 90 days left', 'EU Blue Card: 60 days left', 'EU Blue Card: 30 days left', 'Expired: EU Blue Card']);
    expect(cn[0].body).toContain('Ausländerbehörde');
    expect(cn[0].caseId).toBe(c.id);
    await waitFor(async () => (await prisma.emailLog.count({ where: { to: client.user.email, subject: { contains: 'EU Blue Card' } } })) === 4);
    const sn = await notes(staff.user.id, 'PERMIT_EXPIRY_STAFF');
    expect(sn).toHaveLength(4);
    expect(sn[0].title).toBe('Kamran Əliyev: Blaue Karte EU läuft in 90 Tagen ab');
    expect(sn[0].link).toBe(`/admin/cases/${c.id}`);

    // The case card lists what was sent; a corrected date starts from scratch (only the narrowest window).
    const card = expectStatus(await staff.agent.get(`/api/admin/permits/cases/${c.id}`), 200).body.permits;
    expect(card.items.find((i: { item: string }) => i.item === 'blueCard').remindedWindows).toEqual([90, 60, 30, 0]);
    const later = inDays(20);
    expectStatus(await staff.agent.patch(`/api/admin/renewals/cases/${c.id}`).send({ residenceTitleExpiresAt: day(later) }), 200);
    expect(await runPermitReminders()).toBe(1);
    expect((await notes(client.user.id, 'PERMIT_EXPIRY')).at(-1)!.title).toBe('EU Blue Card: 20 days left');

    // Insurance has its own windows.
    const insurance = inDays(400);
    expect(await runPermitReminders(before(insurance, 30))).toBe(1);
    expect((await notes(client.user.id, 'PERMIT_EXPIRY')).at(-1)!.title).toBe('Health insurance: 30 days left');
  });

  it('passport after the visa: the permit job owns it (180 / 90 / 60 / 30), the old profile reminder stays quiet; nobody assigned → admins in-app', async () => {
    const admin = await asAdmin({ locale: 'en' });
    const { client, c } = await worker({ locale: 'az', staffId: null });
    const expiry = inDays(200);
    await prisma.user.update({ where: { id: client.user.id }, data: { passportExpiry: expiry } });

    const at = before(expiry, 150);
    await runPassportReminders(at);
    expect(await notes(client.user.id, 'PASSPORT_EXPIRY')).toHaveLength(0);
    expect(await runPermitReminders(at)).toBe(1);
    expect(await runPermitReminders(before(expiry, 90))).toBe(1);
    expect(await runPermitReminders(before(expiry, 60))).toBe(1);
    const cn = await notes(client.user.id, 'PERMIT_EXPIRY');
    expect(cn.map((n) => n.title)).toEqual(['Pasport: 150 gün qalıb', 'Pasport: 90 gün qalıb', 'Pasport: 60 gün qalıb']);
    expect(cn[0].link).toBe('/account/profile');
    const an = await notes(admin.user.id, 'PERMIT_EXPIRY_STAFF');
    expect(an).toHaveLength(3);
    expect(an[0].title).toBe('Kamran Əliyev: Passport expires in 150 days');
    expect(an[0].caseId).toBe(c.id);

    // A new open case (e.g. the renewal case): the passport goes back to the case reminders.
    await prisma.case.create({ data: { clientId: client.user.id, number: uniq('TV-P-'), profession: 'Pflegefachkraft', status: 'DOCUMENTS_PENDING' } });
    expect(await runPermitReminders(before(expiry, 30))).toBe(0);
  });

  it('only approved cases; a case replaced by an approved renewal is not reminded any more', async () => {
    const { c: open } = await worker({ status: 'DOCUMENTS_PENDING' });
    const expires = inDays(25);
    await prisma.case.update({ where: { id: open.id }, data: { residenceTitleExpiresAt: expires } });
    expect(await runPermitReminders()).toBe(0);

    const { client, c } = await worker();
    await prisma.case.update({ where: { id: c.id }, data: { residenceTitleExpiresAt: expires } });
    await prisma.case.create({ data: { clientId: client.user.id, number: uniq('TV-P-'), profession: 'Pflegefachkraft', status: 'APPROVED', renewalOfCaseId: c.id, residenceTitleExpiresAt: inDays(800) } });
    expect(await runPermitReminders()).toBe(0);
  });

  it('client portal: own dates with days left; staff cannot use it', async () => {
    const staff = await asStaff();
    const { client, c } = await worker();
    expect(expectStatus(await client.agent.get('/api/account/permits'), 200).body.items).toEqual([]);
    await prisma.case.update({ where: { id: c.id }, data: { residenceTitleExpiresAt: inDays(45), healthInsuranceExpiresAt: inDays(10) } });
    await prisma.user.update({ where: { id: client.user.id }, data: { passportExpiry: inDays(1000) } });
    const items = expectStatus(await client.agent.get('/api/account/permits'), 200).body.items;
    expect(items.map((i: { item: string; tone: string }) => [i.item, i.tone])).toEqual([
      ['insurance', 'urgent'],
      ['residence', 'soon'],
      ['passport', 'ok'],
    ]);
    expect(items[0]).toMatchObject({ case: { id: c.id }, daysLeft: expect.any(Number) });
    expect(items[0].remindedWindows).toBeUndefined();
    expect((await staff.agent.get('/api/account/permits')).status).toBe(403);
  });

  it('settings: ADMIN edits the windows (STAFF read-only); switched off sends nothing', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const defaults = expectStatus(await staff.agent.get('/api/admin/permits/settings'), 200).body.settings;
    expect(defaults.windows.passport).toEqual([180, 90, 60, 30]);
    const next = { ...defaults, windows: { ...defaults.windows, insurance: [14, 45] } };
    expect((await staff.agent.put('/api/admin/permits/settings').send({ settings: next })).status).toBe(403);
    expect((await admin.agent.put('/api/admin/permits/settings').send({ settings: { ...next, windows: { ...next.windows, residence: [0] } } })).status).toBe(400);
    expect(expectStatus(await admin.agent.put('/api/admin/permits/settings').send({ settings: next }), 200).body.settings.windows.insurance).toEqual([45, 14]);

    const { c } = await worker();
    const ends = inDays(50);
    await prisma.case.update({ where: { id: c.id }, data: { healthInsuranceExpiresAt: ends } });
    expect(await runPermitReminders(before(ends, 60))).toBe(0); // 60 is not an insurance window any more
    expect(await runPermitReminders(before(ends, 45))).toBe(1);

    expectStatus(await admin.agent.put('/api/admin/permits/settings').send({ settings: { ...next, enabled: false } }), 200);
    expect(await runPermitReminders(before(ends, 14))).toBe(0);
    expect(expectStatus(await admin.agent.post('/api/admin/permits/run'), 200).body).toEqual({ sent: 0 });
  });
});
