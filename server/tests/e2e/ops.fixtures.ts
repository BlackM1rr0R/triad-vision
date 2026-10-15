import { prisma } from '../helpers/db';
import { cleanJobs } from './vacancies.fixtures';

/** Operations-module rows are not part of the shared resetDb; clear them (and the jobs area) per test. */
export const cleanOps = async () => {
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhook.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.kbArticle.deleteMany();
  await prisma.kbCategory.deleteMany();
  await prisma.reminderLog.deleteMany({ where: { key: { startsWith: 'interview-' } } });
  await cleanJobs();
};

const HOUR = 60 * 60 * 1000;

/** `hours` from now, rounded to the minute (ISO strings compare cleanly). */
export const inHours = (hours: number) => new Date(Math.floor((Date.now() + hours * HOUR) / 60000) * 60000);
