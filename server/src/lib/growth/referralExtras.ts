import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { config } from '../../config.js';
import { badRequest } from '../http.js';
import { readSetting } from './settings.js';

/**
 * Client referral programme — sharing helpers:
 * - personal landing page /r/<slug> (slug rules, the photo store),
 * - ready share messages per profession (Setting "growthReferralTemplates", staff-editable),
 * - the programme terms page (Setting "growthReferralTerms", admin-editable).
 * Reads fall back to the defaults when a row is missing or malformed.
 */

export const REFERRAL_EXTRA_KEYS = { templates: 'growthReferralTemplates', terms: 'growthReferralTerms' } as const;

const l10n = (max: number) => z.object({ az: z.string().max(max), de: z.string().max(max), en: z.string().max(max), ru: z.string().max(max) });
type L10n = { az: string; de: string; en: string; ru: string };

// ─── Landing page slug ─────────────────────────────────────────────────

const TRANSLIT: Record<string, string> = { ə: 'e', ı: 'i', ö: 'o', ü: 'u', ğ: 'g', ş: 's', ç: 'c', ä: 'ae', ß: 'ss' };
/** Words that could pass for an official page. */
const RESERVED = new Set(['admin', 'api', 'app', 'login', 'register', 'support', 'help', 'staff', 'team', 'official', 'triad', 'triadvision', 'triad-vision', 'agent', 'partner', 'review', 'null', 'undefined']);

/**
 * The slug as stored: lower case a–z, 0–9 and single dashes, 3–40 characters (Azerbaijani letters are
 * transliterated, spaces become dashes). Returns null when the result is invalid or reserved.
 */
export const normaliseSlug = (raw: string) => {
  const s = raw
    .trim()
    .toLocaleLowerCase('az')
    .replace(/[əıöüğşçäß]/g, (c) => TRANSLIT[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s_.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (s.length < 3 || s.length > 40 || RESERVED.has(s) || /^tv[a-z0-9]{6}$/.test(s)) return null;
  return s;
};

export const landingSchema = z.object({
  enabled: z.boolean(),
  slug: z.string().trim().max(60).nullable().optional(),
  quote: z.string().trim().max(280).nullable().optional(),
});

const photoDir = () => path.join(config.uploads.publicDir, 'referral');

/** Stores the landing photo: square 512 px JPEG, re-encoded so EXIF (GPS, camera) is dropped. Returns the URL. */
export const storeLandingPhoto = async (buf: Buffer) => {
  let jpg: Buffer;
  try {
    jpg = await sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize(512, 512, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    throw badRequest('INVALID_IMAGE');
  }
  await fs.mkdir(photoDir(), { recursive: true });
  const name = `${crypto.randomBytes(16).toString('hex')}.jpg`;
  await fs.writeFile(path.join(photoDir(), name), jpg);
  return `/uploads/referral/${name}`;
};

/** Deletes a stored landing photo (only files inside /uploads/referral/). */
export const removeLandingPhoto = async (url: string | null | undefined) => {
  const m = /^\/uploads\/referral\/([a-f0-9]{32}\.jpg)$/.exec(url ?? '');
  if (m) await fs.unlink(path.join(photoDir(), m[1])).catch(() => undefined);
};

// ─── Share templates per profession ────────────────────────────────────

export const templatesSchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string().trim().regex(/^[a-z0-9-]{2,30}$/),
        label: l10n(80),
        text: l10n(1000),
      }),
    )
    .max(30)
    .refine((t) => new Set(t.map((x) => x.key)).size === t.length, 'DUPLICATE_KEY'),
});
export type ReferralTemplates = z.infer<typeof templatesSchema>;

const tpl = (key: string, label: L10n, text: L10n) => ({ key, label, text });
export const TEMPLATE_DEFAULTS: ReferralTemplates = {
  items: [
    tpl(
      'general',
      { az: 'Ümumi', de: 'Allgemein', en: 'General', ru: 'Общий' },
      {
        az: 'Salam! Mən Triad Vision ilə Almaniyada işə düzəldim. Sən də istəsən, bu linklə qeydiyyatdan keç: {link}',
        de: 'Hallo! Ich habe mit Triad Vision eine Arbeit in Deutschland gefunden. Wenn du auch möchtest, registriere dich über diesen Link: {link}',
        en: 'Hi! I found a job in Germany with Triad Vision. If you want to as well, sign up with this link: {link}',
        ru: 'Привет! Я нашёл работу в Германии через Triad Vision. Если тоже хочешь — зарегистрируйся по этой ссылке: {link}',
      },
    ),
    tpl(
      'nurse',
      { az: 'Tibb bacısı', de: 'Pflegefachkraft', en: 'Nurse', ru: 'Медсестра' },
      {
        az: 'Salam! Almaniyada tibb bacılarına böyük ehtiyac var — diplomun tanınmasından vizaya qədər Triad Vision kömək edir. Bu linklə qeydiyyatdan keç: {link}',
        de: 'Hallo! Deutschland sucht dringend Pflegefachkräfte — Triad Vision hilft von der Anerkennung bis zum Visum. Registriere dich hier: {link}',
        en: 'Hi! Germany urgently needs nurses — Triad Vision helps from diploma recognition to the visa. Sign up here: {link}',
        ru: 'Привет! В Германии очень нужны медсёстры — Triad Vision помогает от признания диплома до визы. Регистрируйся по ссылке: {link}',
      },
    ),
    tpl(
      'care',
      { az: 'Qulluq (yaşlılar)', de: 'Altenpflege', en: 'Elderly care', ru: 'Уход за пожилыми' },
      {
        az: 'Salam! Almaniyada yaşlılara qulluq sahəsində iş imkanları var, Triad Vision bütün prosesi izah edir. Bu linklə qeydiyyatdan keç: {link}',
        de: 'Hallo! In der Altenpflege in Deutschland gibt es viele Stellen, Triad Vision begleitet den ganzen Weg. Registriere dich hier: {link}',
        en: 'Hi! There are many elderly-care jobs in Germany and Triad Vision guides you through the whole process. Sign up here: {link}',
        ru: 'Привет! В Германии много вакансий по уходу за пожилыми, Triad Vision сопровождает весь процесс. Регистрируйся по ссылке: {link}',
      },
    ),
    tpl(
      'driver',
      { az: 'Sürücü', de: 'Berufskraftfahrer', en: 'Driver', ru: 'Водитель' },
      {
        az: 'Salam! Almaniyada yük maşını sürücülərinə iş var — Triad Vision sənədlərdə və vizada kömək edir. Bu linklə qeydiyyatdan keç: {link}',
        de: 'Hallo! In Deutschland werden LKW-Fahrer gesucht — Triad Vision hilft bei Unterlagen und Visum. Registriere dich hier: {link}',
        en: 'Hi! Germany is hiring truck drivers — Triad Vision helps with the documents and the visa. Sign up here: {link}',
        ru: 'Привет! В Германии ищут водителей грузовиков — Triad Vision помогает с документами и визой. Регистрируйся по ссылке: {link}',
      },
    ),
    tpl(
      'cook',
      { az: 'Aşpaz', de: 'Koch', en: 'Cook', ru: 'Повар' },
      {
        az: 'Salam! Almaniyada restoran və otellərə aşpaz axtarırlar, Triad Vision ilə yol daha asandır. Bu linklə qeydiyyatdan keç: {link}',
        de: 'Hallo! Restaurants und Hotels in Deutschland suchen Köche — mit Triad Vision geht es einfacher. Registriere dich hier: {link}',
        en: 'Hi! Restaurants and hotels in Germany are looking for cooks — Triad Vision makes it easier. Sign up here: {link}',
        ru: 'Привет! Рестораны и отели в Германии ищут поваров — с Triad Vision всё проще. Регистрируйся по ссылке: {link}',
      },
    ),
    tpl(
      'construction',
      { az: 'Tikinti', de: 'Bau', en: 'Construction', ru: 'Строительство' },
      {
        az: 'Salam! Almaniyada tikinti ustalarına (bənna, elektrik, santexnik) tələb var. Triad Vision kömək edir — bu linklə qeydiyyatdan keç: {link}',
        de: 'Hallo! In Deutschland werden Bauhandwerker gesucht (Maurer, Elektriker, Installateure). Triad Vision hilft — registriere dich hier: {link}',
        en: 'Hi! Germany needs construction workers (bricklayers, electricians, plumbers). Triad Vision helps — sign up here: {link}',
        ru: 'Привет! В Германии нужны строители (каменщики, электрики, сантехники). Triad Vision помогает — регистрируйся по ссылке: {link}',
      },
    ),
    tpl(
      'warehouse',
      { az: 'Anbar / logistika', de: 'Lager / Logistik', en: 'Warehouse / logistics', ru: 'Склад / логистика' },
      {
        az: 'Salam! Almaniyada anbar və logistika işləri var, Triad Vision bütün addımlarda yanındadır. Bu linklə qeydiyyatdan keç: {link}',
        de: 'Hallo! In Lager und Logistik gibt es in Deutschland viele Jobs, Triad Vision begleitet jeden Schritt. Registriere dich hier: {link}',
        en: 'Hi! There are lots of warehouse and logistics jobs in Germany and Triad Vision helps at every step. Sign up here: {link}',
        ru: 'Привет! В Германии много работы на складах и в логистике, Triad Vision помогает на каждом шаге. Регистрируйся по ссылке: {link}',
      },
    ),
  ],
};
export const getReferralTemplates = () => readSetting(REFERRAL_EXTRA_KEYS.templates, templatesSchema, TEMPLATE_DEFAULTS);

/** A template's text with the link filled in (appended when the text has no {link}). */
export const fillTemplate = (text: string, link: string) => (text.includes('{link}') ? text.split('{link}').join(link) : `${text.trim()} ${link}`.trim());

// ─── Programme terms ───────────────────────────────────────────────────

export const termsSchema = z.object({ body: l10n(20_000), updatedAt: z.string().max(40).default('') });
export type ReferralTerms = z.infer<typeof termsSchema>;
export const TERMS_DEFAULTS: ReferralTerms = {
  updatedAt: '',
  body: {
    az: [
      '1. Kim iştirak edə bilər. Triad Vision portalında qeydiyyatdan keçmiş hər müştəri öz şəxsi linki ilə dostlarını dəvət edə bilər.',
      '2. Mükafat. Mükafatın məbləği, növü (endirim və ya ödəniş) və nə vaxt qazanıldığı portalda göstərilən aktual qaydalara görədir. Qaydalar dəvət olunanın qeydiyyat anında qüvvədə olan qaydalardır.',
      '3. Müddət. Dəvət olunan şəxs linklə qeydiyyatdan keçdikdən sonra 12 ay ərzində müvafiq mərhələyə çatmalıdır; əks halda mükafat ləğv edilə bilər.',
      '4. Limitlər. Hər dəvət olunan şəxs üçün yalnız bir mükafat verilir. Endirim yalnız Triad Vision xidmət haqqına tətbiq olunur və nağd pula çevrilmir.',
      '5. Ləğv. Triad Vision proqramı istənilən vaxt dəyişə və ya dayandıra bilər; artıq qazanılmış mükafatlar qorunur.',
      '6. Sui-istifadə. Özünü dəvət etmək (eyni e-poçt, telefon, pasport), saxta hesablar və ya spam qadağandır — belə dəvətlər bloklanır və mükafatlar ləğv edilir.',
      '7. Vergi. Nağd ödənişlərdə vergi öhdəlikləri qüvvədə olan qanunvericiliyə əsasən alıcının üzərinə düşə bilər; hər ödəniş üçün qəbz verilir.',
    ].join('\n\n'),
    de: [
      '1. Teilnahme. Jede bei Triad Vision registrierte Kundin / jeder Kunde kann mit dem persönlichen Link Bekannte empfehlen.',
      '2. Prämie. Höhe, Art (Rabatt oder Auszahlung) und Zeitpunkt richten sich nach den im Portal angezeigten Regeln zum Zeitpunkt der Registrierung der empfohlenen Person.',
      '3. Gültigkeit. Die empfohlene Person muss die jeweilige Stufe innerhalb von 12 Monaten nach der Registrierung erreichen; sonst kann die Prämie verfallen.',
      '4. Grenzen. Pro empfohlener Person gibt es nur eine Prämie. Rabatte gelten nur für Gebühren von Triad Vision und werden nicht bar ausgezahlt.',
      '5. Beendigung. Triad Vision kann das Programm jederzeit ändern oder beenden; bereits verdiente Prämien bleiben erhalten.',
      '6. Missbrauch. Selbstempfehlungen (gleiche E-Mail, Telefonnummer, Pass), Fake-Konten oder Spam sind verboten — solche Empfehlungen werden gesperrt und Prämien storniert.',
      '7. Steuern. Für Barauszahlungen können nach geltendem Recht Steuerpflichten bei der empfangenden Person liegen; für jede Auszahlung gibt es einen Beleg.',
    ].join('\n\n'),
    en: [
      '1. Who can take part. Every client registered with Triad Vision can refer friends with their personal link.',
      '2. Reward. The amount, type (discount or payout) and when it is earned follow the rules shown in the portal at the time the friend signs up.',
      '3. Validity. The referred friend has to reach the stage within 12 months of signing up; otherwise the reward may lapse.',
      '4. Limits. One reward per referred person. Discounts apply only to Triad Vision fees and cannot be exchanged for cash.',
      '5. Cancellation. Triad Vision may change or end the programme at any time; rewards already earned are kept.',
      '6. Abuse. Self-referral (same e-mail, phone or passport), fake accounts or spam are not allowed — such referrals are blocked and their rewards cancelled.',
      '7. Tax. For cash payouts, tax obligations may lie with the recipient under applicable law; every payout comes with a receipt.',
    ].join('\n\n'),
    ru: [
      '1. Участие. Каждый клиент, зарегистрированный в Triad Vision, может приглашать друзей по личной ссылке.',
      '2. Бонус. Сумма, вид (скидка или выплата) и момент начисления определяются правилами в портале на момент регистрации друга.',
      '3. Срок. Приглашённый должен достичь нужного этапа в течение 12 месяцев после регистрации; иначе бонус может быть отменён.',
      '4. Ограничения. Один бонус за каждого приглашённого. Скидка действует только на услуги Triad Vision и не выплачивается деньгами.',
      '5. Прекращение. Triad Vision может изменить или прекратить программу в любое время; уже начисленные бонусы сохраняются.',
      '6. Злоупотребления. Самоприглашение (тот же e-mail, телефон, паспорт), фейковые аккаунты и спам запрещены — такие приглашения блокируются, бонусы отменяются.',
      '7. Налоги. При денежных выплатах налоговые обязательства по закону могут лежать на получателе; на каждую выплату выдаётся квитанция.',
    ].join('\n\n'),
  },
};
export const getReferralTerms = () => readSetting(REFERRAL_EXTRA_KEYS.terms, termsSchema, TERMS_DEFAULTS);
