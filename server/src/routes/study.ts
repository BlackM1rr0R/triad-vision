import fsp from 'node:fs/promises';
import { Router, type Request } from 'express';
import { prisma } from '../db.js';
import { limiter, notFound, parse } from '../lib/http.js';
import { notifyStaff } from '../lib/notifications.js';
import { onInquiryCreated } from '../lib/assignment/inquiry.js';
import { attachLeadContext } from '../lib/marketing/leadScoring.js';
import { partnerIdFromRequest } from '../lib/partners/owned.js';
import { decodeOriginalName, verifyUploadedFile } from '../middleware/upload.js';
import { applicantPhone } from '../lib/germanyJobs/apply.js';
import { catalogue, catalogueQuery, programmeDetail } from '../lib/study/catalogue.js';
import { createStudyApplication, sendStudyConfirmation, siteLocale, studyApplyInput, studyUpload, type StoredFile } from '../lib/study/apply.js';

/**
 * Almaniyada təhsil — programme catalogue, mounted at /api/study (public):
 *   GET  /programmes                 ?q&degree&subject&city&state&lang=en|de|en_only|de_only&free=1&within=1|2|3|6|12
 *                                    → { items (sorted by next deadline), total, facets, today }
 *   GET  /programmes/:slug           → { programme, related } (404 when missing / unpublished)
 *   POST /programmes/:slug/apply     multipart: applicant fields + optional "cv" and "diploma" (PDF / Word / JPEG / PNG)
 *                                    → Inquiry lead (source "study-programme:<slug>") + StudyApplication, staff notice,
 *                                    confirmation e-mail. Honeypot `website`, consent required, 10 per hour per IP.
 * Programme data is curated by staff (routes/admin/study.ts); deadlines are computed for today's German date.
 */
export const studyRouter = Router();

const applyLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10 });

studyRouter.get('/programmes', async (req, res) => {
  const q = parse(catalogueQuery, req.query);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(await catalogue(q));
});

studyRouter.get('/programmes/:slug', async (req, res) => {
  const detail = await programmeDetail(String(req.params.slug));
  if (!detail) throw notFound('PROGRAMME_NOT_FOUND');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(detail);
});

type Files = Record<string, Express.Multer.File[] | undefined>;
const uploaded = (req: Request) => {
  const files = (req.files ?? {}) as Files;
  return { cv: files.cv?.[0], diploma: files.diploma?.[0] };
};
const removeFiles = async (req: Request) => {
  const f = uploaded(req);
  for (const file of [f.cv, f.diploma]) if (file) await fsp.unlink(file.path).catch(() => undefined);
};
const stored = (file: Express.Multer.File): StoredFile => ({ storedName: file.filename, originalName: decodeOriginalName(file.originalname), mime: file.mimetype, size: file.size });

const accountOf = (req: Request) => {
  const u = req.user;
  if (!u || u.role !== 'CLIENT' || req.impersonator) return null;
  return u;
};

studyRouter.post(
  '/programmes/:slug/apply',
  applyLimiter,
  studyUpload.fields([
    { name: 'cv', maxCount: 1 },
    { name: 'diploma', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const programme = await prisma.studyProgramme.findFirst({
        where: { slug: String(req.params.slug), published: true },
        select: { id: true, slug: true, name: true, university: true, city: true, degree: true },
      });
      if (!programme) throw notFound('PROGRAMME_NOT_FOUND');
      const parsed = studyApplyInput.safeParse(req.body ?? {});
      if (!parsed.success) throw parsed.error;
      const body = parsed.data;
      if (body.website) {
        // A bot filled the hidden field: look like a success, store nothing.
        await removeFiles(req);
        res.status(201).json({ ok: true });
        return;
      }
      const phone = applicantPhone(body.phone);
      const f = uploaded(req);
      // Magic bytes must match the type (removes the file and answers 400 otherwise).
      for (const file of [f.cv, f.diploma]) if (file) await verifyUploadedFile(file);
      const lng = siteLocale(body.lng);
      const account = accountOf(req);
      const inquiry = await createStudyApplication(programme, body, {
        phone,
        lng,
        cv: f.cv ? stored(f.cv) : null,
        diploma: f.diploma ? stored(f.diploma) : null,
        userId: account?.id ?? null,
        partnerId: await partnerIdFromRequest(req),
        accountLabel: account ? `${account.email} (${account.id})` : null,
      });
      void onInquiryCreated(inquiry.id); // automation rules + optional auto-assignment (never throws)
      await notifyStaff(`Təhsil müraciəti: ${body.name} · ${programme.name}`.slice(0, 200), inquiry.message, { link: `/admin/inquiries?open=${inquiry.id}` });
      await sendStudyConfirmation(body.email, body.name, programme, lng);
      await attachLeadContext(inquiry.id, { visitorId: body.visitorId });
      res.status(201).json({ ok: true, id: inquiry.id });
    } catch (err) {
      await removeFiles(req);
      throw err;
    }
  },
);
