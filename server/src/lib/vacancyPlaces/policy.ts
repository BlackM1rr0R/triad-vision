import { z } from 'zod';
import { prisma } from '../../db.js';

/**
 * Who may start an application by themselves (Setting "vacancyApplicationPolicy", admin: Vacancies › Application rules):
 *   clientsOnlyActiveVacancies  ON (default): a client starts a new case only for one of our open vacancies with a
 *                               free place; the visa type / profession come from the vacancy. OFF: the old free choice
 *                               of the visa type. Staff create cases for any visa type either way.
 *   allowExternalApplications   OFF (default): "apply via Triad Vision" for listings of other job sites (/jobs/germany,
 *                               pasted links) is switched off — the listing and its original link stay visible.
 * The test suite starts with the old behaviour (VACANCY_POLICY_DEFAULTS=legacy in tests/helpers/testEnv.ts) so older
 * tests keep their intent; the policy tests switch it on through the admin API.
 */
export const POLICY_KEY = 'vacancyApplicationPolicy';

export const policySchema = z.object({
  clientsOnlyActiveVacancies: z.boolean(),
  allowExternalApplications: z.boolean(),
});
export type ApplicationPolicy = z.infer<typeof policySchema>;

export const defaultPolicy = (): ApplicationPolicy =>
  process.env.VACANCY_POLICY_DEFAULTS === 'legacy'
    ? { clientsOnlyActiveVacancies: false, allowExternalApplications: true }
    : { clientsOnlyActiveVacancies: true, allowExternalApplications: false };

export const getApplicationPolicy = async (): Promise<ApplicationPolicy> => {
  const row = await prisma.setting.findUnique({ where: { key: POLICY_KEY } });
  const stored = policySchema.partial().safeParse(row?.value ?? {});
  return { ...defaultPolicy(), ...(stored.success ? stored.data : {}) };
};

export const setApplicationPolicy = async (patch: Partial<ApplicationPolicy>): Promise<ApplicationPolicy> => {
  const next = { ...(await getApplicationPolicy()), ...patch };
  await prisma.setting.upsert({ where: { key: POLICY_KEY }, create: { key: POLICY_KEY, value: next }, update: { value: next } });
  return next;
};
