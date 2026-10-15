/**
 * One-time import of the old staff workspaces (/docs) into the team drive (/workspace/drive).
 *
 *   npx tsx prisma/import-docs-to-drive.ts --dry-run   # report only, writes nothing
 *   npx tsx prisma/import-docs-to-drive.ts             # import (safe to re-run: only adds what is missing)
 *
 * In production:  docker compose exec api npx tsx prisma/import-docs-to-drive.ts --dry-run
 *
 * Files are COPIED from <DOCS_DIR>/<slug>/... into <DOCS_DIR>/drive/<key>; the originals and the old
 * tables are left untouched.
 */
import 'dotenv/config';
import { prisma } from '../src/db.js';
import { importDocsToDrive } from '../src/lib/drive/importDocs.js';

const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-n');

const main = async () => {
  console.log(`Importing /docs workspaces into the team drive${dryRun ? ' (DRY RUN — nothing is written)' : ''}…`);
  const s = await importDocsToDrive({ dryRun, log: (line) => console.log(`  ${line}`) });
  console.log('');
  console.log(`Workspaces:        ${s.workspaces}`);
  console.log(`Folders created:   ${s.foldersCreated} (already there: ${s.foldersExisting})`);
  console.log(`Files imported:    ${s.filesImported} (${(s.bytesCopied / 1024 / 1024).toFixed(2)} MB copied)`);
  console.log(`Files skipped:     ${s.filesSkipped} (already imported)`);
  console.log(`Grants:            ${s.grantsUpserted}`);
  if (s.filesMissing.length) {
    console.log(`Missing on disk:   ${s.filesMissing.length}`);
    for (const f of s.filesMissing) console.log(`  - ${f}`);
  }
  if (s.errors.length) {
    console.log(`Errors:            ${s.errors.length}`);
    for (const e of s.errors) console.log(`  ! ${e}`);
    process.exitCode = 1;
  }
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
