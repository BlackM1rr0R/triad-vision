import type { VisaType } from '@prisma/client';
import { checklistFor, type CaseAiSettings, type ChecklistItem } from '../ai/features/caseAi/config.js';

/**
 * Public document checklist generator (/visa-document-checklist), GET /api/visa-checklist.
 *
 * The base list of each visa type is the SAME embassy checklist the portal uses (case AI settings,
 * lib/ai/features/caseAi/config.ts: DEFAULT_CHECKLISTS, or the list an admin saved there), so the public page and
 * the client portal never disagree. On top come a few items per visa type and per profession that were
 * cross-checked against the German Embassy Baku pages (baku.diplo.de, read 2026-11-16) and links to the official
 * lists — which stay authoritative: since 2025 most national visa categories in Baku are applied for through the
 * Auslandsportal (digital.diplo.de), whose current document list wins over ours.
 *
 * The base items exist in az / de / en / ru; tr and uk visitors get the English label for them.
 */

export const CHECKLIST_AS_OF = '2026-11-16';

export const LANGS = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
export type Lang = (typeof LANGS)[number];
type L6 = Record<Lang, string>;

export const PUBLIC_VISA_TYPES = ['skilled', 'blueCard', 'ausbildung', 'recognition', 'chancenkarte', 'family', 'study'] as const;
export type PublicVisaType = (typeof PUBLIC_VISA_TYPES)[number];

export const CHECKLIST_PROFESSIONS = ['driver', 'nurse', 'cook', 'electrician', 'construction', 'other'] as const;
export type ChecklistProfession = (typeof CHECKLIST_PROFESSIONS)[number];

/** Portal checklist each public visa type is based on. */
export const BASE_TYPE: Record<PublicVisaType, VisaType> = {
  skilled: 'WORK',
  blueCard: 'WORK',
  ausbildung: 'AUSBILDUNG',
  recognition: 'WEITERBILDUNG',
  chancenkarte: 'JOB_SEEKER',
  family: 'FAMILY',
  study: 'STUDY',
};

const l6 = (az: string, de: string, en: string, ru: string, tr: string, uk: string): L6 => ({ az, de, en, ru, tr, uk });

interface Extra {
  key: string;
  label: L6;
}

/** Items the portal list does not have, per visa type (from the Baku embassy pages, see the links). */
const TYPE_EXTRAS: Record<PublicVisaType, Extra[]> = {
  skilled: [
    {
      key: 'experience',
      label: l6(
        'İş təcrübəsi arayışları (vəzifə, müddət, görülən işlər)',
        'Arbeitszeugnisse / Nachweise der Berufserfahrung (Tätigkeit, Dauer, Aufgaben)',
        'Employment references (job title, period, tasks)',
        'Справки о стаже (должность, период, обязанности)',
        'İş deneyimi belgeleri (pozisyon, süre, görevler)',
        'Довідки про стаж (посада, період, обовʼязки)',
      ),
    },
  ],
  blueCard: [
    {
      key: 'degree',
      label: l6(
        'Ali təhsil diplomu: anabin-də “H+” statusu və ya ZAB müqayisə arayışı (Zeugnisbewertung)',
        'Hochschulabschluss: anabin-Eintrag „H+“ oder ZAB-Zeugnisbewertung',
        'University degree: anabin “H+” entry or ZAB statement of comparability',
        'Диплом вуза: статус «H+» в anabin или оценка ZAB',
        'Üniversite diploması: anabin “H+” kaydı veya ZAB denklik değerlendirmesi',
        'Диплом ЗВО: статус «H+» в anabin або оцінка ZAB',
      ),
    },
    {
      key: 'salary',
      label: l6(
        'Müqavilədə illik brutto maaş Blue Card həddindən az olmamalıdır (2026: 50 700 € / darlıq peşələri 45 934,20 €)',
        'Vertrag mit Bruttojahresgehalt mindestens in Höhe der Blue-Card-Schwelle (2026: 50.700 € / Engpassberufe 45.934,20 €)',
        'Contract with a gross yearly salary at least at the Blue Card threshold (2026: €50,700 / shortage jobs €45,934.20)',
        'Договор с годовой зарплатой брутто не ниже порога Blue Card (2026: 50 700 € / дефицитные профессии 45 934,20 €)',
        'Brüt yıllık maaşı Blue Card eşiğinin altında olmayan sözleşme (2026: 50.700 € / eksik meslekler 45.934,20 €)',
        'Договір із річною зарплатою брутто не нижче порогу Blue Card (2026: 50 700 € / дефіцитні професії 45 934,20 €)',
      ),
    },
  ],
  ausbildung: [
    {
      key: 'accommodation',
      label: l6(
        'Yaşayış və dolanışıq sübutu (təlim haqqı kifayət etmirsə — bloklanmış hesab və ya öhdəlik məktubu)',
        'Nachweis der Lebensunterhaltssicherung (falls die Ausbildungsvergütung nicht reicht: Sperrkonto oder Verpflichtungserklärung)',
        'Proof of means of subsistence (if the training pay is not enough: blocked account or formal obligation)',
        'Подтверждение средств (если оплаты обучения не хватает — блок-счёт или обязательство)',
        'Geçim kanıtı (eğitim ücreti yetmezse: bloke hesap veya taahhütname)',
        'Підтвердження коштів (якщо оплати навчання не вистачає — блок-рахунок або зобовʼязання)',
      ),
    },
  ],
  recognition: [
    {
      key: 'declaration',
      label: l6(
        'BA forması “Erklärung zum Beschäftigungsverhältnis” + Zusatzblatt A (işəgötürən doldurur)',
        '„Erklärung zum Beschäftigungsverhältnis“ mit Zusatzblatt A (vom Arbeitgeber ausgefüllt)',
        '“Erklärung zum Beschäftigungsverhältnis” with supplementary sheet A (filled in by the employer)',
        '«Erklärung zum Beschäftigungsverhältnis» с листом A (заполняет работодатель)',
        '“Erklärung zum Beschäftigungsverhältnis” ve ek sayfa A (işveren doldurur)',
        '«Erklärung zum Beschäftigungsverhältnis» з аркушем A (заповнює роботодавець)',
      ),
    },
    {
      key: 'partnership',
      label: l6(
        'Tanınma tərəfdaşlığında: işəgötürənlə razılaşma, ZAB / bərabərlik sənədi və əmək müqaviləsi',
        'Bei Anerkennungspartnerschaft: Vereinbarung mit dem Arbeitgeber, ZAB-/Gleichwertigkeitsnachweis und Arbeitsvertrag',
        'For a recognition partnership: agreement with the employer, ZAB / equivalence document and employment contract',
        'Для партнёрства по признанию: соглашение с работодателем, документ ZAB и трудовой договор',
        'Tanınma ortaklığında: işverenle anlaşma, ZAB / denklik belgesi ve iş sözleşmesi',
        'Для партнерства з визнання: угода з роботодавцем, документ ZAB і трудовий договір',
      ),
    },
    {
      key: 'pension',
      label: l6(
        '45 yaş və yuxarı: pensiya təminatı sübutu (maaş həddinə çatmırsa)',
        'Ab 45 Jahren: Nachweis der Altersversorgung (falls die Gehaltsgrenze nicht erreicht wird)',
        'Aged 45 or over: proof of old-age provision (if the salary threshold is not met)',
        'С 45 лет: подтверждение пенсионного обеспечения (если зарплата ниже порога)',
        '45 yaş ve üzeri: emeklilik güvencesi kanıtı (maaş eşiği karşılanmıyorsa)',
        'Від 45 років: підтвердження пенсійного забезпечення (якщо зарплата нижче порогу)',
      ),
    },
  ],
  chancenkarte: [
    {
      key: 'points',
      label: l6(
        'Xal sübutları: tanınma / ZAB, alman və ya ingilis dili, təcrübə, Almaniyada əvvəlki qalış',
        'Nachweise für die Punkte: Anerkennung / ZAB, Deutsch- oder Englischkenntnisse, Berufserfahrung, frühere Aufenthalte',
        'Evidence for the points: recognition / ZAB, German or English, work experience, earlier stays in Germany',
        'Доказательства баллов: признание / ZAB, немецкий или английский, стаж, прежние пребывания',
        'Puan kanıtları: tanınma / ZAB, Almanca veya İngilizce, iş deneyimi, önceki kalışlar',
        'Докази балів: визнання / ZAB, німецька або англійська, стаж, попередні перебування',
      ),
    },
  ],
  family: [
    {
      key: 'idcard',
      label: l6(
        'Şəxsiyyət vəsiqəsi (orijinal + 1 surət); pasportda ən azı 3 boş səhifə',
        'Personalausweis (Original + 1 Kopie); Reisepass mit mindestens 3 leeren Seiten',
        'ID card (original + 1 copy); passport with at least 3 blank pages',
        'Удостоверение личности (оригинал + 1 копия); в паспорте не менее 3 чистых страниц',
        'Kimlik kartı (asıl + 1 kopya); pasaportta en az 3 boş sayfa',
        'Посвідчення особи (оригінал + 1 копія); у паспорті щонайменше 3 чисті сторінки',
      ),
    },
    {
      key: 'invitation',
      label: l6(
        'Almaniyadakı həyat yoldaşının dəvət məktubu və Meldebescheinigung (6 aydan köhnə olmayan)',
        'Einladungsschreiben der Bezugsperson und ihre Meldebescheinigung (nicht älter als 6 Monate)',
        'Invitation letter from the partner in Germany and their registration certificate (not older than 6 months)',
        'Приглашение от супруга в Германии и его Meldebescheinigung (не старше 6 месяцев)',
        'Almanya’daki eşin davet mektubu ve Meldebescheinigung belgesi (6 aydan eski olmayan)',
        'Запрошення від чоловіка / дружини в Німеччині та Meldebescheinigung (не старше 6 місяців)',
      ),
    },
    {
      key: 'alte',
      label: l6(
        'A1 sertifikatı yalnız ALTE üzvündən (Goethe, telc, ÖSD, TestDaF, ECL), 12 aydan köhnə olmayan',
        'A1-Zertifikat nur von einem ALTE-Anbieter (Goethe, telc, ÖSD, TestDaF, ECL), nicht älter als 12 Monate',
        'A1 certificate only from an ALTE provider (Goethe, telc, ÖSD, TestDaF, ECL), not older than 12 months',
        'Сертификат A1 только от члена ALTE (Goethe, telc, ÖSD, TestDaF, ECL), не старше 12 месяцев',
        'A1 sertifikası yalnızca ALTE üyesinden (Goethe, telc, ÖSD, TestDaF, ECL), 12 aydan eski olmayan',
        'Сертифікат A1 лише від члена ALTE (Goethe, telc, ÖSD, TestDaF, ECL), не старше 12 місяців',
      ),
    },
  ],
  study: [],
};

/** Items per profession (added to every visa type except family). */
const PROFESSION_EXTRAS: Record<ChecklistProfession, Extra[]> = {
  driver: [
    {
      key: 'licence',
      label: l6(
        'Sürücülük vəsiqəsi (C / CE kateqoriyası) və sürücülük təcrübəsi arayışları',
        'Führerschein (Klasse C / CE) und Nachweise der Fahrpraxis',
        'Driving licence (category C / CE) and proof of driving experience',
        'Водительское удостоверение (категория C / CE) и подтверждение опыта вождения',
        'Sürücü belgesi (C / CE sınıfı) ve sürüş deneyimi kanıtı',
        'Посвідчення водія (категорія C / CE) і підтвердження досвіду водіння',
      ),
    },
  ],
  nurse: [
    {
      key: 'nursing',
      label: l6(
        'Diplom əlavəsi (fənlər, saatlar, təcrübə), tanınma qərarı və ya Defizitbescheid; adətən B1–B2 alman dili',
        'Fächer- und Stundenübersicht inkl. Praxis, Anerkennungs- oder Defizitbescheid; meist Deutsch B1–B2',
        'Transcript of subjects and hours incl. practice, recognition or deficit notice; usually German B1–B2',
        'Приложение к диплому (предметы, часы, практика), решение о признании или Defizitbescheid; обычно немецкий B1–B2',
        'Ders ve saat dökümü (uygulama dahil), tanınma veya eksiklik kararı; genellikle Almanca B1–B2',
        'Додаток до диплома (предмети, години, практика), рішення про визнання або Defizitbescheid; зазвичай німецька B1–B2',
      ),
    },
  ],
  cook: [
    {
      key: 'cook',
      label: l6(
        'Aşpaz diplomu / kursu və restoran işəgötürənlərindən arayışlar',
        'Abschluss / Kurs als Koch und Zeugnisse der Restaurant-Arbeitgeber',
        'Cook qualification / course and references from restaurant employers',
        'Диплом / курс повара и справки от ресторанов-работодателей',
        'Aşçılık diploması / kursu ve restoran işverenlerinden referanslar',
        'Диплом / курс кухаря та довідки від ресторанів-роботодавців',
      ),
    },
  ],
  electrician: [
    {
      key: 'electric',
      label: l6(
        'Diplom əlavəsi (nəzəriyyə və praktika saatları), elektrik təhlükəsizliyi icazələri (varsa)',
        'Fächer- und Stundenübersicht (Theorie und Praxis), Elektro-Sicherheitsnachweise (falls vorhanden)',
        'Transcript with theory and practice hours, electrical safety permits (if any)',
        'Приложение к диплому (часы теории и практики), допуски по электробезопасности (если есть)',
        'Teori ve uygulama saatli döküm, elektrik güvenliği belgeleri (varsa)',
        'Додаток до диплома (години теорії та практики), допуски з електробезпеки (якщо є)',
      ),
    },
  ],
  construction: [
    {
      key: 'construction',
      label: l6(
        'Görülən işlərin təsviri ilə arayışlar; qaynaqçılar üçün DIN EN ISO 9606 sertifikatları (varsa)',
        'Zeugnisse mit Beschreibung der Tätigkeiten; für Schweißer Prüfungsbescheinigungen nach DIN EN ISO 9606 (falls vorhanden)',
        'References describing the work done; for welders DIN EN ISO 9606 test certificates (if any)',
        'Справки с описанием работ; для сварщиков сертификаты DIN EN ISO 9606 (если есть)',
        'Yapılan işlerin açıklandığı referanslar; kaynakçılar için DIN EN ISO 9606 sertifikaları (varsa)',
        'Довідки з описом робіт; для зварників сертифікати DIN EN ISO 9606 (якщо є)',
      ),
    },
  ],
  other: [],
};

/** Notes for every list. */
const COMMON_NOTES: Extra[] = [
  {
    key: 'apostille',
    label: l6(
      'Azərbaycan sənədlərinə ASAN-da apostil (orijinalın üzərinə) — səfirliyin tələb etdiyi sənədlər üçün. Apostil və tərcüməni özünüz edirsiniz.',
      'Apostille der ASAN-Dienste auf aserbaidschanischen Originalen, soweit die Botschaft sie verlangt. Apostille und Übersetzungen besorgen Sie selbst.',
      'ASAN apostille on Azerbaijani originals where the embassy asks for it. You arrange the apostille and translations yourself.',
      'Апостиль ASAN на оригиналах азербайджанских документов, где этого требует посольство. Апостиль и переводы вы оформляете сами.',
      'Büyükelçiliğin istediği Azerbaycan belgelerinin aslına ASAN apostili. Apostil ve tercümeleri kendiniz yaptırırsınız.',
      'Апостиль ASAN на оригіналах азербайджанських документів, де цього вимагає посольство. Апостиль і переклади ви оформлюєте самі.',
    ),
  },
  {
    key: 'copies',
    label: l6(
      'Hər sənəd: orijinal + 1 surət, A4 formatında',
      'Jedes Dokument: Original + 1 Kopie, im Format A4',
      'Every document: original + 1 copy, A4 format',
      'Каждый документ: оригинал + 1 копия, формат A4',
      'Her belge: asıl + 1 kopya, A4 formatında',
      'Кожен документ: оригінал + 1 копія, формат A4',
    ),
  },
];

export type Channel = 'portal' | 'tls' | 'embassy';

/** Where the application is filed in Baku (baku.diplo.de "Antragstellung", read 2026-11-16). */
export const CHANNEL: Record<PublicVisaType, Channel> = {
  skilled: 'portal',
  blueCard: 'portal',
  ausbildung: 'portal',
  recognition: 'tls',
  chancenkarte: 'portal',
  family: 'embassy',
  study: 'portal',
};

const BAKU = 'https://baku.diplo.de/az-de/konsularservice/visa-und-einreise';

export interface OfficialLink {
  label: string;
  url: string;
}

/** Official lists per type: the Auslandsportal category and / or the embassy page. */
export const OFFICIAL_LINKS: Record<PublicVisaType, OfficialLink[]> = {
  skilled: [
    { label: 'Auslandsportal: Arbeitsaufnahme – Ausbildungsberuf (§ 18a)', url: 'https://digital.diplo.de/Arbeitsaufnahme-Ausbildungsberuf' },
    { label: 'Auslandsportal: Arbeitsaufnahme – Akademiker (§ 18b)', url: 'https://digital.diplo.de/Arbeitsaufnahme-Akademiker' },
    { label: 'Auslandsportal: Arbeitsaufnahme – Berufserfahrung (§ 19c Abs. 2)', url: 'https://digital.diplo.de/Arbeitsaufnahme-Berufserfahrung' },
    { label: 'Botschaft Baku: Arbeit, Anerkennung, Chancenkarte', url: `${BAKU}/2284440-2284440` },
  ],
  blueCard: [
    { label: 'Auslandsportal: Blaue Karte EU', url: 'https://digital.diplo.de/Blaue-Karte' },
    { label: 'Botschaft Baku: Arbeit, Anerkennung, Chancenkarte', url: `${BAKU}/2284440-2284440` },
  ],
  ausbildung: [
    { label: 'Auslandsportal: Aus- und Weiterbildung (§ 16a)', url: 'https://digital.diplo.de/Aus-und-Weiterbildung' },
    { label: 'Botschaft Baku: Ausbildung und Studium', url: `${BAKU}/2284438-2284438` },
  ],
  recognition: [{ label: 'Botschaft Baku: Merkblatt § 16d AufenthG', url: `${BAKU}/2807514-2807514` }],
  chancenkarte: [
    { label: 'Auslandsportal: Chancenkarte (§ 20a)', url: 'https://digital.diplo.de/Chancenkarte' },
    { label: 'Botschaft Baku: Arbeit, Anerkennung, Chancenkarte', url: `${BAKU}/2284440-2284440` },
  ],
  family: [
    { label: 'Botschaft Baku: Ehegattennachzug', url: `${BAKU}/2807534-2807534` },
    { label: 'Botschaft Baku: Kindernachzug (§ 32)', url: `${BAKU}/2807526-2807526` },
    { label: 'Botschaft Baku: Familiennachzug', url: `${BAKU}/2284436-2284436` },
  ],
  study: [
    { label: 'Auslandsportal: Studium', url: 'https://digital.diplo.de/Studium' },
    { label: 'Botschaft Baku: Ausbildung und Studium', url: `${BAKU}/2284438-2284438` },
  ],
};

/** Embassy pages that apply to every type. */
export const GENERAL_LINKS: OfficialLink[] = [
  { label: 'Botschaft Baku: Merkblätter (Übersicht)', url: `${BAKU}/2077616-2077616` },
  { label: 'Botschaft Baku: Antragstellung und Termine', url: `${BAKU}/2069904-2069904` },
  { label: 'Botschaft Baku: Gebühren', url: `${BAKU}/gebuehren-2020214` },
  { label: 'Botschaft Baku: Häufige Fragen zum nationalen Visum', url: `${BAKU}/2801232-2801232` },
];

/** National visa fee in Baku (baku.diplo.de "Gebühren"): € 75 adults, € 37.50 under 18, paid in AZN. */
export const VISA_FEE = { adult: 75, minor: 37.5 } as const;

const pickLabel = (label: Partial<Record<Lang, string>>, lng: Lang) => label[lng] || label.en || label.de || '';

/**
 * Categories applied for through the Auslandsportal: the online form there takes the place of the printed VIDEX
 * form (Baku Merkblatt "Unselbständige Erwerbstätigkeit": application "ausschließlich online über das
 * Auslandsportal", plus a TLScontact account; checked 2026-11-17). The portal list's VIDEX item is relabelled.
 */
const PORTAL_FORM: L6 = l6(
  'Auslandsportal-da (digital.diplo.de) onlayn ərizə — VIDEX formasını əvəz edir; portalın tələb etdiyini çap edin',
  'Online-Antrag im Auslandsportal (digital.diplo.de) – ersetzt das VIDEX-Formular; ausdrucken, was das Portal verlangt',
  'Online application in the Auslandsportal (digital.diplo.de) — replaces the VIDEX form; print what the portal asks for',
  'Онлайн-заявление в Auslandsportal (digital.diplo.de) — заменяет анкету VIDEX; распечатайте то, что требует портал',
  'Auslandsportal’da (digital.diplo.de) çevrim içi başvuru — VIDEX formunun yerine geçer; portalın istediklerini yazdırın',
  'Онлайн-заява в Auslandsportal (digital.diplo.de) — замінює анкету VIDEX; роздрукуйте те, що вимагає портал',
);

export interface ChecklistEntry {
  key: string;
  label: string;
  source: 'portal' | 'type' | 'profession' | 'note';
}

/** The printable list of one visa type (+ profession) in a language. */
export const buildChecklist = (settings: CaseAiSettings, type: PublicVisaType, profession: ChecklistProfession, lng: Lang): ChecklistEntry[] => {
  const base: ChecklistItem[] = checklistFor(settings, BASE_TYPE[type]);
  const out: ChecklistEntry[] = base.map((i) => ({
    key: `base.${i.key}`,
    label: i.key === 'videx' && CHANNEL[type] === 'portal' ? PORTAL_FORM[lng] : pickLabel(i.label, lng),
    source: 'portal',
  }));
  for (const e of TYPE_EXTRAS[type]) out.push({ key: `type.${e.key}`, label: e.label[lng], source: 'type' });
  if (type !== 'family') for (const e of PROFESSION_EXTRAS[profession]) out.push({ key: `prof.${e.key}`, label: e.label[lng], source: 'profession' });
  for (const e of COMMON_NOTES) out.push({ key: `note.${e.key}`, label: e.label[lng], source: 'note' });
  return out.filter((e) => e.label.trim());
};

export const parseType = (raw: unknown): PublicVisaType | null =>
  typeof raw === 'string' && (PUBLIC_VISA_TYPES as readonly string[]).includes(raw) ? (raw as PublicVisaType) : null;
export const parseProfession = (raw: unknown): ChecklistProfession | null =>
  typeof raw === 'string' && (CHECKLIST_PROFESSIONS as readonly string[]).includes(raw) ? (raw as ChecklistProfession) : null;
