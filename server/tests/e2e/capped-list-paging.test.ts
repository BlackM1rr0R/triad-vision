import { describe, expect, it } from 'vitest';
import { asAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';

// Staff lists that used to stop at a fixed cap (500 quotes, 500 privacy requests, 300 campaigns) are paged:
// ?page=&pageSize= in, { total, page, pageSize, pages } out, filters applied before paging.

const DAY = 24 * 60 * 60 * 1000;
const at = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 60_000);

describe('GET /api/admin/quotes — paging', () => {
  it('pages newest first with totals for the filter, never repeating a row', async () => {
    const admin = await asAdmin();
    const a = await prisma.company.create({ data: { name: 'Alpha GmbH', status: 'ACTIVE' } });
    const b = await prisma.company.create({ data: { name: 'Beta GmbH', status: 'ACTIVE' } });
    for (let i = 0; i < 7; i++) {
      await prisma.quote.create({
        data: { companyId: i < 5 ? a.id : b.id, title: `Q${i}`, items: [], validUntil: new Date(Date.now() + 30 * DAY), status: i % 2 ? 'SENT' : 'DRAFT', createdAt: at(i) },
      });
    }
    const p1 = expectStatus(await admin.agent.get('/api/admin/quotes').query({ pageSize: 3 }), 200).body;
    expect(p1).toMatchObject({ total: 7, page: 1, pageSize: 3, pages: 3 });
    expect(p1.quotes.map((q: { title: string }) => q.title)).toEqual(['Q6', 'Q5', 'Q4']);
    // Status counts in the totals cover everything, not just the page.
    expect(p1.totals.byStatus).toMatchObject({ DRAFT: 4, SENT: 3 });
    const p3 = expectStatus(await admin.agent.get('/api/admin/quotes').query({ pageSize: 3, page: 3 }), 200).body;
    expect(p3.quotes.map((q: { title: string }) => q.title)).toEqual(['Q0']);
    const p4 = expectStatus(await admin.agent.get('/api/admin/quotes').query({ pageSize: 3, page: 4 }), 200).body;
    expect(p4.quotes).toEqual([]);

    // Filters narrow the total.
    const filtered = expectStatus(await admin.agent.get('/api/admin/quotes').query({ companyId: a.id, status: 'DRAFT', pageSize: 2 }), 200).body;
    expect(filtered).toMatchObject({ total: 3, pages: 2 });
    expect(filtered.quotes.map((q: { title: string }) => q.title)).toEqual(['Q4', 'Q2']);

    // Default page size 50; bad values are refused.
    expect(expectStatus(await admin.agent.get('/api/admin/quotes'), 200).body).toMatchObject({ total: 7, page: 1, pageSize: 50, pages: 1 });
    expectStatus(await admin.agent.get('/api/admin/quotes').query({ pageSize: 500 }), 400);
    expectStatus(await admin.agent.get('/api/admin/quotes').query({ page: 0 }), 400);
  });
});

describe('GET /api/admin/privacy/requests — paging', () => {
  it('keeps "open first by deadline, then closed newest first" across pages', async () => {
    const admin = await asAdmin();
    const now = Date.now();
    const mk = (email: string, status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED', dueInDays: number, createdMinute: number) =>
      prisma.privacyRequest.create({ data: { email, type: 'EXPORT', status, dueAt: new Date(now + dueInDays * DAY), createdAt: at(createdMinute) } });
    await mk('open-late@test.local', 'OPEN', 20, 1);
    await mk('open-soon@test.local', 'IN_PROGRESS', 2, 2);
    await mk('open-mid@test.local', 'OPEN', 10, 3);
    await mk('closed-old@test.local', 'COMPLETED', -40, 4);
    await mk('closed-new@test.local', 'REJECTED', -30, 5);

    const all: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = expectStatus(await admin.agent.get('/api/admin/privacy/requests').query({ page, pageSize: 2 }), 200).body;
      expect(res).toMatchObject({ total: 5, page, pageSize: 2, pages: 3 });
      all.push(...res.items.map((r: { email: string }) => r.email));
      // Counts are global, not per page.
      expect(res.counts.byStatus).toMatchObject({ OPEN: 2, IN_PROGRESS: 1, COMPLETED: 1, REJECTED: 1 });
    }
    expect(all).toEqual(['open-soon@test.local', 'open-mid@test.local', 'open-late@test.local', 'closed-new@test.local', 'closed-old@test.local']);

    const closed = expectStatus(await admin.agent.get('/api/admin/privacy/requests').query({ status: 'COMPLETED' }), 200).body;
    expect(closed).toMatchObject({ total: 1, pages: 1 });
    expect(closed.items.map((r: { email: string }) => r.email)).toEqual(['closed-old@test.local']);
    const search = expectStatus(await admin.agent.get('/api/admin/privacy/requests').query({ q: 'open-', pageSize: 1, page: 2 }), 200).body;
    expect(search).toMatchObject({ total: 3, pages: 3 });
    expect(search.items.map((r: { email: string }) => r.email)).toEqual(['open-mid@test.local']);
  });
});

describe('GET /api/admin/campaigns — paging', () => {
  it('pages newest first and filters by status', async () => {
    const admin = await asAdmin();
    // resetDb keeps campaigns (createdBy is set null when users are wiped): start from an empty table.
    await prisma.campaignRecipient.deleteMany();
    await prisma.campaign.deleteMany();
    for (let i = 0; i < 5; i++) {
      await prisma.campaign.create({ data: { name: `C${i}`, channels: ['EMAIL'], content: {}, status: i < 2 ? 'COMPLETED' : 'DRAFT', createdAt: at(i) } });
    }
    const p1 = expectStatus(await admin.agent.get('/api/admin/campaigns').query({ pageSize: 2 }), 200).body;
    expect(p1).toMatchObject({ total: 5, page: 1, pageSize: 2, pages: 3 });
    expect(p1.items.map((c: { name: string }) => c.name)).toEqual(['C4', 'C3']);
    expect(p1.items[0].stats).toBeTruthy();
    const p3 = expectStatus(await admin.agent.get('/api/admin/campaigns').query({ pageSize: 2, page: 3 }), 200).body;
    expect(p3.items.map((c: { name: string }) => c.name)).toEqual(['C0']);
    const done = expectStatus(await admin.agent.get('/api/admin/campaigns').query({ status: 'COMPLETED' }), 200).body;
    expect(done).toMatchObject({ total: 2, pageSize: 50 });
    expect(done.items.map((c: { name: string }) => c.name)).toEqual(['C1', 'C0']);
    expectStatus(await admin.agent.get('/api/admin/campaigns').query({ status: 'NOPE' }), 400);
  });
});

describe('GET /api/admin/client-billing/invoices — paging', () => {
  it('pages newest first while the tiles still cover every matching invoice', async () => {
    const admin = await asAdmin();
    const a = await prisma.user.create({ data: { email: 'pay-a@test.local', passwordHash: 'x', firstName: 'Leyla', lastName: 'Əliyeva' } });
    const b = await prisma.user.create({ data: { email: 'pay-b@test.local', passwordHash: 'x', firstName: 'Orxan', lastName: 'Quliyev' } });
    for (let i = 0; i < 5; i++) {
      await prisma.clientInvoice.create({
        data: {
          number: `TV-KR-PAGE-${i}`,
          clientId: i < 3 ? a.id : b.id,
          status: i === 4 ? ('DRAFT' as const) : ('SENT' as const),
          items: [],
          issueDate: new Date(Date.UTC(2026, 0, 1 + i)),
          dueDate: new Date(Date.UTC(2026, 1, 1 + i)),
          netCents: 1000,
          vatCents: 0,
          grossCents: 1000,
        },
      });
    }
    const p1 = expectStatus(await admin.agent.get('/api/admin/client-billing/invoices').query({ pageSize: 2 }), 200).body;
    expect(p1).toMatchObject({ total: 5, page: 1, pageSize: 2, pages: 3 });
    // Drafts have no number in the list view (assigned when sent).
    expect(p1.invoices.map((i: { number: string | null; status: string }) => i.number ?? i.status)).toEqual(['DRAFT', 'TV-KR-PAGE-3']);
    // Totals: all 4 sent invoices are open (1000 each), 1 draft, whatever the page.
    expect(p1.totals).toMatchObject({ openCents: 4000, draftCount: 1, count: 5 });
    const p3 = expectStatus(await admin.agent.get('/api/admin/client-billing/invoices').query({ pageSize: 2, page: 3 }), 200).body;
    expect(p3.invoices.map((i: { number: string }) => i.number)).toEqual(['TV-KR-PAGE-0']);
    expect(p3.totals).toEqual(p1.totals);

    const leyla = expectStatus(await admin.agent.get('/api/admin/client-billing/invoices').query({ q: 'Leyla', pageSize: 2, page: 2 }), 200).body;
    expect(leyla).toMatchObject({ total: 3, pages: 2 });
    expect(leyla.invoices.map((i: { number: string }) => i.number)).toEqual(['TV-KR-PAGE-0']);
    expect(leyla.totals).toMatchObject({ openCents: 3000, count: 3 });
  });
});
