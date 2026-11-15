import { Router } from 'express';
import { z } from 'zod';
import { VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { parse } from '../../lib/http.js';
import { dataQualityList } from '../../lib/dataQuality/service.js';

/**
 * GET /api/admin/data-quality?staff=<id|none|me>&visaType=WORK&maxScore=80 — active cases with missing profile
 * fields / documents / expiry problems and a score, worst first (lib/dataQuality). STAFF+ (admin router), read-only.
 */
export const adminDataQualityRouter = Router();

adminDataQualityRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      staff: z.string().trim().max(40).optional(),
      visaType: z.nativeEnum(VisaType).optional(),
      maxScore: z.coerce.number().int().min(0).max(100).optional(),
    }),
    req.query,
  );
  const staffId = q.staff === 'me' ? req.user!.id : q.staff || undefined;
  const [list, staff] = await Promise.all([
    dataQualityList({ staffId, visaType: q.visaType, maxScore: q.maxScore }),
    prisma.user.findMany({ where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } }),
  ]);
  res.json({ ...list, staffOptions: staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`.trim() })) });
});
