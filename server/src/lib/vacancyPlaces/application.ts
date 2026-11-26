import { caseParentFor, vacancyProfession, visaCategoryIdForVacancy } from '../drive/vacancyFolders.js';
import { assertApplicable } from './service.js'; // our open vacancies with a free place only
import { visaTypeOfVacancy } from './places.js';

/**
 * What a case opened for a vacancy takes from it (profession, visa type, category, vacancy, client folder parent).
 * Shared by the client's own application (routes/cases.ts) and a referral partner registering a client for a vacancy
 * (routes/partnerPortal.ts), so both go through the same checks: the vacancy must exist (404 VACANCY_NOT_FOUND), be
 * open (409 VACANCY_CLOSED) and have a free place (409 VACANCY_FULL).
 */
export const checkedVacancy = async (vacancyId: string) => (await assertApplicable({ id: vacancyId })).vacancy;

export const vacancyCaseFields = async (vacancy: Awaited<ReturnType<typeof checkedVacancy>>, userId: string) => ({
  profession: vacancyProfession(vacancy),
  visaType: visaTypeOfVacancy(vacancy),
  visaCategoryId: await visaCategoryIdForVacancy(vacancy.id),
  vacancyId: vacancy.id,
  // The client folder goes into Anträge/<Visumart>/<Kategorie> (caseParentFor: only a staff override changes that).
  driveParentId: await caseParentFor({ vacancyId: vacancy.id, userId }),
});
