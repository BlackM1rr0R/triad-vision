import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { forbidden } from '../lib/http.js';
import { memberAccess } from '../lib/companyAccess/service.js';
import { COMPANY_PERMS } from '../lib/companyAccess/permissions.js';

/**
 * Employer portal: the signed-in member's own role and permissions — mounted at /api/company/access (before the
 * main company router). The portal hides what the member may not use; the server enforces it anyway
 * (lib/companyAccess/guard.ts).
 *
 *   GET /me → { role: 'STANDARD' | OWNER | ADMIN | HR | MANAGER | VIEWER, isOwner, permissions: { [perm]: boolean } }
 */
export const companyAccessRouter = Router();
companyAccessRouter.use(requireRole('COMPANY'));

companyAccessRouter.get('/me', async (req, res) => {
  const access = await memberAccess(req.user!.id);
  if (!access) throw forbidden('NO_COMPANY');
  res.json({
    role: access.isOwner ? 'OWNER' : (access.role ?? 'STANDARD'),
    isOwner: access.isOwner,
    permissions: Object.fromEntries(COMPANY_PERMS.map((p) => [p, access.perms[p]])),
  });
});
