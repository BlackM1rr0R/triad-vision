import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest } from '../http.js';
import { escapeHtml, pick } from '../seo.js';
import { SEO_LOCALES, type SeoLocale } from '../seoCatalogue.js';
import { renderEmail, sendMail } from '../mailer.js';

/**
 * E-book lead magnets (model LeadMagnet): a PDF per site language behind an e-mail form (/ebook/:slug and an
 * inline block other pages embed).
 *
 * Files: <uploads>/private/lead-magnets/<key>.pdf, never public. LeadMagnet.files maps a language to its key.
 * The visitor gets an e-mail with a signed link (HMAC of magnet id, language and expiry, 7 days); the link
 * streams the PDF of that language (falling back like the CMS texts: tr / uk → en → az → any language).
 */

export const LEAD_MAGNET_DIR = path.join(config.uploads.privateDir, 'lead-magnets');
fs.mkdirSync(LEAD_MAGNET_DIR, { recursive: true });

export const LEAD_MAGNET_PDF_MAX = 30 * 1024 * 1024;
export const DOWNLOAD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const filePath = (key: string) => path.join(LEAD_MAGNET_DIR, path.basename(key));

/** PDF upload (admin): streamed to the lead-magnet folder, content-checked by the route afterwards. */
export const leadMagnetUpload = multer({
  storage: multer.diskStorage({
    destination: LEAD_MAGNET_DIR,
    filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(10).toString('hex')}.pdf`),
  }),
  limits: { fileSize: LEAD_MAGNET_PDF_MAX, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8').toLowerCase();
    if (file.mimetype === 'application/pdf' || name.endsWith('.pdf')) {
      file.mimetype = 'application/pdf';
      cb(null, true);
    } else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
});

export const removeFile = (key: string | null | undefined) => (key ? fsp.unlink(filePath(key)).catch(() => undefined) : Promise.resolve());

/** { az: "key.pdf", … } of a stored LeadMagnet.files value (invalid entries dropped). */
export const filesOf = (raw: unknown): Partial<Record<SeoLocale, string>> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (e): e is [SeoLocale, string] => (SEO_LOCALES as readonly string[]).includes(e[0]) && typeof e[1] === 'string' && /^[\w.-]{1,120}\.pdf$/.test(e[1]),
    ),
  );
};

/** The language whose file is delivered for `lng` (own → en → az → any), or null when there is no file. */
export const fileLocaleFor = (files: Partial<Record<SeoLocale, string>>, lng: SeoLocale): SeoLocale | null => {
  for (const l of [lng, 'en', 'az', ...SEO_LOCALES] as SeoLocale[]) if (files[l]) return l;
  return null;
};

// ─── Signed download links ─────────────────────────────────────────────

const sign = (payload: string) => crypto.createHmac('sha256', config.jwtSecret).update(`lead-magnet-download:${payload}`).digest('base64url').slice(0, 32);

/** "<magnetId>.<lng>.<expiry base36>.<sig>" */
export const downloadToken = (magnetId: string, lng: SeoLocale, now = Date.now()) => {
  const payload = `${magnetId}.${lng}.${(now + DOWNLOAD_TTL_MS).toString(36)}`;
  return `${payload}.${sign(payload)}`;
};

/** The magnet and language of a valid, unexpired token, else null (constant-time signature compare). */
export const verifyDownloadToken = (token: unknown, now = Date.now()): { magnetId: string; lng: SeoLocale } | null => {
  if (typeof token !== 'string' || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [magnetId, lng, exp, sig] = parts;
  const want = Buffer.from(sign(`${magnetId}.${lng}.${exp}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  if (!(SEO_LOCALES as readonly string[]).includes(lng)) return null;
  const expiry = parseInt(exp, 36);
  if (!Number.isFinite(expiry) || expiry < now) return null;
  return { magnetId, lng: lng as SeoLocale };
};

export const downloadUrl = (token: string) => `${config.clientUrl}/api/lead-magnets/download/${encodeURIComponent(token)}`;

// ─── Public shape ──────────────────────────────────────────────────────

export interface LeadMagnetRow {
  id: string;
  slug: string;
  title: unknown;
  description: unknown;
  coverUrl: string | null;
  files: unknown;
  published: boolean;
  downloads: number;
}

export const publicMagnet = (m: LeadMagnetRow, lng: SeoLocale) => {
  const files = filesOf(m.files);
  return {
    slug: m.slug,
    title: pick(m.title, lng),
    description: pick(m.description, lng),
    coverUrl: m.coverUrl,
    /** Languages with their own PDF. */
    locales: Object.keys(files),
    /** Language of the PDF this visitor would receive. */
    fileLocale: fileLocaleFor(files, lng),
  };
};

// ─── E-mail ─────────────────────────────────────────────────────────────

const MAIL: Record<SeoLocale, { subject: (t: string) => string; hello: (n: string) => string; body: string; cta: string; footer: string }> = {
  az: {
    subject: (t) => `E-kitabınız: ${t}`,
    hello: (n) => `Salam, ${n}!`,
    body: 'Sorğunuz üçün təşəkkür edirik. E-kitabı aşağıdakı düymə ilə PDF kimi yükləyə bilərsiniz. Link 7 gün etibarlıdır.\n\nSuallarınız olarsa, bu məktuba cavab yazın və ya pulsuz konsultasiya təyin edin: triad-vision.de/booking',
    cta: 'PDF-i yüklə',
    footer: 'Bu məktubu triad-vision.de saytında e-kitab istədiyiniz üçün alırsınız.',
  },
  de: {
    subject: (t) => `Ihr E-Book: ${t}`,
    hello: (n) => `Hallo ${n},`,
    body: 'vielen Dank für Ihre Anfrage. Über den Button unten laden Sie das E-Book als PDF herunter. Der Link ist 7 Tage gültig.\n\nBei Fragen antworten Sie einfach auf diese E-Mail oder buchen Sie eine kostenlose Beratung: triad-vision.de/de/booking',
    cta: 'PDF herunterladen',
    footer: 'Sie erhalten diese E-Mail, weil Sie das E-Book auf triad-vision.de angefordert haben.',
  },
  en: {
    subject: (t) => `Your e-book: ${t}`,
    hello: (n) => `Hello ${n},`,
    body: 'thank you for your request. Use the button below to download the e-book as a PDF. The link is valid for 7 days.\n\nIf you have questions, just reply to this e-mail or book a free consultation: triad-vision.de/en/booking',
    cta: 'Download the PDF',
    footer: 'You receive this e-mail because you requested the e-book on triad-vision.de.',
  },
  ru: {
    subject: (t) => `Ваша электронная книга: ${t}`,
    hello: (n) => `Здравствуйте, ${n}!`,
    body: 'Спасибо за запрос. Скачайте электронную книгу в PDF по кнопке ниже. Ссылка действует 7 дней.\n\nЕсли есть вопросы, просто ответьте на это письмо или запишитесь на бесплатную консультацию: triad-vision.de/ru/booking',
    cta: 'Скачать PDF',
    footer: 'Вы получили это письмо, потому что запросили электронную книгу на triad-vision.de.',
  },
  tr: {
    subject: (t) => `E-kitabınız: ${t}`,
    hello: (n) => `Merhaba ${n},`,
    body: 'talebiniz için teşekkür ederiz. Aşağıdaki düğmeyle e-kitabı PDF olarak indirebilirsiniz. Bağlantı 7 gün geçerlidir.\n\nSorularınız varsa bu e-postayı yanıtlayın veya ücretsiz danışmanlık alın: triad-vision.de/tr/booking',
    cta: 'PDF\'yi indir',
    footer: 'Bu e-postayı triad-vision.de üzerinden e-kitap talep ettiğiniz için alıyorsunuz.',
  },
  uk: {
    subject: (t) => `Ваша електронна книга: ${t}`,
    hello: (n) => `Вітаємо, ${n}!`,
    body: 'Дякуємо за запит. Завантажте електронну книгу у PDF за кнопкою нижче. Посилання дійсне 7 днів.\n\nЯкщо маєте запитання, просто дайте відповідь на цей лист або запишіться на безкоштовну консультацію: triad-vision.de/uk/booking',
    cta: 'Завантажити PDF',
    footer: 'Ви отримали цей лист, бо запросили електронну книгу на triad-vision.de.',
  },
};

export const sendDownloadMail = async (to: string, name: string, title: string, lng: SeoLocale, token: string) => {
  const m = MAIL[lng];
  const html = renderEmail(m.subject(title), `${m.hello(name)}\n\n${m.body}`, { label: m.cta, url: downloadUrl(token) }, {
    html: `<p style="margin:18px 0 0;font-size:12px;color:#5b6b88">${escapeHtml(m.footer)}</p>`,
  });
  await sendMail(to, m.subject(title), html);
};

// ─── Admin input ────────────────────────────────────────────────────────

const text = (max: number) => z.string().trim().max(max);
/** az/de/en/ru required (az at least non-empty), tr/uk optional (fall back to English). */
export const magnetL10n = (max: number) =>
  z
    .object({ az: text(max), de: text(max), en: text(max), ru: text(max), tr: text(max).optional(), uk: text(max).optional() })
    .refine((v) => !!v.az, 'AZ_REQUIRED');

export const magnetInput = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: magnetL10n(200),
  description: magnetL10n(1000).nullable().optional(),
  coverUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === '' || /^(https?:\/\/[^\s]+|\/[^\s]*)$/i.test(v), 'INVALID_URL')
    .nullable()
    .optional(),
  published: z.boolean().optional(),
});

export const adminMagnet = (m: LeadMagnetRow & { createdAt: Date; updatedAt: Date }) => ({ ...m, files: filesOf(m.files) });

export const findMagnet = (slug: string) => prisma.leadMagnet.findUnique({ where: { slug: slug.toLowerCase() } });
