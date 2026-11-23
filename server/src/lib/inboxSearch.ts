import type { Prisma } from '@prisma/client';

/** Every word of the search must match the client's first / last name, the case number or the client's phone. */
export const inboxSearchWhere = (q: string | undefined): Prisma.CaseWhereInput => {
  const words = (q ?? '').split(/\s+/).filter(Boolean).slice(0, 5);
  if (!words.length) return {};
  return {
    AND: words.map((w) => ({
      OR: [{ number: { contains: w } }, { client: { firstName: { contains: w } } }, { client: { lastName: { contains: w } } }, { client: { phone: { contains: w } } }],
    })),
  };
};
