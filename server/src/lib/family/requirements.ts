import type { Prisma } from '@prisma/client';

/**
 * Default document lists of a family member's case (Familiennachzug), per relation. They replace the
 * visa type's own list (CV, diploma … make no sense for a spouse or a child). Keys line up with the
 * FAMILY embassy checklist (caseAi/config.ts: PASSPORT, PHOTO_2, GERMAN_CERT, ACCOMMODATION, VIDEX) so
 * the embassy package and the case AI find the member's documents.
 *
 * GERMAN_CERT on a member case is the spouse's A1 certificate: it never changes the account's
 * germanLevel (that is the main applicant's level, lib/german/progress.ts skips member cases).
 */

type L10n = { az: string; de: string; en: string; ru: string };
export interface FamilyRequirementDef {
  key: string;
  title: L10n;
  description?: L10n;
  required: boolean;
}

export type FamilyRelationKey = 'spouse' | 'child' | 'parent' | 'other';

const PASSPORT: FamilyRequirementDef = {
  key: 'PASSPORT',
  required: true,
  title: { az: 'Pasport (bütün səhifələr)', de: 'Reisepass (alle Seiten)', en: 'Passport (all pages)', ru: 'Паспорт (все страницы)' },
  description: { az: 'Etibarlılıq müddəti ən azı 12 ay olmalıdır.', de: 'Mindestens 12 Monate gültig.', en: 'Must be valid for at least 12 months.', ru: 'Срок действия не менее 12 месяцев.' },
};
const PHOTO: FamilyRequirementDef = {
  key: 'PHOTO',
  required: true,
  title: { az: 'Biometrik foto', de: 'Biometrisches Passfoto', en: 'Biometric photo', ru: 'Биометрическое фото' },
};
const MARRIAGE_CERT: FamilyRequirementDef = {
  key: 'MARRIAGE_CERT',
  required: true,
  title: { az: 'Nikah şəhadətnaməsi (apostil + tərcümə)', de: 'Heiratsurkunde (mit Apostille und Übersetzung)', en: 'Marriage certificate (apostille + translation)', ru: 'Свидетельство о браке (апостиль + перевод)' },
  description: {
    az: 'Apostilli orijinal və alman dilinə andlı tərcümə.',
    de: 'Original mit Apostille und beglaubigter Übersetzung ins Deutsche.',
    en: 'Original with apostille and a certified German translation.',
    ru: 'Оригинал с апостилем и заверенный перевод на немецкий.',
  },
};
export const SPOUSE_A1: FamilyRequirementDef = {
  key: 'GERMAN_CERT',
  required: true,
  title: { az: 'Alman dili A1 sertifikatı', de: 'Deutschzertifikat A1', en: 'German A1 certificate', ru: 'Сертификат немецкого A1' },
  description: {
    az: 'Goethe, telc və ya ÖSD (§ 30 AufenthG). İstisnalar var (məs. əsas müraciətçi Mavi Kart / ixtisaslı işçi § 18a/18b, ali təhsilli həyat yoldaşı) — menecerinizlə dəqiqləşdirin.',
    de: 'Goethe, telc oder ÖSD (§ 30 AufenthG). Ausnahmen möglich (z. B. Ehegatten von Blue-Card-Inhabern / Fachkräften § 18a/18b, Hochschulabschluss) — bitte mit Ihrem Betreuer klären.',
    en: 'Goethe, telc or ÖSD (§ 30 AufenthG). Exceptions exist (e.g. spouses of Blue Card holders / skilled workers § 18a/18b, university degree) — please check with your manager.',
    ru: 'Goethe, telc или ÖSD (§ 30 AufenthG). Есть исключения (напр. супруги обладателей Blue Card / специалистов § 18a/18b, высшее образование) — уточните у вашего менеджера.',
  },
};
const BIRTH_CERT: FamilyRequirementDef = {
  key: 'BIRTH_CERT',
  required: true,
  title: { az: 'Doğum şəhadətnaməsi (apostil + tərcümə)', de: 'Geburtsurkunde (mit Apostille und Übersetzung)', en: 'Birth certificate (apostille + translation)', ru: 'Свидетельство о рождении (апостиль + перевод)' },
};
const PARENT_CONSENT: FamilyRequirementDef = {
  key: 'PARENT_CONSENT',
  required: false,
  title: { az: 'Digər valideynin razılığı (lazım olduqda)', de: 'Zustimmung des anderen Elternteils (falls zutreffend)', en: 'Consent of the other parent (if applicable)', ru: 'Согласие второго родителя (если требуется)' },
  description: {
    az: 'Notarial razılıq (apostil + tərcümə) və ya tək qəyyumluq sübutu — uşaq yalnız bir valideynin yanına köçürsə (§ 32 AufenthG).',
    de: 'Notarielle Zustimmung (mit Apostille und Übersetzung) oder Nachweis des alleinigen Sorgerechts — wenn das Kind nur zu einem Elternteil zieht (§ 32 AufenthG).',
    en: 'Notarised consent (apostille + translation) or proof of sole custody — if the child moves to one parent only (§ 32 AufenthG).',
    ru: 'Нотариальное согласие (апостиль + перевод) или подтверждение единоличной опеки — если ребёнок переезжает только к одному родителю (§ 32 AufenthG).',
  },
};
const RELATIONSHIP_PROOF: FamilyRequirementDef = {
  key: 'RELATIONSHIP_PROOF',
  required: true,
  title: { az: 'Qohumluq sübutu (apostil + tərcümə)', de: 'Nachweis des Verwandtschaftsverhältnisses (Apostille + Übersetzung)', en: 'Proof of relationship (apostille + translation)', ru: 'Подтверждение родства (апостиль + перевод)' },
};

/**
 * The main applicant's (Bezugsperson's) proofs every member needs at the embassy: residence title, employment
 * contract, payslips (livelihood, § 5 (1) Nr. 1 AufenthG) and the flat (§ 29 (1) Nr. 2). Same keys as
 * reunion.ts REUSABLE_DOCS, so accepted main-case documents are copied in and a copied requirement is not added
 * twice. The flat stays optional: Blue Card / skilled-worker families are exempt (lib/family/legal.ts).
 */
const SPONSOR: FamilyRequirementDef[] = [
  {
    key: 'SPONSOR_RESIDENCE_TITLE',
    required: true,
    title: { az: 'Əsas müraciətçinin vizası / yaşayış icazəsi', de: 'Visum / Aufenthaltstitel der Bezugsperson', en: "Main applicant's visa / residence permit", ru: 'Виза / вид на жительство основного заявителя' },
  },
  {
    key: 'SPONSOR_CONTRACT',
    required: true,
    title: { az: 'Əsas müraciətçinin əmək müqaviləsi', de: 'Arbeitsvertrag der Bezugsperson', en: "Main applicant's employment contract", ru: 'Трудовой договор основного заявителя' },
  },
  {
    key: 'SPONSOR_SALARY',
    required: true,
    title: { az: 'Əsas müraciətçinin maaş arayışları', de: 'Gehaltsabrechnungen der Bezugsperson', en: "Main applicant's salary slips", ru: 'Расчётные листы основного заявителя' },
    description: {
      az: 'Son 3 ayın maaş arayışları (Almaniyada işə başlayıbsa).',
      de: 'Die letzten 3 Gehaltsabrechnungen (sobald die Arbeit in Deutschland begonnen hat).',
      en: 'The last 3 salary slips (once work in Germany has started).',
      ru: 'Последние 3 расчётных листа (после начала работы в Германии).',
    },
  },
  {
    key: 'ACCOMMODATION',
    required: false,
    title: { az: 'Kifayət qədər yaşayış sahəsi sübutu', de: 'Nachweis über ausreichenden Wohnraum', en: 'Proof of sufficient housing', ru: 'Подтверждение жилья' },
    description: {
      az: 'Kirayə müqaviləsi (sahə m² ilə), Wohnungsgeberbestätigung və ya Meldebescheinigung. Mavi Kart / ixtisaslı işçi ailələri üçün adətən tələb olunmur.',
      de: 'Mietvertrag (mit Wohnfläche in m²), Wohnungsgeberbestätigung oder Meldebescheinigung. Für Familien von Blue-Card-Inhabern / Fachkräften in der Regel nicht nötig.',
      en: 'Rental contract (with the living space in m²), Wohnungsgeberbestätigung or Meldebescheinigung. Usually not needed for families of Blue Card holders / skilled workers.',
      ru: 'Договор аренды (с площадью в м²), Wohnungsgeberbestätigung или Meldebescheinigung. Для семей обладателей Blue Card / специалистов обычно не требуется.',
    },
  },
];

const EMBASSY: FamilyRequirementDef[] = [
  { key: 'VIDEX', required: true, title: { az: 'Doldurulmuş viza ərizəsi (VIDEX)', de: 'Ausgefüllter Visumantrag (VIDEX)', en: 'Completed visa application form (VIDEX)', ru: 'Заполненная визовая анкета (VIDEX)' } },
  { key: 'PHOTO_2', required: true, title: { az: '2 ədəd biometrik foto', de: '2 biometrische Passfotos', en: '2 biometric photos', ru: '2 биометрических фото' } },
  { key: 'HEALTH_INSURANCE', required: true, title: { az: 'Tibbi sığorta', de: 'Krankenversicherungsnachweis', en: 'Health insurance', ru: 'Медицинская страховка' } },
  ...SPONSOR,
];

export const FAMILY_REQUIREMENTS: Record<FamilyRelationKey, { INITIAL: FamilyRequirementDef[]; EMBASSY: FamilyRequirementDef[] }> = {
  spouse: { INITIAL: [PASSPORT, MARRIAGE_CERT, SPOUSE_A1, PHOTO], EMBASSY },
  child: { INITIAL: [PASSPORT, BIRTH_CERT, PARENT_CONSENT, PHOTO], EMBASSY },
  parent: { INITIAL: [PASSPORT, RELATIONSHIP_PROOF, PHOTO], EMBASSY },
  other: { INITIAL: [PASSPORT, RELATIONSHIP_PROOF, PHOTO], EMBASSY },
};

const relationKey = (r: string | null | undefined): FamilyRelationKey => (r === 'child' || r === 'parent' || r === 'other' ? r : 'spouse');

/**
 * The requirement list of a member case for a stage, or null when the case is not a member case
 * (then the visa type's templates apply). Used by createRequirements (docsIntel/requirementTemplates.ts).
 */
export const familyRequirementsFor = async (tx: Prisma.TransactionClient, caseId: string, stage: 'INITIAL' | 'EMBASSY') => {
  const c = await tx.case.findUnique({ where: { id: caseId }, select: { parentCaseId: true, relation: true } });
  if (!c?.parentCaseId) return null;
  // Keys the case has already (e.g. housing proof copied from the main case, lib/family/reunion.ts) are not added twice.
  const existing = new Set((await tx.documentRequirement.findMany({ where: { caseId, key: { not: null } }, select: { key: true } })).map((r) => r.key));
  return FAMILY_REQUIREMENTS[relationKey(c.relation)][stage].filter((r) => !existing.has(r.key)).map((r, i) => ({ key: r.key, title: r.title as Prisma.InputJsonValue, description: r.description as Prisma.InputJsonValue | undefined, required: r.required, sortOrder: i }));
};
