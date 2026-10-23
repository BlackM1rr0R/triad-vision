import type { DocStage, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { stripAiFlag } from '../ai/translate.js';
import { familyRequirementsFor } from '../family/requirements.js';

type L10n = { az: string; de: string; en: string; ru: string };

/** Built-in defaults, used until the admin creates templates (and copied by the seed). */
export const DEFAULT_REQUIREMENTS: Record<'INITIAL' | 'EMBASSY', { key: string; title: L10n; description?: L10n; required: boolean }[]> = {
  INITIAL: [
    { key: 'PASSPORT', required: true, title: { az: 'Pasport (bütün səhifələr)', de: 'Reisepass (alle Seiten)', en: 'Passport (all pages)', ru: 'Паспорт (все страницы)' }, description: { az: 'Etibarlılıq müddəti ən azı 12 ay olmalıdır.', de: 'Mindestens 12 Monate gültig.', en: 'Must be valid for at least 12 months.', ru: 'Срок действия не менее 12 месяцев.' } },
    { key: 'PHOTO', required: true, title: { az: 'Biometrik foto', de: 'Biometrisches Passfoto', en: 'Biometric photo', ru: 'Биометрическое фото' } },
    { key: 'CV', required: true, title: { az: 'CV (tərcümeyi-hal)', de: 'Lebenslauf (CV)', en: 'CV / résumé', ru: 'Резюме (CV)' } },
    { key: 'DIPLOMA', required: true, title: { az: 'Diplom və sertifikatlar', de: 'Diplome und Zertifikate', en: 'Diplomas and certificates', ru: 'Дипломы и сертификаты' } },
    { key: 'EMPLOYMENT_REF', required: false, title: { az: 'İş təcrübəsi arayışları', de: 'Arbeitszeugnisse', en: 'Employment references', ru: 'Справки о стаже работы' } },
    { key: 'DRIVING_LICENCE', required: false, title: { az: 'Sürücülük vəsiqəsi (sürücülər üçün)', de: 'Führerschein (für Fahrer)', en: 'Driving licence (for drivers)', ru: 'Водительское удостоверение (для водителей)' } },
    { key: 'LANGUAGE_CERT', required: false, title: { az: 'Dil sertifikatı (varsa)', de: 'Sprachzertifikat (falls vorhanden)', en: 'Language certificate (if any)', ru: 'Языковой сертификат (если есть)' } },
  ],
  EMBASSY: [
    { key: 'VIDEX', required: true, title: { az: 'Doldurulmuş viza ərizəsi (VIDEX)', de: 'Ausgefüllter Visumantrag (VIDEX)', en: 'Completed visa application form (VIDEX)', ru: 'Заполненная визовая анкета (VIDEX)' } },
    { key: 'PHOTO_2', required: true, title: { az: '2 ədəd biometrik foto', de: '2 biometrische Passfotos', en: '2 biometric photos', ru: '2 биометрических фото' } },
    { key: 'HEALTH_INSURANCE', required: true, title: { az: 'Tibbi sığorta', de: 'Krankenversicherungsnachweis', en: 'Health insurance', ru: 'Медицинская страховка' } },
    { key: 'SIGNED_CONTRACT', required: true, title: { az: 'İmzalanmış iş təklifi / əmək müqaviləsi', de: 'Unterschriebenes Arbeitsangebot / Arbeitsvertrag', en: 'Signed job offer / employment contract', ru: 'Подписанное предложение о работе / трудовой договор' } },
    { key: 'ANERKENNUNG', required: false, title: { az: 'Diplomun tanınması (Anerkennung)', de: 'Anerkennungsbescheid', en: 'Recognition of qualification (Anerkennung)', ru: 'Признание квалификации (Anerkennung)' } },
    { key: 'GERMAN_CERT', required: false, title: { az: 'Alman dili sertifikatı', de: 'Deutsch-Sprachzertifikat', en: 'German language certificate', ru: 'Сертификат по немецкому языку' } },
    { key: 'ACCOMMODATION', required: false, title: { az: 'Yaşayış yeri sübutu', de: 'Nachweis über Unterkunft', en: 'Proof of accommodation', ru: 'Подтверждение жилья' } },
  ],
};

/**
 * The document list a new case gets for a stage: the visa type's own templates when it has any,
 * else the global default templates (visaCategoryId = null), else the built-in list above.
 */
export const requirementsFor = async (
  tx: Prisma.TransactionClient,
  stage: 'INITIAL' | 'EMBASSY',
  visaCategoryId: string | null | undefined,
) => {
  const pick = async (where: Prisma.RequirementTemplateWhereInput) =>
    tx.requirementTemplate.findMany({ where: { ...where, stage }, orderBy: { sortOrder: 'asc' } });
  const own = visaCategoryId ? await pick({ visaCategoryId }) : [];
  const rows = own.length ? own : await pick({ visaCategoryId: null });
  if (rows.length) {
    return rows.map((r, i) => ({ key: r.key, title: stripAiFlag(r.title) as Prisma.InputJsonValue, description: (stripAiFlag(r.description) ?? undefined) as Prisma.InputJsonValue | undefined, required: r.required, sortOrder: i }));
  }
  return DEFAULT_REQUIREMENTS[stage].map((r, i) => ({ key: r.key, title: r.title, description: r.description, required: r.required, sortOrder: i }));
};

/** Creates the requirement rows of a stage for a case (used when a case is created / reaches the embassy step). */
export const createRequirements = async (tx: Prisma.TransactionClient, caseId: string, stage: DocStage & ('INITIAL' | 'EMBASSY'), visaCategoryId: string | null | undefined) => {
  // Family members (Familiennachzug) get their relation's own list (lib/family/requirements.ts).
  const list = (await familyRequirementsFor(tx, caseId, stage)) ?? (await requirementsFor(tx, stage, visaCategoryId));
  await tx.documentRequirement.createMany({
    data: list.map((r) => ({ caseId, stage, key: r.key ?? null, title: r.title, description: r.description, required: r.required, sortOrder: r.sortOrder })),
  });
};

/** Copies the built-in defaults into RequirementTemplate rows (global set) when none exist yet. Idempotent. */
export const seedDefaultTemplates = async (client: Pick<Prisma.TransactionClient, 'requirementTemplate'> = prisma) => {
  const existing = await client.requirementTemplate.count({ where: { visaCategoryId: null } });
  if (existing) return 0;
  let n = 0;
  for (const stage of ['INITIAL', 'EMBASSY'] as const) {
    await client.requirementTemplate.createMany({
      data: DEFAULT_REQUIREMENTS[stage].map((r, i) => ({ visaCategoryId: null, stage, key: r.key, title: r.title, description: r.description, required: r.required, sortOrder: i })),
    });
    n += DEFAULT_REQUIREMENTS[stage].length;
  }
  return n;
};
