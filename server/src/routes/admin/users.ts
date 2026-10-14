import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireRole } from '../../middleware/auth.js';
import { badRequest, conflict, parse } from '../../lib/http.js';

export const adminUsersRouter = Router();

const userSelect = {
  id: true,
  email: true,
  role: true,
  firstName: true,
  lastName: true,
  phone: true,
  locale: true,
  isActive: true,
  createdAt: true,
  _count: { select: { cases: true } },
} as const;

adminUsersRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({ role: z.enum(['CLIENT', 'STAFF', 'ADMIN']).optional(), search: z.string().trim().optional() }),
    req.query,
  );
  const users = await prisma.user.findMany({
    where: {
      ...(q.role ? { role: q.role } : {}),
      ...(q.search
        ? {
            OR: [
              { email: { contains: q.search } },
              { firstName: { contains: q.search } },
              { lastName: { contains: q.search } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: userSelect,
  });
  res.json({ users });
});

adminUsersRouter.get('/staff', async (_req, res) => {
  const staff = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN'] }, isActive: true },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: { firstName: 'asc' },
  });
  res.json({ staff });
});

adminUsersRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const body = parse(
    z.object({
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(8).max(128),
      firstName: z.string().trim().min(1),
      lastName: z.string().trim().min(1),
      phone: z.string().trim().optional(),
      role: z.enum(['STAFF', 'ADMIN']),
    }),
    req.body,
  );
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('EMAIL_TAKEN');
  const { password, ...rest } = body;
  const user = await prisma.user.create({
    data: { ...rest, passwordHash: await bcrypt.hash(password, 12) },
    select: userSelect,
  });
  res.status(201).json({ user });
});

adminUsersRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const body = parse(
    z.object({
      role: z.enum(['CLIENT', 'STAFF', 'ADMIN']).optional(),
      isActive: z.boolean().optional(),
      password: z.string().min(8).max(128).optional(),
    }),
    req.body,
  );
  if (req.params.id === req.user!.id && (body.role || body.isActive === false)) {
    throw badRequest('CANNOT_CHANGE_SELF');
  }
  const { password, ...rest } = body;
  const user = await prisma.user.update({
    where: { id: String(req.params.id) },
    data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) },
    select: userSelect,
  });
  res.json({ user });
});
