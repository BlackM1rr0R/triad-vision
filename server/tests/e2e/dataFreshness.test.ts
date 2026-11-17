import { describe, expect, it } from 'vitest';
import { asAdmin, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { FRESHNESS_ITEMS } from '../../src/lib/dataFreshness/registry.js';
import { runFreshnessReminders } from '../../src/lib/dataFreshness/service.js';

/**
 * Data freshness (/api/admin/data-freshness, ADMIN+): registry list with status, "mark reviewed" (reviewer + note,
 * next due date moves on), review history and the reminder job (once per item, kind and due date).
 */
describe('data freshness admin', () => {
  it('is ADMIN+ only', async () => {
    const staff = await asStaff();
    await staff.agent.get('/api/admin/data-freshness').expect(403);
  });

  it('lists every registry item with a due date and status, and marks one reviewed', async () => {
    await prisma.dataFreshnessReview.deleteMany({ where: { itemId: 'glossary' } });
    const admin = await asAdmin();
    const list = await admin.agent.get('/api/admin/data-freshness').expect(200);
    expect(list.body.items).toHaveLength(FRESHNESS_ITEMS.length);
    const before = list.body.items.find((i: { id: string }) => i.id === 'glossary');
    expect(before).toMatchObject({ due: '2027-01-01', reviews: 0, lastReview: null });
    expect(['ok', 'dueSoon', 'overdue']).toContain(before.status);
    expect(before.fileUrls[0]).toMatch(/^https:\/\/github\.com\/.+server\/src\/lib\/glossary\/types\.ts$/);

    const r = await admin.agent.post('/api/admin/data-freshness/glossary/review').send({ note: 'Links checked' }).expect(200);
    expect(r.body.settledDue).toBe('2027-01-01');
    expect(r.body.nextDue > '2027-01-01').toBe(true);

    const after = (await admin.agent.get('/api/admin/data-freshness').expect(200)).body.items.find((i: { id: string }) => i.id === 'glossary');
    expect(after).toMatchObject({ reviews: 1, lastReview: { note: 'Links checked' } });
    expect(after.lastReview.by).toBeTruthy();
    const hist = await admin.agent.get('/api/admin/data-freshness/glossary/reviews').expect(200);
    expect(hist.body.reviews[0]).toMatchObject({ note: 'Links checked', settledDue: '2027-01-01' });

    await admin.agent.post('/api/admin/data-freshness/nope/review').send({}).expect(404);
  });

  it('reminds admins 30 days before the due date once per item and due date', async () => {
    const admin = await asAdmin();
    await prisma.reminderLog.deleteMany({ where: { key: { startsWith: 'data-freshness:' } } });
    await prisma.dataFreshnessReview.deleteMany({});
    const day = new Date('2026-12-10T08:00:00Z'); // 22 days before 1 January 2027
    const n = await runFreshnessReminders(day);
    expect(n).toBeGreaterThan(0);
    const notes = await prisma.notification.findMany({ where: { userId: admin.user.id, type: 'DATA_FRESHNESS' } });
    expect(notes).toHaveLength(1);
    expect(notes[0].link).toBe('/admin/data-freshness');
    expect(await runFreshnessReminders(day)).toBe(0);
    expect(await prisma.reminderLog.count({ where: { key: 'data-freshness:soon:kindergeld:2027-01-01' } })).toBe(1);
    // on the due date: a second ("due") reminder
    expect(await runFreshnessReminders(new Date('2027-01-02T08:00:00Z'))).toBeGreaterThan(0);
    expect(await prisma.reminderLog.count({ where: { key: 'data-freshness:due:kindergeld:2027-01-01' } })).toBe(1);
  });
});
