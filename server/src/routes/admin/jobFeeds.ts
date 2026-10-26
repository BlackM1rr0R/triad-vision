import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { clearCache } from '../../lib/cache.js';
import { open, seal } from '../../lib/secretBox.js';
import {
  CHANNELS,
  FEED_CHANNELS,
  FEED_LANGUAGES,
  buildFeed,
  channelsOf,
  clearFeedCache,
  ensureFeedConfig,
  feedInclude,
  feedTokenOf,
  feedUrls,
  isLive,
  rotateFeedToken,
  toFeedJob,
  validateFeedJob,
  type Channel,
} from '../../lib/jobFeeds/service.js';
import { BA_UNCERTAIN_FIELDS, baMissing, buildBaExport, recordBaStates, runBaUpload, validateBaJob } from '../../lib/jobFeeds/ba.js';
import { OCCUPATIONS, searchOccupations, suggestOccupation } from '../../lib/jobFeeds/occupations.js';

// Admin: external job boards ("İş elanı kanalları") — mounted at /api/admin/job-feeds (ADMIN+).
export const adminJobFeedsRouter = Router();

const baView = (cfg: Awaited<ReturnType<typeof ensureFeedConfig>>) => {
  const missing = baMissing(cfg);
  return {
    supplierId: cfg.baSupplierId,
    partnerId: cfg.baPartnerId,
    uploadUrl: cfg.baUploadUrl,
    hasCertificate: !!cfg.baCertSealed && !!open(cfg.baCertSealed),
    hasPassphrase: !!cfg.baPassSealed && open(cfg.baPassSealed) !== null,
    uploadEnabled: cfg.baUploadEnabled,
    ready: missing.length === 0,
    missing,
    lastUploadAt: cfg.baLastUploadAt,
    lastError: cfg.baLastError,
    uncertainFields: BA_UNCERTAIN_FIELDS,
  };
};

/** Overview: feed URLs, token age, per-channel counts and the vacancies in error. */
adminJobFeedsRouter.get('/', async (_req, res) => {
  const cfg = await ensureFeedConfig();
  const token = feedTokenOf(cfg);
  const [states, distributions, errorRows] = await Promise.all([
    prisma.vacancyChannelState.groupBy({ by: ['channel', 'status'], _count: { _all: true } }),
    prisma.vacancyDistribution.findMany({ select: { channels: true } }),
    prisma.vacancyChannelState.findMany({
      where: { status: 'ERROR' },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { channel: true, error: true, updatedAt: true, vacancy: { select: { id: true, slug: true, title: true, status: true } } },
    }),
  ]);
  const stats = cfg.feedStats && typeof cfg.feedStats === 'object' && !Array.isArray(cfg.feedStats) ? (cfg.feedStats as Record<string, { at: string; items: number }>) : {};
  const channels = Object.fromEntries(
    CHANNELS.map((c) => [
      c,
      {
        enabled: distributions.filter((d) => channelsOf(d).includes(c)).length,
        counts: Object.fromEntries(states.filter((s) => s.channel === c).map((s) => [s.status, s._count._all])),
        lastBuild: stats[c] ?? null,
      },
    ]),
  );
  res.json({
    feeds: token ? feedUrls(token) : null,
    tokenRotatedAt: cfg.tokenRotatedAt,
    // The token could not be opened (encryption key changed): rotate to get a working one.
    tokenBroken: !token,
    channels,
    errors: errorRows,
    ba: baView(cfg),
  });
});

adminJobFeedsRouter.post('/rotate-token', async (req, res) => {
  const cfg = await rotateFeedToken();
  await audit(req, 'JOB_FEED_TOKEN_ROTATED', 'job-feeds');
  res.json({ feeds: feedUrls(feedTokenOf(cfg)!), tokenRotatedAt: cfg.tokenRotatedAt });
});

/** Rebuilds every feed now (clears the 10-minute cache, refreshes the channel statuses). */
adminJobFeedsRouter.post('/refresh', async (req, res) => {
  clearFeedCache();
  const result: Record<string, { items: number; errors: number }> = {};
  for (const c of FEED_CHANNELS) {
    const r = await buildFeed(c);
    result[c] = { items: r.included.length, errors: r.errors.length };
  }
  clearFeedCache();
  await audit(req, 'JOB_FEED_REFRESHED', 'job-feeds', result);
  res.json({ result });
});

// ─── Bundesagentur für Arbeit ───────────────────────────────────────────

const baInput = z.object({
  supplierId: z.string().trim().max(40).regex(/^[A-Za-z0-9]*$/).nullable().optional(),
  partnerId: z.string().trim().max(40).regex(/^[A-Za-z0-9]*$/).nullable().optional(),
  uploadUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https:\/\/[^\s]+$/i.test(v), 'HTTPS_URL_REQUIRED')
    .nullable()
    .optional(),
  /** PKCS#12 (.p12) client certificate, base64. Write-only: never returned. */
  certificate: z.string().trim().max(200_000).regex(/^[A-Za-z0-9+/=\s]+$/).optional(),
  passphrase: z.string().max(200).optional(),
  clearCredentials: z.boolean().optional(),
  uploadEnabled: z.boolean().optional(),
});

adminJobFeedsRouter.put('/ba', async (req, res) => {
  const b = parse(baInput, req.body ?? {});
  const cfg = await ensureFeedConfig();
  const data: Prisma.JobFeedConfigUpdateInput = {};
  const changed: string[] = [];
  const str = (v: string | null | undefined) => (v ? v : null);
  if (b.supplierId !== undefined) (data.baSupplierId = str(b.supplierId)), changed.push('supplierId');
  if (b.partnerId !== undefined) (data.baPartnerId = str(b.partnerId)), changed.push('partnerId');
  if (b.uploadUrl !== undefined) (data.baUploadUrl = str(b.uploadUrl)), changed.push('uploadUrl');
  if (b.certificate) {
    const raw = b.certificate.replace(/\s+/g, '');
    if (Buffer.from(raw, 'base64').length < 100) throw badRequest('CERTIFICATE_INVALID');
    data.baCertSealed = seal(raw);
    changed.push('certificate');
  }
  if (b.passphrase !== undefined) (data.baPassSealed = seal(b.passphrase)), changed.push('passphrase');
  if (b.clearCredentials) {
    data.baCertSealed = null;
    data.baPassSealed = null;
    data.baUploadEnabled = false;
    changed.push('clearCredentials');
  }
  if (b.uploadEnabled !== undefined && !b.clearCredentials) {
    const next = { ...cfg, ...data } as typeof cfg;
    if (b.uploadEnabled && baMissing(next).length) throw badRequest('BA_NOT_CONFIGURED');
    data.baUploadEnabled = b.uploadEnabled;
    changed.push('uploadEnabled');
  }
  const saved = await prisma.jobFeedConfig.update({ where: { id: cfg.id }, data });
  // Field names only: values (and above all the certificate / password) never go into the audit log.
  await audit(req, 'JOB_FEED_BA_SETTINGS_UPDATED', 'job-feeds:ba', { changed });
  res.json({ ba: baView(saved) });
});

/** Validation preview of the BA file (no download, no status change). */
adminJobFeedsRouter.get('/ba/validate', async (_req, res) => {
  const exp = await buildBaExport();
  res.json({ fileName: exp.fileName, included: exp.included.map((j) => ({ vacancyId: j.vacancyId, slug: j.slug, title: j.title })), errors: exp.errors, fileErrors: exp.fileErrors });
});

/** HR-BA-XML file for the manual upload in the BA web interface. Invalid postings are left out (see /ba/validate). */
adminJobFeedsRouter.get('/ba.xml', async (req, res) => {
  const exp = await buildBaExport();
  await recordBaStates(exp, false);
  await audit(req, 'JOB_FEED_BA_EXPORTED', 'job-feeds:ba', { included: exp.included.length, invalid: exp.errors.length });
  res.type('application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${exp.fileName}"`);
  res.send(exp.xml);
});

adminJobFeedsRouter.post('/ba/upload', async (req, res) => {
  const result = await runBaUpload({ manual: true });
  await audit(req, 'JOB_FEED_BA_UPLOAD', 'job-feeds:ba', result as unknown as Prisma.InputJsonValue);
  res.json({ result });
});

// ─── Occupation codes ───────────────────────────────────────────────────

adminJobFeedsRouter.get('/occupations', (req, res) => {
  const q = parse(z.object({ q: z.string().trim().max(80).default('') }), req.query);
  res.json({ items: q.q ? searchOccupations(q.q, 15) : OCCUPATIONS });
});

// ─── Per vacancy ────────────────────────────────────────────────────────

const optionalDate = z
  .union([z.null(), z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}/)])
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v) : null))
  .refine((d) => d === undefined || d === null || !Number.isNaN(d.getTime()), 'INVALID_DATE');
const optCode = (re: RegExp) =>
  z
    .union([z.null(), z.literal(''), z.string().trim().regex(re)])
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

const distributionInput = z.object({
  channels: z.array(z.enum(CHANNELS)).max(CHANNELS.length),
  language: z.enum(FEED_LANGUAGES).optional(),
  hideEmployer: z.boolean().optional(),
  employerLabel: z
    .string()
    .trim()
    .max(160)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  applyUrl: z
    .union([z.null(), z.literal(''), z.string().trim().max(500).regex(/^https?:\/\/[^\s]+$/i)])
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  occupationCode: optCode(/^\d{5}$/),
  baTitleCode: optCode(/^\d{1,12}$/),
  postalCode: optCode(/^\d{5}$/),
  weeklyHours: z.number().int().min(1).max(60).nullable().optional(),
  limited: z.boolean().optional(),
  limitedUntil: optionalDate,
  startDate: optionalDate,
});

const loadVacancy = async (id: string) => {
  const v = await prisma.vacancy.findUnique({ where: { id }, include: { ...feedInclude, channelStates: true } });
  if (!v) throw notFound('VACANCY_NOT_FOUND');
  return v;
};

const vacancyView = (v: Awaited<ReturnType<typeof loadVacancy>>) => {
  const suggestion = suggestOccupation(v.profession, (v.title as Record<string, string> | null)?.de);
  const enabled = channelsOf(v.distribution);
  // What each channel would say right now (also for channels not switched on yet).
  const check = Object.fromEntries(
    CHANNELS.map((c: Channel) => {
      const job = toFeedJob(v, c);
      return [c, c === 'ba' ? validateBaJob(job) : validateFeedJob(job, c)];
    }),
  );
  return {
    vacancy: { id: v.id, slug: v.slug, status: v.status, live: isLive(v), showCompany: v.showCompany, companyName: v.company?.name ?? null, city: v.city },
    distribution: v.distribution
      ? { ...v.distribution, channels: enabled }
      : {
          channels: [],
          language: 'de',
          hideEmployer: !v.showCompany,
          employerLabel: null,
          applyUrl: null,
          occupationCode: suggestion?.code ?? null,
          baTitleCode: null,
          postalCode: null,
          weeklyHours: null,
          limited: false,
          limitedUntil: null,
          startDate: null,
        },
    saved: !!v.distribution,
    suggestion: suggestion ?? null,
    states: v.channelStates.map((s) => ({ channel: s.channel, status: s.status, lastExportAt: s.lastExportAt, error: s.error, updatedAt: s.updatedAt })),
    check,
    applyUrls: Object.fromEntries(CHANNELS.map((c) => [c, toFeedJob(v, c).url])),
  };
};

adminJobFeedsRouter.get('/vacancies/:id', async (req, res) => {
  res.json(vacancyView(await loadVacancy(String(req.params.id))));
});

adminJobFeedsRouter.put('/vacancies/:id', async (req, res) => {
  const id = String(req.params.id);
  const b = parse(distributionInput, req.body ?? {});
  const before = await loadVacancy(id);
  const channels = [...new Set(b.channels)];
  const fields = {
    language: b.language,
    hideEmployer: b.hideEmployer,
    employerLabel: b.employerLabel,
    applyUrl: b.applyUrl,
    occupationCode: b.occupationCode,
    baTitleCode: b.baTitleCode,
    postalCode: b.postalCode,
    weeklyHours: b.weeklyHours,
    limited: b.limited,
    limitedUntil: b.limitedUntil,
    startDate: b.startDate,
  };
  const defined = Object.fromEntries(Object.entries(fields).filter(([, val]) => val !== undefined));
  await prisma.vacancyDistribution.upsert({
    where: { vacancyId: id },
    create: { vacancyId: id, channels, hideEmployer: !before.showCompany, ...defined },
    update: { channels, ...defined },
  });
  // Channels switched off lose their status row; newly switched on ones start as PENDING.
  const prev = channelsOf(before.distribution);
  await prisma.vacancyChannelState.deleteMany({ where: { vacancyId: id, channel: { notIn: channels } } });
  for (const c of channels.filter((x) => !prev.includes(x))) {
    await prisma.vacancyChannelState.upsert({
      where: { vacancyId_channel: { vacancyId: id, channel: c } },
      create: { vacancyId: id, channel: c, status: 'PENDING' },
      update: { status: 'PENDING', error: null },
    });
  }
  clearFeedCache();
  clearCache(); // the public job page JSON-LD (KldB code, postal code) reads the distribution
  await audit(req, 'VACANCY_DISTRIBUTION_UPDATED', `vacancy:${id}`, { channels, added: channels.filter((c) => !prev.includes(c)), removed: prev.filter((c) => !channels.includes(c)) });
  res.json(vacancyView(await loadVacancy(id)));
});
