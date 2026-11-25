import { describe, expect, it } from 'vitest';
import { asAdmin, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient } from '../helpers/factories';
import { reminderKey, reportWeek, weekKpis } from '../../src/lib/weeklyReport/kpis.js';
import { runWeeklyReport } from '../../src/lib/weeklyReport/service.js';
import { registeredJobs } from '../../src/lib/scheduler.js';
import '../../src/jobs/weeklyReport.js';

// Weekly management PDF: Monday 07:00 Berlin, once per ISO week (ReminderLog claim), SUPER_ADMIN only.

const MONDAY_8 = new Date('2026-11-23T07:00:00Z'); // 08:00 Berlin

describe('weekly report', () => {
  it('is registered, counts the week, and sends once per week', async () => {
    expect(registeredJobs()).toContain('weekly-report');
    await asSuperAdmin();
    const week = reportWeek(MONDAY_8);
    const inside = new Date(week.start.getTime() + 36 * 60 * 60 * 1000);
    const c = await createClient();
    await prisma.user.update({ where: { id: c.user.id }, data: { createdAt: inside } });
    const kpis = await weekKpis(week);
    expect(kpis.registrations).toBeGreaterThanOrEqual(1);

    const notDue = await runWeeklyReport(new Date('2026-11-24T08:00:00Z')); // Tuesday
    expect(notDue.reason).toBe('NOT_DUE');

    const first = await runWeeklyReport(MONDAY_8);
    expect(first.reason).toBe('OK');
    expect(first.sent).toBeGreaterThanOrEqual(1);
    expect(await prisma.reminderLog.count({ where: { key: reminderKey(week.key) } })).toBe(1);
    const again = await runWeeklyReport(new Date(MONDAY_8.getTime() + 60 * 60 * 1000));
    expect(again.reason).toBe('ALREADY_SENT');
  });

  it('preview and send-now are SUPER_ADMIN only', async () => {
    const admin = await asAdmin();
    const sup = await asSuperAdmin();
    expect((await admin.agent.get('/api/admin/reports/weekly/preview.pdf')).status).toBe(403);
    expect((await admin.agent.post('/api/admin/reports/weekly/send-now')).status).toBe(403);
    const pdf = await sup.agent.get('/api/admin/reports/weekly/preview.pdf').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (d: Buffer) => chunks.push(d));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect((await sup.agent.post('/api/admin/reports/weekly/send-now')).status).toBe(200);
  });
});
