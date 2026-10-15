import type { PrismaClient } from '@prisma/client';
import { seedDefaultTemplates } from '../../src/lib/docsIntel/requirementTemplates.js';

/**
 * Creates the global requirement templates (the list every new case gets) from the built-in defaults.
 * Idempotent: does nothing once a global set exists. Called from prisma/seed.ts.
 */
export const seedRequirements = async (prisma: PrismaClient) => {
  const created = await seedDefaultTemplates(prisma);
  console.log(created ? `Requirement templates: ${created} created` : 'Requirement templates: already present');
  return created;
};
