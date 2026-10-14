import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireRole } from '../../middleware/auth.js';
import { parse } from '../../lib/http.js';
import { clearCache } from '../../lib/cache.js';
import { adminCasesRouter } from './cases.js';
import { adminContentRouter, adminSettingsRouter, adminUploadRouter } from './content.js';
import { adminUsersRouter } from './users.js';

export const adminRouter = Router();
adminRouter.use(requireRole('STAFF', 'ADMIN'));

adminRouter.get('/dashboard', async (_req, res) => {
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [byStatus, newInquiries, clients, recentEvents, waiting] = await Promise.all([
    prisma.case.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.inquiry.count({ where: { status: 'NEW' } }),
    prisma.user.count({ where: { role: 'CLIENT', createdAt: { gte: monthAgo } } }),
    prisma.caseEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: {
        case: { select: { id: true, number: true } },
        actor: { select: { firstName: true, lastName: true, role: true } },
      },
    }),
    // cases waiting for a staff action
    prisma.case.findMany({
      where: { status: { in: ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_REVIEW'] } },
      orderBy: { updatedAt: 'asc' },
      take: 10,
      include: { client: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  res.json({
    counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
    newInquiries,
    newClients30d: clients,
    recentEvents,
    waiting,
  });
});

// Any successful CMS write must be visible on the public site right away.
// The cache is cleared before the response is sent, so the admin's next public read is already fresh.
adminRouter.use(['/content', '/settings'], (req, res, next) => {
  if (req.method !== 'GET') {
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400) clearCache();
      return json(body);
    };
  }
  next();
});

adminRouter.use('/cases', adminCasesRouter);
adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/upload', requireRole('ADMIN'), adminUploadRouter);
adminRouter.use('/settings', requireRole('ADMIN'), adminSettingsRouter);
adminRouter.use('/content', requireRole('ADMIN'), adminContentRouter);

adminRouter.get('/inquiries', async (_req, res) => {
  res.json({ items: await prisma.inquiry.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }) });
});

adminRouter.patch('/inquiries/:id', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['NEW', 'IN_PROGRESS', 'DONE', 'ARCHIVED']) }), req.body);
  res.json({ item: await prisma.inquiry.update({ where: { id: req.params.id }, data: { status } }) });
});
