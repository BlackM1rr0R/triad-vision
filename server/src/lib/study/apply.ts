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
import { renderEmail, sendMail } from '../mailer.js';
import type { SeoLocale } from '../seoCatalogue.js';
import { visitorIdSchema } from '../marketing/leadScoring.js';
import { siteLocale, staffLocale } from '../germanyJobs/apply.js';

/**
 * "Apply via Triad Vision" for a catalogue programme (POST /api/study/programmes/:slug/apply, multipart). Stored
 * as an Inquiry (kind "contact", source "study-programme:<slug>") in the staff inbox with scoring, owner and
 * conversion; the study facts and the optional CV / diploma sit in StudyApplication next to it.
 */

export { siteLocale };

/** CV and diploma: PDF, Word or a photo / scan (JPEG, PNG); bytes are verified after the upload. */
export const STUDY_FILE_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);

export const studyUpload = multer({
  storage: multer.diskStorage({
    destination: config.uploads.privateDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, `study-${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: config.uploads.maxFileSize, files: 2, fields: 40 },
  fileFilter: (_req, file, cb) => {
    const mime = resolveMime(file.mimetype, decodeOriginalName(file.originalname));
    if (mime && STUDY_FILE_MIME.has(mime)) {
      file.mimetype = mime;
      cb(null, true);
    } else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
});

export const studyFilePath = (storedName: string) => path.join(config.uploads.privateDir, path.basename(storedName));

export const CURRENT_DEGREES = ['SCHOOL', 'BACHELOR', 'MASTER', 'OTHER'] as const;
export const CERTIFICATES = ['IELTS', 'TOEFL', 'CAMBRIDGE', 'PTE', 'DUOLINGO', 'TESTDAF', 'DSH', 'GOETHE', 'TELC', 'OTHER', 'NONE'] as const;

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

/** Multipart fields (all strings). */
export const studyApplyInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(190),
  phone: z.string().trim().min(1).max(40),
  currentDegree: z.enum(CURRENT_DEGREES),
  fieldOfStudy: opt(160),
  gpa: opt(40),
  languageCertificate: z.enum(CERTIFICATES),
  languageLevel: opt(40),
  desiredIntake: z
    .string()
    .trim()
    .regex(/^(WINTER|SUMMER)-20\d{2}$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  message: opt(3000),
  consent: z.enum(['true', '1', 'on'], { errorMap: () => ({ message: 'CONSENT_REQUIRED' }) }),
  lng: z.string().optional(),
  // honeypot: real users never fill this hidden field
  website: z.string().max(200).optional(),
  visitorId: visitorIdSchema.optional().catch(undefined),
});
export type StudyApplyInput = z.infer<typeof studyApplyInput>;

export interface StoredFile {
  storedName: string;
  originalName: string;
  mime: string;
  size: number;
}

export interface ProgrammeRef {
  id: string;
  slug: string;
  name: string;
  university: string;
  city: string;
  degree: string;
}

const DEGREE_AZ: Record<string, string> = { SCHOOL: 'Orta məktəb', BACHELOR: 'Bakalavr', MASTER: 'Magistr', OTHER: 'Digər' };
const intakeAz = (v: string | undefined) => {
  if (!v) return '—';
  const [kind, year] = v.split('-');
  return kind === 'WINTER' ? `Qış semestri ${year}/${String(Number(year) + 1).slice(2)}` : `Yay semestri ${year}`;
};

/** Staff-facing summary (Azerbaijani, like the other lead notices) — also the Inquiry message. */
export const studySummary = (p: ProgrammeRef, b: StudyApplyInput, extra: { phone: string | null; lng: SeoLocale; cv: string | null; diploma: string | null; account: string | null }) =>
  [
    'Təhsil proqramına müraciət (Almaniyada təhsil kataloqu)',
    `Proqram: ${p.name}`,
    `Universitet: ${p.university} · ${p.city}`,
    `Səhifə: ${config.clientUrl}/study/${p.slug}`,
    '',
    `Ad: ${b.name}`,
    `Email: ${b.email}`,
    extra.phone ? `Telefon: ${extra.phone}` : null,
    `Hazırkı təhsil: ${DEGREE_AZ[b.currentDegree]}${b.fieldOfStudy ? ` · ${b.fieldOfStudy}` : ''}`,
    b.gpa ? `Orta bal (GPA): ${b.gpa}` : null,
    `Dil sertifikatı: ${b.languageCertificate === 'NONE' ? 'yoxdur' : b.languageCertificate}${b.languageLevel ? ` · ${b.languageLevel}` : ''}`,
    `İstədiyi semestr: ${intakeAz(b.desiredIntake)}`,
    `CV: ${extra.cv ?? 'əlavə edilməyib'}`,
    `Diplom: ${extra.diploma ?? 'əlavə edilməyib'}`,
    extra.account ? `Hesab: ${extra.account}` : null,
    `Dil: ${extra.lng}`,
    b.message ? `\n${b.message}` : null,
  ].filter((l): l is string => l !== null);

/** Creates the lead + the study details in one write. */
export const createStudyApplication = async (
  p: ProgrammeRef,
  b: StudyApplyInput,
  ctx: { phone: string | null; lng: SeoLocale; cv: StoredFile | null; diploma: StoredFile | null; userId: string | null; partnerId: string | null; accountLabel: string | null },
) => {
  const now = new Date();
  const message = studySummary(p, b, { phone: ctx.phone, lng: ctx.lng, cv: ctx.cv?.originalName ?? null, diploma: ctx.diploma?.originalName ?? null, account: ctx.accountLabel }).join('\n');
  const data: Prisma.InquiryCreateInput = {
    kind: 'contact',
    source: `study-programme:${p.slug}`.slice(0, 80),
    contactName: b.name,
    email: b.email,
    phone: ctx.phone,
    sector: `Təhsil: ${p.name}`.slice(0, 120),
    message,
    locale: staffLocale(ctx.lng),
    partnerId: ctx.partnerId,
    ...(ctx.userId ? { convertedUserId: ctx.userId, convertedAt: now } : {}),
    studyApplication: {
      create: {
        programme: { connect: { id: p.id } },
        programmeSlug: p.slug,
        programmeName: p.name.slice(0, 250),
        university: p.university.slice(0, 200),
        currentDegree: b.currentDegree,
        fieldOfStudy: b.fieldOfStudy ?? null,
        gpa: b.gpa ?? null,
        languageCertificate: b.languageCertificate,
        languageLevel: b.languageLevel ?? null,
        desiredIntake: b.desiredIntake ?? null,
        userId: ctx.userId,
        cvStoredName: ctx.cv?.storedName ?? null,
        cvOriginalName: ctx.cv?.originalName.slice(0, 255) ?? null,
        cvMime: ctx.cv?.mime ?? null,
        cvSize: ctx.cv?.size ?? null,
        diplomaStoredName: ctx.diploma?.storedName ?? null,
        diplomaOriginalName: ctx.diploma?.originalName.slice(0, 255) ?? null,
        diplomaMime: ctx.diploma?.mime ?? null,
        diplomaSize: ctx.diploma?.size ?? null,
      },
    },
  };
  return prisma.inquiry.create({ data });
};

/** GDPR: when a lead is anonymised its study details and the uploaded files go too (the programme link stays). Never throws. */
export const clearStudyApplications = async (inquiryIds: string[], tx: Prisma.TransactionClient = prisma) => {
  if (!inquiryIds.length) return;
  try {
    const rows = await tx.studyApplication.findMany({ where: { inquiryId: { in: inquiryIds } }, select: { id: true, cvStoredName: true, diplomaStoredName: true } });
    if (!rows.length) return;
    await tx.studyApplication.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: {
        currentDegree: null,
        fieldOfStudy: null,
        gpa: null,
        languageCertificate: null,
        languageLevel: null,
        userId: null,
        cvStoredName: null,
        cvOriginalName: null,
        cvMime: null,
        cvSize: null,
        diplomaStoredName: null,
        diplomaOriginalName: null,
        diplomaMime: null,
        diplomaSize: null,
      },
    });
    for (const r of rows) {
      for (const f of [r.cvStoredName, r.diplomaStoredName]) if (f) await fsp.unlink(studyFilePath(f)).catch(() => undefined);
    }
  } catch (err) {
    console.error('[study] clearing application data failed', err);
  }
};

// ─── confirmation e-mail to the applicant ───────────────────────────

const MAIL: Record<SeoLocale, { subject: string; hello: (n: string) => string; body: (p: string, u: string) => string; next: string; cta: string }> = {
  az: {
    subject: 'Təhsil müraciətiniz qəbul edildi',
    hello: (n) => `Salam, ${n}!`,
    body: (p, u) => `${u} universitetinin "${p}" proqramı üçün Triad Vision vasitəsilə müraciətinizi aldıq.`,
    next: 'Komandamız sənədlərinizi və proqramın tələblərini yoxlayacaq və 2 iş günü ərzində sizinlə əlaqə saxlayacaq. Müraciət hələ universitetə göndərilməyib — növbəti addımları (sənədlər, dil sertifikatı, son tarix) sizinlə birlikdə planlaşdıracağıq.\n\nSualınız olarsa, bu məktuba cavab yazın.',
    cta: 'Digər proqramlar',
  },
  de: {
    subject: 'Ihre Studienanfrage ist eingegangen',
    hello: (n) => `Hallo ${n},`,
    body: (p, u) => `wir haben Ihre Anfrage über Triad Vision für den Studiengang „${p}“ an der ${u} erhalten.`,
    next: 'Unser Team prüft Ihre Unterlagen und die Zulassungsvoraussetzungen und meldet sich innerhalb von 2 Werktagen bei Ihnen. Die Bewerbung wurde noch nicht an die Hochschule geschickt — die nächsten Schritte (Unterlagen, Sprachnachweis, Frist) planen wir gemeinsam mit Ihnen.\n\nBei Fragen antworten Sie einfach auf diese E-Mail.',
    cta: 'Weitere Studiengänge',
  },
  en: {
    subject: 'We received your study application',
    hello: (n) => `Hello ${n},`,
    body: (p, u) => `we received your application via Triad Vision for "${p}" at ${u}.`,
    next: 'Our team will review your documents and the admission requirements and get back to you within 2 working days. Nothing has been sent to the university yet — we will plan the next steps (documents, language certificate, deadline) with you.\n\nIf you have questions, just reply to this e-mail.',
    cta: 'More programmes',
  },
  ru: {
    subject: 'Ваша заявка на обучение получена',
    hello: (n) => `Здравствуйте, ${n}!`,
    body: (p, u) => `Мы получили вашу заявку через Triad Vision на программу «${p}» (${u}).`,
    next: 'Наша команда проверит ваши документы и требования к поступлению и свяжется с вами в течение 2 рабочих дней. В университет пока ничего не отправлено — следующие шаги (документы, языковой сертификат, срок подачи) мы спланируем вместе с вами.\n\nЕсли есть вопросы, просто ответьте на это письмо.',
    cta: 'Другие программы',
  },
  tr: {
    subject: 'Eğitim başvurunuz alındı',
    hello: (n) => `Merhaba ${n},`,
    body: (p, u) => `${u} bünyesindeki "${p}" programı için Triad Vision üzerinden yaptığınız başvuruyu aldık.`,
    next: 'Ekibimiz belgelerinizi ve kabul şartlarını inceleyip 2 iş günü içinde sizinle iletişime geçecek. Başvurunuz henüz üniversiteye gönderilmedi — sonraki adımları (belgeler, dil sertifikası, son başvuru tarihi) sizinle birlikte planlayacağız.\n\nSorunuz olursa bu e-postayı yanıtlamanız yeterli.',
    cta: 'Diğer programlar',
  },
  uk: {
    subject: 'Вашу заявку на навчання отримано',
    hello: (n) => `Вітаємо, ${n}!`,
    body: (p, u) => `Ми отримали вашу заявку через Triad Vision на програму «${p}» (${u}).`,
    next: 'Наша команда перевірить ваші документи та вимоги до вступу й зв’яжеться з вами протягом 2 робочих днів. До університету ще нічого не надіслано — наступні кроки (документи, мовний сертифікат, строк подання) ми сплануємо разом із вами.\n\nЯкщо маєте запитання, просто дайте відповідь на цей лист.',
    cta: 'Інші програми',
  },
};

export const studyConfirmationSubject = (lng: SeoLocale) => `Triad Vision · ${MAIL[lng].subject}`;

/** Localised confirmation to the applicant (never throws). */
export const sendStudyConfirmation = async (to: string, name: string, p: ProgrammeRef, lng: SeoLocale) => {
  try {
    const m = MAIL[lng];
    const prefix = lng === 'az' ? '' : `/${lng}`;
    const html = renderEmail(m.subject, `${m.hello(name)}\n\n${m.body(p.name, p.university)}\n\n${m.next}`, { label: m.cta, url: `${config.clientUrl}${prefix}/study` });
    await sendMail(to, studyConfirmationSubject(lng), html);
  } catch (err) {
    console.error('[study] confirmation e-mail failed', err);
  }
};
