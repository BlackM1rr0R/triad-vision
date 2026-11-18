import type { Request, Response } from 'express';
import { prisma } from '../../db.js';
import { audit } from '../audit.js';
import { notifyUser } from '../notifications.js';
import { renderEmail, sendMail } from '../mailer.js';
import { buildUserExport, exportFilename } from './export.js';
import { dueFrom } from './requests.js';
import { exportedText } from './texts.js';
import { isImpersonating } from './impersonationContext.js';

/**
 * Self-service data export (Art. 15 / 20) as a JSON download — GET /api/privacy/export and GET /api/account/export (the
 * profile page). Fulfilled instantly, but kept as a completed EXPORT request (proof that it was answered), audited,
 * and the user is told in-app and by e-mail (someone else downloading with a stolen session does not go unnoticed).
 */
export const sendSelfServiceExport = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, locale: true } });
  // Staff "view as client" (read-only): the download works, but nothing is recorded, audited as the client or sent.
  if (isImpersonating()) return sendExportBody(res, await buildUserExport(userId));
  const now = new Date();
  const r = await prisma.privacyRequest.create({
    data: { userId, email: user.email, type: 'EXPORT', status: 'COMPLETED', dueAt: dueFrom(now), completedAt: now, decisionNote: 'Self-service download' },
  });
  const data = await buildUserExport(userId);
  await audit(req, 'PRIVACY_EXPORT', `privacy-request:${r.id}`);
  const texts = exportedText(user.locale);
  await notifyUser(userId, { type: 'PRIVACY_EXPORT', title: texts.title, body: texts.body, link: '/account/privacy', email: false });
  void sendMail(user.email, `Triad Vision · ${texts.title}`, renderEmail(texts.title, texts.body));
  sendExportBody(res, data);
};

const sendExportBody = (res: Response, data: unknown) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename()}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(data, null, 2));
};
