/**
 * One-off: normalises the stored phone numbers of user accounts (candidates / clients, agents, employer
 * users, staff) to E.164 with the shared rules of src/lib/phone.ts.
 *
 *   cd server && npx tsx prisma/normalize-phones.ts            # dry run: prints what would change
 *   cd server && npx tsx prisma/normalize-phones.ts --apply    # writes the changes
 *
 * - Country context for local numbers comes from the role: COMPANY users are German ("0151…" → "+49151…"),
 *   CLIENT / AGENT users Azerbaijani; staff only get the unambiguous rules (Azerbaijani "0XX…" shape, 00 / +).
 * - Values the normaliser cannot read unambiguously are NOT touched; their ids are listed so staff can fix them.
 * - Idempotent: a normalised number is a fixed point, so a second run reports 0 updates. Each update is
 *   conditional on the old value (updateMany where phone = old), so a number edited meanwhile is skipped.
 * - The printed lists hold ids and masked numbers only (personal data stays out of logs).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { phoneCountryForRole } from '../src/lib/phone.js';
import { planPhoneMigration } from '../src/lib/phoneField.js';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

const mask = (v: string) => (v.length > 6 ? `${v.slice(0, 4)}${'•'.repeat(Math.max(0, v.length - 7))}${v.slice(-3)}` : '•••');

const main = async () => {
  const rows = await prisma.user.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true, role: true } });
  const plan = planPhoneMigration(rows.map((r) => ({ id: r.id, phone: r.phone, country: phoneCountryForRole(r.role) })));
  console.log(`Users with a phone: ${rows.length}`);
  console.log(`Already normalised: ${plan.unchanged}`);
  console.log(`To normalise: ${plan.updates.length}`);
  for (const u of plan.updates.slice(0, 50)) console.log(`  ${u.id}  ${mask(u.from)} → ${mask(u.to)}`);
  if (plan.updates.length > 50) console.log(`  … and ${plan.updates.length - 50} more`);
  console.log(`Left as they are (cannot be read unambiguously): ${plan.flagged.length}`);
  for (const f of plan.flagged) console.log(`  ${f.id}  ${f.reason}  ${mask(f.value)}`);

  if (!apply) {
    console.log('\nDry run. Run again with --apply to write the changes.');
    return;
  }
  let written = 0;
  for (const u of plan.updates) {
    const r = await prisma.user.updateMany({ where: { id: u.id, phone: u.from }, data: { phone: u.to } });
    written += r.count;
  }
  console.log(`\nUpdated ${written} of ${plan.updates.length} users.`);
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
