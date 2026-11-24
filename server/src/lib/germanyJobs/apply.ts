import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest } from '../http.js';
import { resolveMime } from '../fileCheck.js';
import { decodeOriginalName } from '../../middleware/upload.js';
import { GERMAN_LEVELS } from '../matching.js';
import { phoneInput } from '../phoneField.js';
import { renderEmail, sendMail } from '../mailer.js';
import { SEO_LOCALES, type SeoLocale } from '../seoCatalogue.js';
import { visitorIdSchema } from '../marketing/leadScoring.js';
import { arbeitnowListingFacts } from './arbeitnow.js';
import { employerEmailFromText, isGermanLevel, parseGermanRequirement } from './autoCheck.js';

/**
 * "Apply via Triad Vision" for a vacancy listed on another site — a search result on /jobs/germany (prefilled)
 * or any pasted link (arbeitsagentur.de, StepStone, Indeed …). Stored as an Inquiry (kind "contact", source
 * "external-job:<provider>:<host>") so it lands in the staff inbox with scoring, owner and conversion; the
 * listing, the candidate's details and the CV sit in ExternalJobApplication next to it.
 */

/** CV: PDF or Word, the case-document size limit (UPLOAD_MAX_FILE_MB); bytes are verified after the upload. */
export const CV_MIME = new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

export const cvUpload = multer({
  storage: multer.diskStorage({
    destination: config.uploads.privateDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, `cv-${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: config.uploads.maxFileSize, files: 1, fields: 40 },
  fileFilter: (_req, file, cb) => {
    const mime = resolveMime(file.mimetype, decodeOriginalName(file.originalname));
    if (mime && CV_MIME.has(mime)) {
      file.mimetype = mime;
      cb(null, true);
    } else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
});

export const cvPath = (storedName: string) => path.join(config.uploads.privateDir, path.basename(storedName));

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

const listingUrl = z
  .string()
  .trim()
  .max(1000)
  .url()
  .refine((u) => /^https?:$/.test(new URL(u).protocol), 'URL_PROTOCOL');

/** Multipart fields (all strings). */
export const applyInput = z.object({
  provider: z.enum(['arbeitnow', 'careerjet', 'jooble', 'adzuna', 'link']).catch('link'),
  externalId: opt(64),
  listingUrl,
  listingTitle: opt(300),
  listingCompany: opt(200),
  listingLocation: opt(200),
  jobType: z.enum(['job', 'ausbildung']).optional().catch(undefined),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(190),
  phone: z.string().trim().min(1).max(40),
  germanLevel: z.enum(GERMAN_LEVELS),
  profession: z.string().trim().min(2).max(160),
  experienceYears: z
    .union([z.literal(''), z.coerce.number().int().min(0).max(50)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
  message: opt(3000),
  consent: z.enum(['true', '1', 'on'], { errorMap: () => ({ message: 'CONSENT_REQUIRED' }) }),
  /**
   * DSGVO: Triad Vision may forward the CV and data to the employer of the listing (ConsentRecord
   * EXTERNAL_JOB_FORWARD). Required in the form; without it nothing is sent automatically (lib/germanyJobs/autoSend.ts).
   */
  forwardConsent: z.enum(['true', '1', 'on']).optional().catch(undefined),
  /** Signed-in client: attach the newest saved Lebenslauf (lib/cv/versions) instead of uploading a file. */
  attachLebenslauf: z.enum(['true', '1', 'on']).optional().catch(undefined),
  lng: z.string().optional(),
  // honeypot: real users never fill this hidden field
  website: z.string().max(200).optional(),
  visitorId: visitorIdSchema.optional().catch(undefined),
});
export type ApplyInput = z.infer<typeof applyInput>;

export const siteLocale = (raw: unknown): SeoLocale => (typeof raw === 'string' && (SEO_LOCALES as readonly string[]).includes(raw) ? (raw as SeoLocale) : 'az');
/** Staff languages are az/de/en/ru: Turkish leads go to the Azerbaijani team, Ukrainian to the Russian one. */
export const staffLocale = (lng: SeoLocale) => (lng === 'tr' ? 'az' : lng === 'uk' ? 'ru' : lng);

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

/** Normalised phone (shared normaliser, same rules as the site form); 400 INVALID_PHONE otherwise. */
export const applicantPhone = (raw: string) => phoneInput(raw) ?? null;

const PROVIDER_NAMES = { arbeitnow: 'Arbeitnow', careerjet: 'Careerjet', jooble: 'Jooble', adzuna: 'Adzuna' } as const;

/** Staff-facing summary (Azerbaijani, like the other lead notices) — also the Inquiry message. */
export const summaryLines = (b: ApplyInput, extra: { phone: string | null; lng: SeoLocale; cvName: string | null; account: string | null }) =>
  [
    `Xarici vakansiyaya müraciət (${b.provider === 'link' ? 'link' : `${PROVIDER_NAMES[b.provider]} axtarışı`})`,
    `Vakansiya: ${b.listingTitle ?? '—'}${b.listingCompany ? ` · ${b.listingCompany}` : ''}${b.listingLocation ? ` · ${b.listingLocation}` : ''}`,
    `Növ: ${b.jobType === 'ausbildung' ? 'Ausbildung' : b.jobType === 'job' ? 'İş' : '—'}`,
    `Link: ${b.listingUrl}`,
    '',
    `Ad: ${b.name}`,
    `Email: ${b.email}`,
    extra.phone ? `Telefon: ${extra.phone}` : null,
    `Peşə: ${b.profession}`,
    `Alman dili: ${b.germanLevel === 'none' ? 'yoxdur' : b.germanLevel}`,
    b.experienceYears !== undefined ? `Təcrübə: ${b.experienceYears} il` : null,
    `CV: ${extra.cvName ?? 'əlavə edilməyib'}`,
    extra.account ? `Hesab: ${extra.account}` : null,
    `Dil: ${extra.lng}`,
    b.message ? `\n${b.message}` : null,
  ].filter((l): l is string => l !== null);

export interface StoredCv {
  storedName: string;
  originalName: string;
  mime: string;
  size: number;
  /** Snapshot of this Lebenslauf version (attached from the portal). */
  lebenslaufVersionId?: string | null;
}

/**
 * Facts for the automatic sending, from data we can trust: the cached Arbeitnow feed (addresses and German level
 * stated in the ad) or, for any listing, an address in the pasted text that belongs to the listing's own site.
 */
export const listingFacts = async (b: Pick<ApplyInput, 'provider' | 'externalId' | 'listingUrl' | 'listingTitle' | 'message'>) => {
  const feed = b.provider === 'arbeitnow' && b.externalId ? await arbeitnowListingFacts(b.externalId) : null;
  const email = feed?.emails[0] ?? employerEmailFromText(b.message, b.listingUrl);
  const german = feed && isGermanLevel(feed.german) ? feed.german : parseGermanRequirement(b.listingTitle);
  return { employerEmail: email, requiredGerman: german };
};

/** Creates the lead + the listing row in one transaction. */
export const createExternalApplication = async (b: ApplyInput, ctx: { phone: string | null; lng: SeoLocale; cv: StoredCv | null; userId: string | null; partnerId: string | null; accountLabel: string | null }) => {
  const host = hostOf(b.listingUrl);
  const facts = await listingFacts(b);
  const message = summaryLines(b, { phone: ctx.phone, lng: ctx.lng, cvName: ctx.cv?.originalName ?? null, account: ctx.accountLabel }).join('\n');
  const now = new Date();
  const data: Prisma.InquiryCreateInput = {
    kind: 'contact',
    source: `external-job:${b.provider}${host ? `:${host}` : ''}`.slice(0, 80),
    contactName: b.name,
    email: b.email,
    phone: ctx.phone,
    sector: b.profession.slice(0, 120),
    message,
    locale: staffLocale(ctx.lng),
    partnerId: ctx.partnerId,
    // A signed-in client: the lead belongs to that account from the start.
    ...(ctx.userId ? { convertedUserId: ctx.userId, convertedAt: now } : {}),
    externalJob: {
      create: {
        provider: b.provider,
        externalId: b.externalId ?? null,
        listingUrl: b.listingUrl,
        listingTitle: b.listingTitle ?? null,
        listingCompany: b.listingCompany ?? null,
        listingLocation: b.listingLocation ?? null,
        jobType: b.jobType ?? null,
        germanLevel: b.germanLevel,
        profession: b.profession,
        experienceYears: b.experienceYears ?? null,
        userId: ctx.userId,
        cvStoredName: ctx.cv?.storedName ?? null,
        cvOriginalName: ctx.cv?.originalName.slice(0, 255) ?? null,
        cvMime: ctx.cv?.mime ?? null,
        cvSize: ctx.cv?.size ?? null,
        lebenslaufVersionId: ctx.cv?.lebenslaufVersionId ?? null,
        siteLocale: ctx.lng,
        forwardConsentAt: b.forwardConsent ? now : null,
        requiredGerman: facts.requiredGerman,
        employerEmail: facts.employerEmail,
        employerEmailSource: facts.employerEmail ? 'listing' : null,
        autoState: b.forwardConsent ? null : 'NO_CONSENT',
      },
    },
  };
  return prisma.inquiry.create({ data });
};

/**
 * GDPR: when a lead is anonymised its application details and the CV go too (the listing itself stays for
 * statistics). Never throws.
 */
export const clearExternalApplications = async (inquiryIds: string[], tx: Prisma.TransactionClient = prisma) => {
  if (!inquiryIds.length) return;
  try {
    const rows = await tx.externalJobApplication.findMany({ where: { inquiryId: { in: inquiryIds } }, select: { id: true, cvStoredName: true } });
    if (!rows.length) return;
    await tx.externalJobApplication.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: {
        germanLevel: null,
        profession: null,
        experienceYears: null,
        userId: null,
        cvStoredName: null,
        cvOriginalName: null,
        cvMime: null,
        cvSize: null,
        lebenslaufVersionId: null,
        statusNote: null,
        employerEmail: null,
        autoNotifiedKey: null,
        coverLetterSubject: null,
        coverLetterBody: null,
        coverLetterAt: null,
      },
    });
    // Staff notes to the client may name the person; the status steps stay for statistics.
    await tx.externalJobApplicationEvent.updateMany({ where: { applicationId: { in: rows.map((r) => r.id) } }, data: { note: null } });
    // Employer answers quote the person (name, CV): removed with the lead's data.
    await tx.externalJobApplicationReply.deleteMany({ where: { applicationId: { in: rows.map((r) => r.id) } } });
    for (const r of rows) if (r.cvStoredName) await fsp.unlink(cvPath(r.cvStoredName)).catch(() => undefined);
  } catch (err) {
    console.error('[germany-jobs] clearing application data failed', err);
  }
};

// ─── confirmation e-mail to the applicant ───────────────────────────

/** `nextAuto`: the applicant agreed to the forwarding, so the application goes on automatically (lib/germanyJobs/autoSend.ts). */
const MAIL: Record<SeoLocale, { subject: string; hello: (n: string) => string; body: (job: string) => string; next: string; nextAuto: string; cta: string }> = {
  az: {
    subject: 'Müraciətiniz qəbul edildi',
    hello: (n) => `Salam, ${n}!`,
    body: (job) => `"${job}" vakansiyasına Triad Vision vasitəsilə müraciətinizi aldıq.`,
    next: 'Komandamız elanı və məlumatlarınızı yoxlayacaq və 2 iş günü ərzində sizinlə əlaqə saxlayacaq. Bu müraciət hələ işəgötürənə göndərilməyib — növbəti addımları sizinlə birlikdə müəyyən edəcəyik.\n\nSualınız olarsa, bu məktuba cavab yazın.',
    nextAuto: 'Məlumatlarınızı avtomatik yoxlayırıq. Hər şey tamamdırsa, müraciətinizi Anschreiben və CV ilə birlikdə işəgötürənə göndəririk və sizə xəbər veririk. Nəsə çatışmırsa, nəyi əlavə etməli olduğunuzu yazacağıq.\n\nSualınız olarsa, bu məktuba cavab yazın.',
    cta: 'Digər vakansiyalar',
  },
  de: {
    subject: 'Ihre Bewerbung ist eingegangen',
    hello: (n) => `Hallo ${n},`,
    body: (job) => `wir haben Ihre Bewerbung über Triad Vision für „${job}“ erhalten.`,
    next: 'Unser Team prüft die Anzeige und Ihre Angaben und meldet sich innerhalb von 2 Werktagen bei Ihnen. Die Bewerbung wurde noch nicht an den Arbeitgeber geschickt — die nächsten Schritte besprechen wir mit Ihnen.\n\nBei Fragen antworten Sie einfach auf diese E-Mail.',
    nextAuto: 'Wir prüfen Ihre Angaben automatisch. Ist alles vollständig, senden wir Ihre Bewerbung mit Anschreiben und Lebenslauf an den Arbeitgeber und informieren Sie. Fehlt etwas, schreiben wir Ihnen, was noch nötig ist.\n\nBei Fragen antworten Sie einfach auf diese E-Mail.',
    cta: 'Weitere Stellen',
  },
  en: {
    subject: 'We received your application',
    hello: (n) => `Hello ${n},`,
    body: (job) => `we received your application via Triad Vision for "${job}".`,
    next: 'Our team will review the listing and your details and get back to you within 2 working days. Your application has not been sent to the employer yet — we will agree the next steps with you.\n\nIf you have questions, just reply to this e-mail.',
    nextAuto: 'We check your details automatically. If everything is complete, we send your application with cover letter and CV to the employer and let you know. If something is missing, we will tell you what is still needed.\n\nIf you have questions, just reply to this e-mail.',
    cta: 'More jobs',
  },
  ru: {
    subject: 'Ваша заявка получена',
    hello: (n) => `Здравствуйте, ${n}!`,
    body: (job) => `Мы получили вашу заявку через Triad Vision на вакансию «${job}».`,
    next: 'Наша команда проверит объявление и ваши данные и свяжется с вами в течение 2 рабочих дней. Заявка ещё не отправлена работодателю — следующие шаги мы согласуем с вами.\n\nЕсли есть вопросы, просто ответьте на это письмо.',
    nextAuto: 'Мы автоматически проверяем ваши данные. Если всё заполнено, мы отправим заявку с сопроводительным письмом и резюме работодателю и сообщим вам. Если чего-то не хватает, напишем, что нужно добавить.\n\nЕсли есть вопросы, просто ответьте на это письмо.',
    cta: 'Другие вакансии',
  },
  tr: {
    subject: 'Başvurunuz alındı',
    hello: (n) => `Merhaba ${n},`,
    body: (job) => `"${job}" ilanı için Triad Vision üzerinden yaptığınız başvuruyu aldık.`,
    next: 'Ekibimiz ilanı ve bilgilerinizi inceleyip 2 iş günü içinde sizinle iletişime geçecek. Başvurunuz henüz işverene gönderilmedi — sonraki adımları sizinle birlikte belirleyeceğiz.\n\nSorunuz olursa bu e-postayı yanıtlamanız yeterli.',
    nextAuto: 'Bilgilerinizi otomatik olarak kontrol ediyoruz. Her şey tamamsa başvurunuzu ön yazı ve özgeçmişle birlikte işverene gönderir ve size haber veririz. Eksik bir şey varsa neyin gerektiğini size yazarız.\n\nSorunuz olursa bu e-postayı yanıtlamanız yeterli.',
    cta: 'Diğer ilanlar',
  },
  uk: {
    subject: 'Вашу заявку отримано',
    hello: (n) => `Вітаємо, ${n}!`,
    body: (job) => `Ми отримали вашу заявку через Triad Vision на вакансію «${job}».`,
    next: 'Наша команда перевірить оголошення та ваші дані й зв’яжеться з вами протягом 2 робочих днів. Заявку ще не надіслано роботодавцю — наступні кроки ми погодимо з вами.\n\nЯкщо маєте запитання, просто дайте відповідь на цей лист.',
    nextAuto: 'Ми автоматично перевіряємо ваші дані. Якщо все заповнено, надішлемо заявку із супровідним листом і резюме роботодавцю та повідомимо вас. Якщо чогось бракує, напишемо, що потрібно додати.\n\nЯкщо маєте запитання, просто дайте відповідь на цей лист.',
    cta: 'Інші вакансії',
  },
};

export const confirmationSubject = (lng: SeoLocale) => `Triad Vision · ${MAIL[lng].subject}`;

/** Localised confirmation to the applicant (never throws). */
export const sendApplicantConfirmation = async (to: string, name: string, job: string, lng: SeoLocale, auto = false) => {
  try {
    const m = MAIL[lng];
    const prefix = lng === 'az' ? '' : `/${lng}`;
    const html = renderEmail(m.subject, `${m.hello(name)}\n\n${m.body(job)}\n\n${auto ? m.nextAuto : m.next}`, { label: m.cta, url: `${config.clientUrl}${prefix}/jobs/germany` });
    await sendMail(to, confirmationSubject(lng), html);
  } catch (err) {
    console.error('[germany-jobs] confirmation e-mail failed', err);
  }
};
