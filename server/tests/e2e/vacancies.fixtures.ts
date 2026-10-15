import type { CompanyStatus, Prisma } from '@prisma/client';
import { prisma } from '../helpers/db';
import { sessionAgent } from '../helpers/api';
import { createUser, l10n, uniq, type UserOpts } from '../helpers/factories';

/** Rows of the employers & vacancies area are not part of the shared resetDb; clear them per test. */
export const cleanJobs = async () => {
  await prisma.vacancyApplication.deleteMany();
  await prisma.vacancy.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.company.deleteMany();
};

export const createCompany = (over: Partial<Prisma.CompanyUncheckedCreateInput> = {}) =>
  prisma.company.create({ data: { name: `Firma ${uniq('c')} GmbH`, sector: 'logistics', city: 'Hamburg', phone: '+49 40 123456', status: 'ACTIVE', ...over } });

/** A company with one employer user (web session). */
export const asCompany = async (status: CompanyStatus = 'ACTIVE', opts: UserOpts = {}) => {
  const company = await createCompany({ status });
  const u = await createUser({ firstName: 'Hans', lastName: 'Becker', locale: 'de', ...opts, role: 'COMPANY' });
  const user = await prisma.user.update({ where: { id: u.user.id }, data: { companyId: company.id } });
  return { company, user, token: u.token, agent: sessionAgent(u.token) };
};

/** Candidate with a filled profile and a verified email. */
export const asCandidate = async (
  profile: Partial<Prisma.UserUpdateInput> = {},
  opts: UserOpts & { verified?: boolean } = {},
) => {
  const u = await createUser({ firstName: 'Ali', lastName: 'Məmmədov', ...opts, role: 'CLIENT' });
  const user = await prisma.user.update({
    where: { id: u.user.id },
    data: {
      profession: 'Sürücü',
      experienceYears: 5,
      germanLevel: 'B1',
      education: 'vocational',
      drivingLicence: 'B, C, CE',
      city: 'Gəncə',
      birthDate: new Date('1990-05-01T00:00:00Z'),
      address: 'Nizami küç. 10, Gəncə',
      phone: '+994501112233',
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      ...profile,
    },
  });
  return { user, token: u.token, agent: sessionAgent(u.token) };
};

export const createVacancy = (over: Partial<Prisma.VacancyUncheckedCreateInput> = {}) =>
  prisma.vacancy.create({
    data: {
      slug: uniq('lkw-fahrer-'),
      title: l10n('LKW-Fahrer'),
      description: l10n('Beschreibung'),
      sector: 'logistics',
      city: 'Hamburg',
      profession: 'LKW-Fahrer',
      germanLevel: 'A2',
      minExperience: 2,
      drivingLicence: 'CE',
      salaryMin: 2800,
      salaryMax: 3400,
      status: 'OPEN',
      publishedAt: new Date(),
      ...over,
    },
  });
