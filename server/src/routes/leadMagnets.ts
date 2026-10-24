import fs from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { conflict, limiter, notFound, parse } from '../lib/http.js';
import { parseLocale } from '../lib/seo.js';
import { notifyStaff } from '../lib/notifications.js';
import { recordConsent } from '../lib/privacy/consents.js';
import { onInquiryCreated } from '../lib/assignment/inquiry.js';
import { attachLeadContext, utmSchema, visitorIdSchema } from '../lib/marketing/leadScoring.js';
import {
  downloadToken,
  fileLocaleFor,
  filePath,
  filesOf,
  findMagnet,
  publicMagnet,
  sendDownloadMail,
  verifyDownloadToken,
} from '../lib/leadMagnets/service.js';

/**
 * Public e-book lead magnets — mounted at /api/lead-magnets:
 *   GET  /?lng=                published e-books (title / description in that language, available PDFs)
 *   GET  /:slug?lng=           one e-book
 *   POST /:slug/request        e-mail form → Inquiry (source "ebook:<slug>", lead scoring, visitor id), consent
 *                              log when marketing e-mails were allowed, e-mail with a signed 7-day download link
 *   GET  /download/:token      the PDF of the token's language
 * Honeypot + rate limit on the form; the response never says whether the address is known.
 */
export const leadMagnetsRouter = Router();

const requestLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 8 });
const downloadLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 30 });

leadMagnetsRouter.get('/', async (req, res) => {
  const lng = parseLocale(req.query.lng) ?? 'az';
  const items = await prisma.leadMagnet.findMany({ where: { published: true }, orderBy: { createdAt: 'asc' } });
  res.setHeader('Cache-Control', 'public, max-age=120');
  res.json({ items: items.map((m) => publicMagnet(m, lng)).filter((m) => m.fileLocale) });
});

leadMagnetsRouter.get('/download/:token', downloadLimiter, async (req, res) => {
  const t = verifyDownloadToken(req.params.token);
  if (!t) throw notFound('LINK_INVALID');
  const magnet = await prisma.leadMagnet.findUnique({ where: { id: t.magnetId } });
  if (!magnet) throw notFound('LINK_INVALID');
  const files = filesOf(magnet.files);
  const lng = fileLocaleFor(files, t.lng);
  const key = lng ? files[lng] : undefined;
  if (!key || !fs.existsSync(filePath(key))) throw notFound('FILE_MISSING');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${magnet.slug}-${lng}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  fs.createReadStream(filePath(key)).pipe(res);
});

leadMagnetsRouter.get('/:slug', async (req, res) => {
  const lng = parseLocale(req.query.lng) ?? 'az';
  const magnet = await findMagnet(String(req.params.slug));
  if (!magnet || !magnet.published) throw notFound('EBOOK_NOT_FOUND');
  res.setHeader('Cache-Control', 'public, max-age=120');
  res.json({ item: publicMagnet(magnet, lng) });
});

const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

leadMagnetsRouter.post('/:slug/request', requestLimiter, async (req, res) => {
  const body = parse(
    z.object({
      email: z.string().trim().toLowerCase().email().max(190),
      name: z.string().trim().min(2).max(120),
      phone: z
        .string()
        .trim()
        .max(40)
        .regex(/^[+\d][\d\s()-]{5,}$/, 'PHONE_INVALID')
        .optional()
        .or(z.literal('').transform(() => undefined)),
      country: optional(80),
      lng: z.string().optional(),
      marketingConsent: z.boolean().optional().default(false),
      // honeypot: real users never fill this hidden field
      website: z.string().max(200).optional(),
      visitorId: visitorIdSchema.optional().catch(undefined),
      utm: utmSchema.optional().catch(undefined),
      /** Page the form was embedded on (guide slug …), for the sales team. */
      from: optional(160),
    }),
    req.body,
  );
  if (body.website) {
    res.status(201).json({ ok: true }); // look like a success to bots
    return;
  }
  const magnet = await findMagnet(String(req.params.slug));
  if (!magnet || !magnet.published) throw notFound('EBOOK_NOT_FOUND');
  const lng = parseLocale(body.lng) ?? 'az';
  const files = filesOf(magnet.files);
  const fileLng = fileLocaleFor(files, lng);
  if (!fileLng) throw conflict('EBOOK_NO_FILE');
  const info = publicMagnet(magnet, lng);

  const lines = [
    `E-kitab: ${info.title} (/ebook/${magnet.slug})`,
    `Dil: ${lng}${fileLng !== lng ? ` (PDF: ${fileLng})` : ''}`,
    body.country ? `Ölkə: ${body.country}` : null,
    body.from ? `Səhifə: ${body.from}` : null,
    `Marketinq e-poçtlarına razılıq: ${body.marketingConsent ? 'bəli' : 'xeyr'}`,
  ].filter((l): l is string => l !== null);
  const inquiry = await prisma.inquiry.create({
    data: {
      kind: 'contact',
      source: `ebook:${magnet.slug}`.slice(0, 80),
      contactName: body.name,
      email: body.email,
      phone: body.phone ?? null,
      message: lines.join('\n'),
      // Staff languages are az/de/en/ru: Turkish leads go to the Azerbaijani team, Ukrainian to the Russian one.
      locale: ({ tr: 'az', uk: 'ru' } as Record<string, string>)[lng] ?? lng,
    },
  });
  await prisma.leadMagnet.update({ where: { id: magnet.id }, data: { downloads: { increment: 1 } } });
  void onInquiryCreated(inquiry.id); // automation rules + optional auto-assignment (never throws)
  if (body.marketingConsent) await recordConsent({ email: body.email, type: 'MARKETING_EMAIL', granted: true, source: 'EBOOK', visitorId: body.visitorId ?? null, req });
  await sendDownloadMail(body.email, body.name, info.title, lng, downloadToken(magnet.id, lng));
  await notifyStaff(`E-kitab sorğusu: ${body.name} · ${info.title}`, [`Email: ${body.email}`, body.phone ? `Telefon: ${body.phone}` : null, '', ...lines].filter((l): l is string => l !== null).join('\n'), {
    link: '/admin/inquiries',
  });
  await attachLeadContext(inquiry.id, { visitorId: body.visitorId, utm: body.utm });
  res.status(201).json({ ok: true });
});
