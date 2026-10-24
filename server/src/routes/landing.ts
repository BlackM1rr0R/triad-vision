import express, { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, limiter, notFound, parse } from '../lib/http.js';
import { notifyStaff } from '../lib/notifications.js';
import { recordConsent } from '../lib/privacy/consents.js';
import { onInquiryCreated } from '../lib/assignment/inquiry.js';
import { attachLeadContext, utmSchema, visitorIdSchema } from '../lib/marketing/leadScoring.js';
import { visitorDid } from '../lib/marketing/visitors.js';
import { FORM_FIELDS, formConfigOf, sectionsOf, videoEmbedUrl, type LandingSection } from '../lib/marketing/landing.js';

/**
 * Public landing pages — mounted at /api/landing:
 *   GET  /:slug          published page (sections, form config; testimonials resolved)
 *   POST /:slug/view     view counter (beacon; bots ignored, rate limited)
 *   POST /:slug/submit   form → Inquiry (source "landing:<slug>"), honeypot + rate limit, lead scoring
 */
export const landingRouter = Router();

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|curl|wget|python|axios|node-fetch/i;

const published = async (slug: string) => {
  const page = await prisma.landingPage.findUnique({ where: { slug: slug.toLowerCase() } });
  if (!page || page.status !== 'PUBLISHED') throw notFound();
  return page;
};

/** Sections ready for rendering: testimonial ids → the published testimonials, video URL → embed URL. */
export const renderableSections = async (raw: unknown) => {
  const sections = sectionsOf(raw);
  const ids = [...new Set(sections.flatMap((s) => (s.type === 'testimonials' ? ((s.data.ids as string[]) ?? []) : [])))];
  const testimonials = ids.length ? await prisma.testimonial.findMany({ where: { id: { in: ids }, published: true } }) : [];
  const byId = new Map(testimonials.map((t) => [t.id, t]));
  return sections.map((s): LandingSection & { resolved?: unknown } => {
    if (s.type === 'testimonials') {
      const picked = ((s.data.ids as string[]) ?? []).map((id) => byId.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
      return { ...s, resolved: picked.map((t) => ({ id: t.id, quote: t.quote, author: t.author, role: t.role })) };
    }
    if (s.type === 'video') return { ...s, resolved: { embedUrl: videoEmbedUrl(String(s.data.url ?? '')) } };
    return s;
  });
};

landingRouter.get('/:slug', async (req, res) => {
  const page = await published(String(req.params.slug));
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
  res.json({
    page: {
      id: page.id,
      slug: page.slug,
      locale: page.locale,
      title: page.title,
      country: page.country,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      ogImage: page.ogImage,
      sections: await renderableSections(page.sections),
      formConfig: formConfigOf(page.formConfig),
    },
  });
});

const viewLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 30 });

landingRouter.post('/:slug/view', viewLimiter, express.text({ type: 'text/plain', limit: '1kb' }), async (req, res) => {
  if (BOT_UA.test(req.get('user-agent') ?? '')) {
    res.status(204).end();
    return;
  }
  let raw: unknown = req.body;
  if (typeof raw === 'string') {
    try {
      raw = raw ? JSON.parse(raw) : {};
    } catch {
      raw = {};
    }
  }
  const body = z.object({ visitorId: visitorIdSchema.optional().catch(undefined) }).catch({}).parse(raw ?? {});
  const { count } = await prisma.landingPage.updateMany({ where: { slug: String(req.params.slug).toLowerCase(), status: 'PUBLISHED' }, data: { views: { increment: 1 } } });
  if (!count) throw notFound();
  await visitorDid(body.visitorId, 'landing_view');
  res.status(204).end();
});

const submitLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10 });

const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

landingRouter.post('/:slug/submit', submitLimiter, async (req, res) => {
  const body = parse(
    z.object({
      name: optional(120),
      phone: z
        .string()
        .trim()
        .max(40)
        .regex(/^[+\d][\d\s()-]{5,}$/, 'PHONE_INVALID')
        .optional()
        .or(z.literal('').transform(() => undefined)),
      email: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal('').transform(() => undefined)),
      profession: optional(120),
      germanLevel: z.enum(['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional().or(z.literal('').transform(() => undefined)),
      country: optional(80),
      message: optional(3000),
      consent: z.literal(true),
      // honeypot: real users never fill this hidden field
      website: z.string().max(200).optional(),
      visitorId: visitorIdSchema.optional().catch(undefined),
      utm: utmSchema.optional().catch(undefined),
      companyName: optional(160),
      workersNeeded: z.coerce.number().int().min(1).max(10000).optional().catch(undefined),
    }),
    req.body,
  );
  if (body.website) {
    res.status(201).json({ ok: true, id: 'ok' }); // look like a success to bots
    return;
  }
  const page = await published(String(req.params.slug));
  const cfg = formConfigOf(page.formConfig);
  // Required fields come from the page's form config (name and a way to reach the person always).
  for (const f of FORM_FIELDS) {
    const rule = cfg.fields[f];
    const value = body[f];
    if (rule.show && rule.required && (value === undefined || value === '')) throw badRequest('FIELD_REQUIRED', f);
  }
  if (!body.name || body.name.length < 2) throw badRequest('FIELD_REQUIRED', 'name');
  if (!body.email && !body.phone) throw badRequest('CONTACT_REQUIRED');

  const lines = [
    `Lendinq: ${page.title} (/l/${page.slug})`,
    body.profession ? `Peşə: ${body.profession}` : null,
    body.germanLevel ? `Alman dili: ${body.germanLevel}` : null,
    body.country ? `Ölkə: ${body.country}` : null,
    body.message ? `\n${body.message}` : null,
  ].filter((l): l is string => l !== null);
  const message = lines.join('\n').slice(0, 5000);
  const inquiry = await prisma.inquiry.create({
    data: {
      kind: cfg.kind,
      source: `landing:${page.slug}`.slice(0, 80),
      contactName: body.name,
      companyName: cfg.kind === 'company' ? (body.companyName ?? null) : null,
      workersNeeded: cfg.kind === 'company' ? (body.workersNeeded ?? null) : null,
      email: body.email ?? '',
      phone: body.phone ?? null,
      sector: body.profession ?? null,
      message,
      // Staff languages are az/de/en/ru: Turkish pages are handled by the Azerbaijani team, Ukrainian by the Russian one.
      locale: ({ tr: 'az', uk: 'ru' } as Record<string, string>)[page.locale] ?? (['az', 'de', 'en', 'ru'].includes(page.locale) ? page.locale : 'az'),
    },
  });
  await prisma.landingPage.update({ where: { id: page.id }, data: { submissions: { increment: 1 } } });
  void onInquiryCreated(inquiry.id); // automation rules + optional auto-assignment (never throws)
  if (body.email) await recordConsent({ email: body.email, type: 'PRIVACY_POLICY', granted: true, source: 'LANDING', req });
  await notifyStaff(
    `Lendinq müraciəti: ${body.name} · ${page.title}`,
    [body.email ? `Email: ${body.email}` : null, body.phone ? `Telefon: ${body.phone}` : null, `Dil: ${page.locale}`, '', message].filter((l): l is string => l !== null).join('\n'),
    { link: '/admin/inquiries' },
  );
  // Lead score after the notice, so a HOT alert never arrives before it (never throws).
  await attachLeadContext(inquiry.id, { visitorId: body.visitorId, utm: body.utm, landingPageId: page.id });
  res.status(201).json({ ok: true, id: inquiry.id });
});
