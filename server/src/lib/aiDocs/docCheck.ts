import fs from 'node:fs/promises';
import path from 'node:path';
import type { AiScope, Locale, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { notifyUser } from '../notifications.js';
import { aiComplete, CHEAP_MODEL } from '../ai/complete.js';
import { getAiSettings, resolveApiKey } from '../ai/settings.js';
import { filePart, isoDate, str, today } from './input.js';

/**
 * AI check of a case document (Document.checks.ai), next to the library-free upload checks of lib/docCheck.
 *
 * After a client upload the check runs in the background (scheduleAiDocCheck, fire-and-forget after the
 * response): the model reads the file (image, or the first pages of a PDF) and compares it with the
 * requirement it was uploaded for and the case. The answer is strict JSON, cleaned here, completed with two
 * deterministic rules (expiry within 6 months, name vs. profile with tolerant transliteration) and merged
 * into the existing checks JSON. Problems are told to the client in-app. Nothing is ever rejected
 * automatically: staff decide. When the AI call fails (limits, budget, timeout) `{ verdict: "skipped" }` is
 * stored silently. Staff can re-run it (ADMIN scope, cost on the staff member).
 */

export type AiVerdict = 'ok' | 'warn' | 'wrong_document' | 'unreadable';
export type Apostille = 'present' | 'missing' | 'not_needed' | 'unknown';
export const AI_LOCALES = ['az', 'de', 'en', 'ru'] as const;

export interface AiIssue {
  code: string;
  message_az: string;
  message_de: string;
  message_en: string;
  message_ru: string;
}

export interface AiFields {
  name?: string;
  birthDate?: string;
  documentNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  issuer?: string;
}

export type AiDocCheck =
  | {
      verdict: AiVerdict;
      documentType: string | null;
      language: string | null;
      issues: AiIssue[];
      fields: AiFields;
      apostille: Apostille;
      translationNeeded: boolean;
      at: string;
      by: 'auto' | 'staff';
      model: string;
      costUsd: number;
    }
  | { verdict: 'skipped'; reason: string; at: string; by: 'auto' | 'staff' };

export const PURPOSE = 'doc-check';
const VERDICTS: AiVerdict[] = ['ok', 'warn', 'wrong_document', 'unreadable'];
const APOSTILLE: Apostille[] = ['present', 'missing', 'not_needed', 'unknown'];
const MONTH_MS = 30.44 * 24 * 3600 * 1000;

// ─── Name comparison ─────────────────────────────────────────────────────

const TRANSLIT: Record<string, string> = {
  ə: 'a', ä: 'a', ş: 's', ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ü: 'u', ß: 'ss', x: 'h', q: 'g', w: 'v', y: 'i', j: 'c',
  а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'e', ә: 'a', ж: 'c', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'h', һ: 'h', ц: 'c', ч: 'c', ш: 's', щ: 's',
  ъ: '', ы: 'i', ь: '', э: 'e', ю: 'u', я: 'a',
};

/**
 * Consonant skeleton of a name, tolerant to Azerbaijani / German / Russian spellings:
 * "Məmmədov", "Mammadov", "Mamedov", "Мамедов" → "mmdv" → "mdv".
 */
export const nameSkeleton = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFC')
    .replace(/dzh|sch|sh|ch|kh|zh|gh|дж/g, (m) => ({ dzh: 'c', sch: 's', sh: 's', ch: 'c', kh: 'h', zh: 'c', gh: 'g', дж: 'c' })[m] ?? m)
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/[aeiou]/g, '')
    .replace(/(.)\1+/g, '$1');

/**
 * A name in plain Latin letters, vowels kept ("Əli" → "ali", "Лейла" → "leila", "Şahin" → "sahin"): for first
 * names, where the consonant skeleton is too coarse ("Leyla" and "Ali" both end up as "l").
 */
export const nameLatin = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFC')
    .replace(/dzh|sch|sh|ch|kh|zh|gh|дж/g, (m) => ({ dzh: 'c', sch: 's', sh: 's', ch: 'c', kh: 'h', zh: 'c', gh: 'g', дж: 'c' })[m] ?? m)
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');

/** True when the profile's last name appears in the name read from the document (any word order). */
export const nameMatches = (docName: string, profile: { firstName: string; lastName: string }) => {
  const last = nameSkeleton(profile.lastName);
  if (!last) return true;
  const words = docName.split(/[\s,/.-]+/).map(nameSkeleton).filter(Boolean);
  const whole = nameSkeleton(docName);
  return words.some((w) => w === last || (last.length >= 3 && w.startsWith(last)) || (w.length >= 3 && last.startsWith(w))) || whole.includes(last);
};

// ─── Static texts for the rules added here ──────────────────────────────

const RULE_TEXT: Record<'EXPIRED' | 'EXPIRES_SOON' | 'NAME_MISMATCH', Omit<AiIssue, 'code'>> = {
  EXPIRED: {
    message_az: 'Sənədin etibarlılıq müddəti bitib. Zəhmət olmasa etibarlı sənəd yükləyin.',
    message_de: 'Das Dokument ist abgelaufen. Bitte laden Sie ein gültiges Dokument hoch.',
    message_en: 'The document has expired. Please upload a valid document.',
    message_ru: 'Срок действия документа истёк. Загрузите действующий документ.',
  },
  EXPIRES_SOON: {
    message_az: 'Sənədin etibarlılıq müddəti 6 aydan az qalıb. Yenisini vaxtında hazırlayın.',
    message_de: 'Das Dokument ist weniger als 6 Monate gültig. Bitte rechtzeitig erneuern.',
    message_en: 'The document is valid for less than 6 months. Please renew it in time.',
    message_ru: 'Документ действителен менее 6 месяцев. Позаботьтесь о замене заранее.',
  },
  NAME_MISMATCH: {
    message_az: 'Sənəddəki ad profilinizdəki adla üst-üstə düşmür. Yoxlayın və lazım olsa düzəldin.',
    message_de: 'Der Name im Dokument passt nicht zu Ihrem Profil. Bitte prüfen.',
    message_en: 'The name on the document does not match your profile. Please check.',
    message_ru: 'Имя в документе не совпадает с профилем. Проверьте, пожалуйста.',
  },
};

const NOTICE_TITLE: Record<Locale, string> = {
  az: 'Sənədinizdə diqqət tələb edən məqam var',
  de: 'Ihr Dokument braucht Aufmerksamkeit',
  en: 'Your document needs attention',
  ru: 'Ваш документ требует внимания',
};

const NOTICE_WRONG: Record<Locale, string> = {
  az: 'Yüklədiyiniz fayl tələb olunan sənədə oxşamır.',
  de: 'Die hochgeladene Datei scheint nicht das verlangte Dokument zu sein.',
  en: 'The uploaded file does not look like the requested document.',
  ru: 'Загруженный файл не похож на требуемый документ.',
};

const NOTICE_UNREADABLE: Record<Locale, string> = {
  az: 'Sənəd oxunmur (bulanıq, qaranlıq və ya kəsik). Zəhmət olmasa aydın şəkil yükləyin.',
  de: 'Das Dokument ist nicht lesbar (unscharf, dunkel oder abgeschnitten). Bitte laden Sie ein klares Bild hoch.',
  en: 'The document is not readable (blurred, dark or cut off). Please upload a clear image.',
  ru: 'Документ не читается (размыт, тёмный или обрезан). Загрузите чёткое изображение.',
};

// ─── Parsing the model answer ───────────────────────────────────────────

const issueOf = (v: unknown): AiIssue | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const code = (str(o.code, 40) ?? 'OTHER').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  const msgs = AI_LOCALES.map((l) => str(o[`message_${l}`], 400));
  const fallback = msgs.find(Boolean);
  if (!fallback) return null;
  const [az, de, en, ru] = msgs.map((m) => m ?? fallback);
  return { code, message_az: az, message_de: de, message_en: en, message_ru: ru };
};

/** Cleans the model JSON; null when it is not usable at all. */
export const parseCheckAnswer = (json: Record<string, unknown>) => {
  const verdict = VERDICTS.includes(json.verdict as AiVerdict) ? (json.verdict as AiVerdict) : null;
  if (!verdict) return null;
  const f = (json.fields && typeof json.fields === 'object' ? json.fields : {}) as Record<string, unknown>;
  const fields: AiFields = {};
  const name = str(f.name, 160);
  if (name) fields.name = name;
  for (const k of ['birthDate', 'issueDate', 'expiryDate'] as const) {
    const d = isoDate(f[k]);
    if (d) fields[k] = d;
  }
  const num = str(f.documentNumber, 60);
  if (num) fields.documentNumber = num;
  const issuer = str(f.issuer, 160);
  if (issuer) fields.issuer = issuer;
  return {
    verdict,
    documentType: str(json.documentType, 120),
    language: str(json.language, 40),
    issues: (Array.isArray(json.issues) ? json.issues : []).map(issueOf).filter((i): i is AiIssue => !!i).slice(0, 6),
    fields,
    apostille: APOSTILLE.includes(json.apostille as Apostille) ? (json.apostille as Apostille) : 'unknown',
    translationNeeded: json.translationNeeded === true,
  };
};

/** The deterministic rules: expiry (< 6 months) and the name against the client profile. */
export const applyRules = (
  r: NonNullable<ReturnType<typeof parseCheckAnswer>>,
  profile: { firstName: string; lastName: string } | null,
  now = new Date(),
) => {
  const has = (...codes: string[]) => r.issues.some((i) => codes.includes(i.code));
  if (r.fields.expiryDate && r.verdict !== 'wrong_document') {
    const left = new Date(`${r.fields.expiryDate}T00:00:00Z`).getTime() - now.getTime();
    if (left < 0 && !has('EXPIRED')) r.issues.push({ code: 'EXPIRED', ...RULE_TEXT.EXPIRED });
    else if (left >= 0 && left < 6 * MONTH_MS && !has('EXPIRED', 'EXPIRES_SOON')) r.issues.push({ code: 'EXPIRES_SOON', ...RULE_TEXT.EXPIRES_SOON });
  }
  if (profile && r.fields.name && r.verdict !== 'wrong_document' && !has('NAME_MISMATCH') && !nameMatches(r.fields.name, profile)) {
    r.issues.push({ code: 'NAME_MISMATCH', ...RULE_TEXT.NAME_MISMATCH });
  }
  if (r.verdict === 'ok' && r.issues.length) r.verdict = 'warn';
  return r;
};

// ─── Prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `You check documents that visa applicants (mostly from Azerbaijan) upload for a German visa / work permit process.
Compare the file with the requirement it was uploaded for and the case. Reply with ONE JSON object only, no prose, no code fence:
{"verdict":"ok|warn|wrong_document|unreadable","documentType":"short English name of what the file is","language":"language of the document","issues":[{"code":"…","message_az":"…","message_de":"…","message_en":"…","message_ru":"…"}],"fields":{"name":"…","birthDate":"YYYY-MM-DD","documentNumber":"…","issueDate":"YYYY-MM-DD","expiryDate":"YYYY-MM-DD","issuer":"…"},"apostille":"present|missing|not_needed|unknown","translationNeeded":true|false}
Rules:
- ok = the requested document, readable, no problem; warn = right document with problems; wrong_document = clearly another document (e.g. ID card instead of passport); unreadable = too blurred, dark or cut off to read.
- Issue codes: APOSTILLE_MISSING, TRANSLATION_REQUIRED, NOT_SWORN_TRANSLATION, NAME_MISMATCH, EXPIRED, EXPIRES_SOON, WRONG_DOCUMENT, PAGES_MISSING, TOO_DARK, BLURRY, CUT_OFF, OTHER. At most 4 issues.
- Azerbaijani diplomas, transcripts, birth / marriage certificates and police clearances need an apostille for German authorities. Passports, ID cards, photos, CVs, language certificates: "not_needed".
- translationNeeded = true when the document is not in German (or English for certificates) and German authorities need it in German; a translation that is not a sworn translation (no translator stamp / declaration) is NOT_SWORN_TRANSLATION.
- Compare names leniently: ə=e/a, ş=sh/s, ç=ch/c, ğ=g/gh, ı=i, ö=o, ü=u, x=kh/h, Cyrillic transliterations are the same name.
- EXPIRED = expiry date before today; EXPIRES_SOON = within 6 months from today.
- Messages: one short plain sentence each (max 140 characters), addressed to the applicant, in Azerbaijani, German, English and Russian.
- Only include fields you can actually read; never guess.`;

const l10n = (v: unknown, l: 'de' | 'az') => {
  const t = (v ?? {}) as Partial<Record<Locale, string>>;
  return t[l] || t.en || t.az || '';
};

const loadForCheck = (docId: string) =>
  prisma.document.findUnique({
    where: { id: docId },
    include: {
      requirement: { select: { key: true, title: true, description: true } },
      case: {
        select: {
          id: true,
          clientId: true,
          visaType: true,
          profession: true,
          visaCategory: { select: { title: true, visaLabel: true } },
          client: { select: { firstName: true, lastName: true, birthDate: true, passportNumber: true, locale: true } },
        },
      },
    },
  });

type LoadedDoc = NonNullable<Awaited<ReturnType<typeof loadForCheck>>>;

const promptFor = (doc: LoadedDoc, pages: number, now: Date) => {
  const c = doc.case;
  const r = doc.requirement;
  const lines = [
    `Today: ${today(now)}`,
    r
      ? `Requirement: "${l10n(r.title, 'de')}" / "${l10n(r.title, 'az')}"${r.key ? ` (key ${r.key})` : ''}`
      : `Requirement: none (stage ${doc.stage})`,
    r?.description ? `Requirement description: ${l10n(r.description, 'de').slice(0, 500)} / ${l10n(r.description, 'az').slice(0, 500)}` : '',
    `Case: visa type ${c.visaType}${c.visaCategory ? `, category ${c.visaCategory.visaLabel} ${l10n(c.visaCategory.title, 'de')}` : ''}, profession ${c.profession}`,
    `Applicant profile: ${c.client.firstName} ${c.client.lastName}${c.client.birthDate ? `, born ${c.client.birthDate.toISOString().slice(0, 10)}` : ''}${c.client.passportNumber ? `, passport ${c.client.passportNumber}` : ''}`,
    `File: ${doc.originalName} (${doc.mimeType}${doc.mimeType === 'application/pdf' ? `, first ${pages} page(s)` : ''})`,
  ];
  return lines.filter(Boolean).join('\n');
};

// ─── Storing ────────────────────────────────────────────────────────────

/** Current AI result of a stored checks JSON (null when there is none). */
export const aiOf = (checks: unknown): AiDocCheck | null => {
  const ai = checks && typeof checks === 'object' ? (checks as { ai?: unknown }).ai : null;
  return ai && typeof ai === 'object' && typeof (ai as { verdict?: unknown }).verdict === 'string' ? (ai as AiDocCheck) : null;
};

/** Merges `ai` into the document's checks JSON (re-read right before the write, other keys kept). */
const storeAi = async (docId: string, ai: AiDocCheck) => {
  try {
    const row = await prisma.document.findUnique({ where: { id: docId }, select: { checks: true } });
    if (!row) return false;
    const current = row.checks && typeof row.checks === 'object' && !Array.isArray(row.checks) ? (row.checks as Record<string, unknown>) : {};
    await prisma.document.update({ where: { id: docId }, data: { checks: { ...current, ai } as unknown as Prisma.InputJsonValue } });
    return true;
  } catch {
    return false; // deleted meanwhile
  }
};

const skipped = (reason: string, by: 'auto' | 'staff'): AiDocCheck => ({ verdict: 'skipped', reason, at: new Date().toISOString(), by });

const notifyClient = async (doc: LoadedDoc, ai: Extract<AiDocCheck, { issues: AiIssue[] }>) => {
  const locale = doc.case.client.locale;
  const key = `message_${locale}` as keyof AiIssue;
  const lines = ai.issues.slice(0, 3).map((i) => i[key]);
  if (!lines.length) lines.push(ai.verdict === 'unreadable' ? NOTICE_UNREADABLE[locale] : NOTICE_WRONG[locale]);
  else if (ai.verdict === 'wrong_document' && !ai.issues.some((i) => i.code === 'WRONG_DOCUMENT')) lines.unshift(NOTICE_WRONG[locale]);
  await notifyUser(doc.case.clientId, {
    type: 'DOCUMENT_CHECK',
    title: NOTICE_TITLE[locale],
    body: `${doc.originalName}: ${lines.join(' ')}`.slice(0, 900),
    link: `/account/cases/${doc.case.id}`,
    caseId: doc.case.id,
    email: false,
  });
};

/**
 * Runs the AI check of one document and stores it in `checks.ai`. `payer` books the cost (the uploading
 * client in CLIENT scope, or the staff member in ADMIN scope for a re-check). Never throws.
 */
export const runAiDocCheck = async (
  docId: string,
  payer: { userId: string; scope: AiScope },
  by: 'auto' | 'staff',
  opts: { now?: Date; timeoutMs?: number } = {},
): Promise<AiDocCheck | null> => {
  const now = opts.now ?? new Date();
  try {
    const doc = await loadForCheck(docId);
    if (!doc) return null;
    let buf: Buffer;
    try {
      buf = await fs.readFile(path.join(config.uploads.privateDir, path.basename(doc.storedName)));
    } catch {
      const s = skipped('FILE_MISSING', by);
      await storeAi(docId, s);
      return s;
    }
    const part = await filePart(buf, doc.mimeType, doc.originalName);
    if (!part.ok) {
      const s = skipped(part.reason, by);
      await storeAi(docId, s);
      return s;
    }
    const res = await aiComplete({
      userId: payer.userId,
      scope: payer.scope,
      purpose: PURPOSE,
      model: CHEAP_MODEL,
      system: SYSTEM,
      input: [{ type: 'text', text: promptFor(doc, part.pages, now) }, ...part.parts],
      maxTokens: 900,
      json: true,
      timeoutMs: opts.timeoutMs ?? 25_000,
    });
    const parsed = res.ok && res.json ? parseCheckAnswer(res.json) : null;
    if (!res.ok || !parsed) {
      const s = skipped(res.ok ? 'BAD_OUTPUT' : res.reason, by);
      await storeAi(docId, s);
      return s;
    }
    const r = applyRules(parsed, doc.case.client, now);
    const ai: AiDocCheck = { ...r, at: now.toISOString(), by, model: res.model, costUsd: res.costUsd };
    const stored = await storeAi(docId, ai);
    if (stored && by === 'auto' && r.verdict !== 'ok' && doc.uploadedById === doc.case.clientId) {
      await notifyClient(doc, ai).catch((err) => console.error('[aiDocs] notification failed', err));
    }
    return ai;
  } catch (err) {
    console.error('[aiDocs] document check failed', err);
    const s = skipped('ERROR', by);
    await storeAi(docId, s);
    return s;
  }
};

// ─── Background scheduling ──────────────────────────────────────────────

const running = new Set<Promise<void>>();
/** The scheduled check of each document while it runs (smart uploads wait for it to reuse its result). */
const runningByDoc = new Map<string, Promise<void>>();

/** Resolves when the scheduled AI check of this document (if any) finished. */
export const aiDocCheckSettled = async (docId: string) => {
  await runningByDoc.get(docId);
};

/**
 * Replaceable switch: the automatic check is off in the test environment (other e2e files upload documents
 * without a fake transport), the AI document tests turn it on.
 */
export const aiDocCheckDeps = { autoEnabled: () => !config.isTest };

/**
 * Fire-and-forget AI check after a client upload (call it after sending the response). Does nothing when
 * the check is switched off in the AI settings or no OpenRouter key is configured.
 */
export const scheduleAiDocCheck = (docId: string) => {
  const p: Promise<void> = (async () => {
    await new Promise((r) => setImmediate(r));
    if (!aiDocCheckDeps.autoEnabled()) return;
    const settings = await getAiSettings();
    if (!settings.docCheckEnabled || !resolveApiKey(settings)) return;
    const doc = await prisma.document.findUnique({ where: { id: docId }, select: { uploadedById: true } });
    if (!doc) return;
    await runAiDocCheck(docId, { userId: doc.uploadedById, scope: 'CLIENT' }, 'auto');
  })()
    .catch((err) => console.error('[aiDocs] scheduled check failed', err))
    .finally(() => {
      running.delete(p);
      if (runningByDoc.get(docId) === p) runningByDoc.delete(docId);
    });
  running.add(p);
  runningByDoc.set(docId, p);
};

/** Resolves once every scheduled check finished (tests, graceful shutdown). */
export const waitForAiDocChecks = async () => {
  while (running.size) await Promise.allSettled([...running]);
};
