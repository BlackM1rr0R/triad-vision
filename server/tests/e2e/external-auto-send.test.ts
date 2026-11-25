import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { applyInput, createExternalApplication } from '../../src/lib/germanyJobs/apply.js';
import { processExternalApplication, recheckUserApplications, remindClientSend, runExternalAutoSend } from '../../src/lib/germanyJobs/autoSend.js';
import { getAutoSendSettings } from '../../src/lib/germanyJobs/autoSettings.js';
import { runEmployerDiscovery } from '../../src/lib/germanyJobs/discovery/index.js';

/**
 * "Apply via Triad Vision" for external listings is retired (owner decision: the candidate applies to the employer
 * directly). Earlier applications stay as history, but nothing processes them any more: no check, no Anschreiben,
 * no employer e-mail discovery, no sending, no client reminder; staff "send now" / "resume" / employer address answer
 * 410; the settings keep `enabled` and `discovery` off. The page fetcher below fails the test if it is ever called.
 */

const EMPLOYER = 'bewerbung@nord-logistik.de';

const fields = (o: Record<string, string> = {}) => ({
  provider: 'link',
  listingUrl: 'https://karriere.nord-logistik.de/jobs/berufskraftfahrer-ce',
  listingTitle: 'Berufskraftfahrer CE (m/w/d)',
  listingCompany: 'Nord Logistik GmbH',
  listingLocation: 'Hamburg',
  jobType: 'job',
  name: 'Əli Məmmədov',
  email: 'ali@example.com',
  phone: '050 123 45 67',
  germanLevel: 'B1',
  profession: 'Kraftfahrer',
  experienceYears: '6',
  message: `Aus der Anzeige: Bewerbungen bitte an ${EMPLOYER}`,
  consent: 'true',
  forwardConsent: 'true',
  lng: 'az',
  ...o,
});

/** An earlier application left in an open automation state (history row). */
const seedOpen = async (userId: string | null, data: Record<string, unknown>) => {
  const q = await createExternalApplication(applyInput.parse(fields()), { phone: '+994501234567', lng: 'az', cv: null, userId, partnerId: null, accountLabel: null });
  const app = await prisma.externalJobApplication.update({ where: { inquiryId: q.id }, data: { forwardConsentAt: new Date(), ...data } });
  return { inquiryId: q.id, id: app.id };
};

const snapshot = (id: string) =>
  prisma.externalJobApplication.findUniqueOrThrow({
    where: { id },
    select: { status: true, autoState: true, autoReason: true, autoSentAt: true, autoCheckedAt: true, employerEmail: true, discoveryState: true, coverLetterBody: true, clientRemindedAt: true },
  });

describe('external apply retired: no automatic processing', () => {
  it('scheduler, discovery, re-checks and reminders leave earlier applications untouched and send nothing', async () => {
    const client = await asClient({ email: 'ali@example.com' });
    const day = 24 * 60 * 60 * 1000;
    const rows = [
      await seedOpen(client.user.id, { autoState: 'QUEUED', employerEmail: EMPLOYER, autoNextAt: new Date(Date.now() - day) }),
      await seedOpen(client.user.id, { autoState: 'SEARCHING' }),
      await seedOpen(client.user.id, { autoState: 'NEEDS_DATA' }),
      await seedOpen(client.user.id, { autoState: 'CLIENT_SEND', clientSendAt: new Date(Date.now() - 5 * day) }),
      await seedOpen(null, { autoState: null }),
    ];
    const before = await Promise.all(rows.map((r) => snapshot(r.id)));
    const mailsBefore = await prisma.emailLog.count();

    expect(await runExternalAutoSend(new Date(Date.now() + 2 * day))).toEqual({ sent: 0, rechecked: 0, stuck: 0, reminded: 0 });
    expect(await remindClientSend(new Date(Date.now() + 10 * day))).toBe(0);
    const fetchPage = async (url: string) => {
      throw new Error(`discovery must not fetch ${url}`);
    };
    expect(await runEmployerDiscovery({ fetchPage })).toMatchObject({ checked: 0, found: 0 });
    for (const r of rows) expect(await processExternalApplication(r.id)).toBeNull();
    await recheckUserApplications(client.user.id);

    expect(await Promise.all(rows.map((r) => snapshot(r.id)))).toEqual(before);
    expect(await prisma.emailLog.count()).toBe(mailsBefore);
    expect(await prisma.emailLog.count({ where: { to: EMPLOYER } })).toBe(0);
  });

  it('staff overrides that would send or search answer 410; settings stay off; the record stays readable', async () => {
    const client = await asClient({ email: 'ali@example.com' });
    const r = await seedOpen(client.user.id, { autoState: 'READY', employerEmail: EMPLOYER });
    const staff = await asStaff();
    const base = `/api/admin/external-applications/${r.inquiryId}`;
    for (const [method, path, body] of [
      ['post', '/auto/send', {}],
      ['post', '/auto/resume', {}],
      ['put', '/auto/employer-email', { email: 'jobs@nord-logistik.de' }],
    ] as const) {
      const res = await staff.agent[method](`${base}${path}`).send(body);
      expect(res.status).toBe(410);
      expect(res.body.error).toBe('EXTERNAL_APPLY_DIRECT');
    }
    expect(await prisma.emailLog.count({ where: { to: EMPLOYER } })).toBe(0);

    const view = await staff.agent.get(base).expect(200);
    expect(view.body).toMatchObject({ inquiryId: r.inquiryId, status: 'SUBMITTED' });
    expect(view.body.auto.employerEmail).toBe(EMPLOYER);
    // "Sent outside the system" stays a manual record.
    await staff.agent.post(`${base}/auto/mark-sent`).send({}).expect(200);
    expect((await snapshot(r.id)).status).toBe('FORWARDED');

    const admin = await asAdmin();
    const put = await admin.agent.put('/api/admin/external-applications/auto/settings').send({ enabled: true, discovery: true, dailyLimit: 5 }).expect(200);
    expect(put.body.settings).toMatchObject({ enabled: false, discovery: false, dailyLimit: 5 });
    expect(await getAutoSendSettings()).toMatchObject({ enabled: false, discovery: false });
  });
});
