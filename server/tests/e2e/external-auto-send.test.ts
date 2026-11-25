import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { applyInput, createExternalApplication } from '../../src/lib/germanyJobs/apply.js';
import { getAutoSendSettings } from '../../src/lib/germanyJobs/autoSettings.js';

/**
 * "Apply via Triad Vision" for external listings is retired (owner decision: the candidate applies to the employer
 * directly). Earlier applications stay as history; the automatic pipeline (check, Anschreiben, employer e-mail
 * discovery, sending, client reminders) was removed from the code (lib/germanyJobs/autoSend.ts). Staff "send now" /
 * "resume" / employer address answer 410; the settings keep `enabled` and `discovery` off.
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
