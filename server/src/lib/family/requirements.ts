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
    az: 'Goethe, telc və ya ÖSD. İstisnalar var (məs. əsas müraciətçi Mavi Kart / ixtisaslı işçi, ali təhsilli həyat yoldaşı) — menecerinizlə dəqiqləşdirin.',
    de: 'Goethe, telc oder ÖSD. Ausnahmen möglich (z. B. Ehegatten von Blue-Card-Inhabern / Fachkräften, Hochschulabschluss) — bitte mit Ihrem Betreuer klären.',
    en: 'Goethe, telc or ÖSD. Exceptions exist (e.g. spouses of Blue Card holders / skilled workers, university degree) — please check with your manager.',
    ru: 'Goethe, telc или ÖSD. Есть исключения (напр. супруги обладателей Blue Card / специалистов, высшее образование) — уточните у вашего менеджера.',
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
    az: 'Notarial razılıq və ya tək qəyyumluq sübutu — uşaq yalnız bir valideynlə köçürsə.',
    de: 'Notarielle Zustimmung oder Nachweis des alleinigen Sorgerechts — wenn das Kind nur mit einem Elternteil zieht.',
    en: 'Notarised consent or proof of sole custody — if the child moves with one parent only.',
    ru: 'Нотариальное согласие или подтверждение единоличной опеки — если ребёнок переезжает с одним родителем.',
  },
};
const RELATIONSHIP_PROOF: FamilyRequirementDef = {
  key: 'RELATIONSHIP_PROOF',
  required: true,
  title: { az: 'Qohumluq sübutu (apostil + tərcümə)', de: 'Nachweis des Verwandtschaftsverhältnisses (Apostille + Übersetzung)', en: 'Proof of relationship (apostille + translation)', ru: 'Подтверждение родства (апостиль + перевод)' },
};

const EMBASSY: FamilyRequirementDef[] = [
  { key: 'VIDEX', required: true, title: { az: 'Doldurulmuş viza ərizəsi (VIDEX)', de: 'Ausgefüllter Visumantrag (VIDEX)', en: 'Completed visa application form (VIDEX)', ru: 'Заполненная визовая анкета (VIDEX)' } },
  { key: 'PHOTO_2', required: true, title: { az: '2 ədəd biometrik foto', de: '2 biometrische Passfotos', en: '2 biometric photos', ru: '2 биометрических фото' } },
  { key: 'HEALTH_INSURANCE', required: true, title: { az: 'Tibbi sığorta', de: 'Krankenversicherungsnachweis', en: 'Health insurance', ru: 'Медицинская страховка' } },
  { key: 'ACCOMMODATION', required: false, title: { az: 'Kifayət qədər yaşayış sahəsi sübutu', de: 'Nachweis über ausreichenden Wohnraum', en: 'Proof of sufficient housing', ru: 'Подтверждение жилья' } },
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
  return FAMILY_REQUIREMENTS[relationKey(c.relation)][stage].map((r, i) => ({ key: r.key, title: r.title as Prisma.InputJsonValue, description: r.description as Prisma.InputJsonValue | undefined, required: r.required, sortOrder: i }));
};
