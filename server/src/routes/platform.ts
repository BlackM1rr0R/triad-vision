import { Router, type RequestHandler } from 'express';
import { config } from '../config.js';
import { limiter, notFound } from '../lib/http.js';
import { notifyStaff } from '../lib/notifications.js';
import { onInquiryCreated } from '../lib/assignment/inquiry.js';
import { attachLeadContext } from '../lib/marketing/leadScoring.js';
import { renderEmail, sendMail } from '../lib/mailer.js';
import { MODULE_KEYS } from '../lib/navModules.js';
import { createDemoRequest, demoLocale, demoRequestSchema, sellsPlatform, INTERESTS, TEAM_SIZES } from '../lib/saas/demoRequest.js';
import { DEMO_MAIL } from '../lib/saas/texts.js';

/**
 * Public product page of the platform for other agencies (/platform), mounted at /api/platform:
 *   GET  /status          → { available, modules, interests, teamSizes }  (available = this is the owner's instance)
 *   POST /demo-request    { agencyName, contactName, email, phone?, country?, agencyWebsite?, teamSize?, interests?,
 *                           message?, consent: true, locale?, website (honeypot), visitorId? }
 *                         → Inquiry (source "saas:demo", sector "SAAS") + SaasLead, notice to admins, confirmation
 *                           e-mail. 404 on customer instances. 10 per hour per IP.
 */
export const platformRouter = Router();

const demoLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10 });

platformRouter.get('/status', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ available: sellsPlatform(), modules: MODULE_KEYS, interests: INTERESTS, teamSizes: TEAM_SIZES });
});

const ownerOnly: RequestHandler = (_req, _res, next) => next(sellsPlatform() ? undefined : notFound('NOT_OWNER_INSTANCE'));

platformRouter.post('/demo-request', ownerOnly, demoLimiter, async (req, res) => {
  const parsed = demoRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw parsed.error;
  const body = parsed.data;
  if (body.website) {
    // A bot filled the hidden field: look like a success, store nothing.
    res.status(201).json({ ok: true });
    return;
  }
  const lng = demoLocale(body.locale);
  const { inquiry, lead } = await createDemoRequest(body, { lng });
  void onInquiryCreated(inquiry.id); // automation rules + optional auto-assignment (never throws)
  await notifyStaff(`SaaS demo sorğusu: ${body.agencyName}`.slice(0, 200), inquiry.message, { link: '/admin/system/customers#saas-pipeline' });
  const m = DEMO_MAIL[lng];
  void sendMail(body.email, m.subject, renderEmail(m.subject, `${m.hello(body.contactName)}\n\n${m.body(body.agencyName)}`, { label: m.cta, url: `${config.clientUrl}${lng === 'az' ? '' : `/${lng}`}/platform` }));
  await attachLeadContext(inquiry.id, { visitorId: body.visitorId });
  res.status(201).json({ ok: true, id: lead.id });
});
