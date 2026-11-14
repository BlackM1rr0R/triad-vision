/**
 * One-off (2026-11-14): carries the "no apostille / translation, no embassy booking" wording over to the CMS rows
 * that already exist in a database. The seeds only create rows, so production still holds the old texts.
 *
 *   cd server && npx tsx prisma/fix-service-claims.ts            # dry run: prints what would change
 *   cd server && npx tsx prisma/fix-service-claims.ts --apply    # writes the changes
 *
 * What it does
 * - Text fixes (fix-service-claims.data.ts): replaces the old seeded sentences with the new seed wording in
 *   Service, Faq, GuidePage, ContractTemplate, TrainingLesson, AutomationRule and Setting "quotes" — only where
 *   the stored text still contains the old seeded wording (rules: fix-service-claims.rules.ts). Text an owner has
 *   rewritten is never touched: a fix whose old wording is not found anymore is listed for manual review.
 * - Removes the Service feature items that only advertised translation / apostille ("Notarisation and apostille" …).
 * - Unpublishes (never deletes) rows that exist only to sell apostille / translation: Service, ServicePackage,
 *   Post and GuidePage rows whose slug / key names such a service. The seeds ship none; this catches rows created
 *   in the admin.
 * - Deactivates the shipped "Übersetzung und Beglaubigung von Dokumenten" item of a saved quote catalogue.
 * - Lists every remaining place (model, id, field) that still mentions apostille, translation or an embassy
 *   appointment, for a human check. A hit is not necessarily wrong: guides may state that a document needs an apostille.
 * - Idempotent: a second run reports nothing to change. The output has ids, slugs, field names and categories only
 *   (no texts, no personal data).
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { TEXT_FIXES } from './fix-service-claims.data.js';
import {
  applyFixes,
  claimHits,
  deactivateQuoteTranslationItem,
  fixesFor,
  isSalesOnlySlug,
  reviewHits,
  type FixModel,
} from './fix-service-claims.rules.js';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

interface Row {
  id: string;
  /** Printed name: slug / key / exampleKey. */
  label: string;
  /** Matched against TextFix.where. */
  rowKey?: string | null;
  published?: boolean;
  fields: Record<string, unknown>;
}

interface Target {
  model: FixModel | 'ServicePackage' | 'Post';
  load: () => Promise<Row[]>;
  save: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  /** Present for models with a published flag whose rows may exist only to sell apostille / translation. */
  unpublish?: (id: string) => Promise<unknown>;
  salesOnly?: (row: Row) => boolean;
  /** true: the review scan is skipped (e.g. Setting values may hold anything; only the fixed keys are scanned). */
  scanOnly?: (row: Row) => boolean;
}

const json = (v: unknown) => (v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue));
const pickFields = (r: Record<string, unknown>, names: string[]) => Object.fromEntries(names.map((n) => [n, r[n]]));
const toData = (data: Record<string, unknown>, stringFields: string[]) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, stringFields.includes(k) ? v : json(v)]));

const SERVICE_FIELDS = ['title', 'summary', 'body', 'features', 'steps', 'duration', 'seoTitle', 'seoDescription'];
const PACKAGE_FIELDS = ['title', 'summary', 'features'];
const FAQ_FIELDS = ['question', 'answer'];
const POST_FIELDS = ['title', 'excerpt', 'body', 'seoTitle', 'seoDescription'];
const GUIDE_FIELDS = ['title', 'description', 'body', 'faq'];
const GUIDE_STRINGS = ['title', 'description', 'body'];

const SETTING_KEYS_WITH_FIXES = [...new Set(TEXT_FIXES.filter((f) => f.model === 'Setting').map((f) => f.where!))];

const TARGETS: Target[] = [
  {
    model: 'Service',
    load: async () =>
      (await prisma.service.findMany({ orderBy: { sortOrder: 'asc' } })).map((r) => ({
        id: r.id,
        label: r.slug,
        rowKey: r.slug,
        published: r.published,
        fields: pickFields(r, SERVICE_FIELDS),
      })),
    save: (id, data) => prisma.service.update({ where: { id }, data: toData(data, []) }),
    unpublish: (id) => prisma.service.update({ where: { id }, data: { published: false } }),
    salesOnly: (r) => isSalesOnlySlug(r.label),
  },
  {
    model: 'ServicePackage',
    load: async () =>
      (await prisma.servicePackage.findMany({ orderBy: { sortOrder: 'asc' } })).map((r) => ({
        id: r.id,
        label: r.slug,
        published: r.published,
        fields: pickFields(r, PACKAGE_FIELDS),
      })),
    save: (id, data) => prisma.servicePackage.update({ where: { id }, data: toData(data, []) }),
    unpublish: (id) => prisma.servicePackage.update({ where: { id }, data: { published: false } }),
    salesOnly: (r) => isSalesOnlySlug(r.label),
  },
  {
    model: 'Faq',
    load: async () =>
      (await prisma.faq.findMany({ orderBy: { sortOrder: 'asc' } })).map((r) => ({
        id: r.id,
        label: `faq#${r.sortOrder}`,
        published: r.published,
        fields: pickFields(r, FAQ_FIELDS),
      })),
    save: (id, data) => prisma.faq.update({ where: { id }, data: toData(data, []) }),
  },
  {
    model: 'Post',
    load: async () =>
      (await prisma.post.findMany({ orderBy: { publishedAt: 'asc' } })).map((r) => ({
        id: r.id,
        label: r.slug,
        published: r.published,
        fields: pickFields(r, POST_FIELDS),
      })),
    save: (id, data) => prisma.post.update({ where: { id }, data: toData(data, []) }),
    unpublish: (id) => prisma.post.update({ where: { id }, data: { published: false } }),
    salesOnly: (r) => isSalesOnlySlug(r.label),
  },
  {
    model: 'GuidePage',
    load: async () =>
      (await prisma.guidePage.findMany({ orderBy: [{ key: 'asc' }, { locale: 'asc' }] })).map((r) => ({
        id: r.id,
        label: `${r.key}/${r.locale}`,
        rowKey: r.key,
        published: r.published,
        fields: pickFields(r, GUIDE_FIELDS),
      })),
    save: (id, data) => prisma.guidePage.update({ where: { id }, data: toData(data, GUIDE_STRINGS) }),
    unpublish: (id) => prisma.guidePage.update({ where: { id }, data: { published: false } }),
    salesOnly: (r) => isSalesOnlySlug(r.rowKey),
  },
  {
    model: 'ContractTemplate',
    load: async () =>
      (await prisma.contractTemplate.findMany({ orderBy: { createdAt: 'asc' } })).map((r) => ({
        id: r.id,
        label: `${r.kind}/${r.language}`,
        fields: { name: r.name, body: r.body },
      })),
    save: (id, data) => prisma.contractTemplate.update({ where: { id }, data: data as Prisma.ContractTemplateUpdateInput }),
  },
  {
    model: 'TrainingLesson',
    load: async () =>
      (await prisma.trainingLesson.findMany({ orderBy: { createdAt: 'asc' } })).map((r) => ({
        id: r.id,
        label: `lesson#${r.sortOrder}`,
        fields: { title: r.title, body: r.body, quiz: r.quiz },
      })),
    save: (id, data) => prisma.trainingLesson.update({ where: { id }, data: toData(data, ['title', 'body']) }),
  },
  {
    model: 'AutomationRule',
    load: async () =>
      (await prisma.automationRule.findMany({ orderBy: { createdAt: 'asc' } })).map((r) => ({
        id: r.id,
        label: r.exampleKey ?? 'custom',
        rowKey: r.exampleKey,
        fields: { name: r.name, description: r.description, actions: r.actions },
      })),
    save: (id, data) => prisma.automationRule.update({ where: { id }, data: toData(data, ['name', 'description']) }),
  },
  {
    model: 'Setting',
    load: async () =>
      (await prisma.setting.findMany({ where: { key: { in: SETTING_KEYS_WITH_FIXES } } })).map((r) => ({
        id: r.key,
        label: r.key,
        rowKey: r.key,
        fields: { value: r.value },
      })),
    save: (key, data) => prisma.setting.update({ where: { key }, data: { value: data.value as Prisma.InputJsonValue } }),
  },
];

interface Planned {
  target: Target;
  row: Row;
  data: Record<string, unknown>;
  lines: string[];
}

const main = async () => {
  const planned: Planned[] = [];
  const unpublish: { target: Target; row: Row }[] = [];
  const review: string[] = [];
  const mentioned: string[] = [];
  const flagged: string[] = [];
  const fixHits = new Map<number, number>();
  const fixPresent = new Set<number>();
  const fixRowSeen = new Set<number>();

  for (const target of TARGETS) {
    const rows = await target.load();
    for (const row of rows) {
      const fixes = target.model === 'ServicePackage' || target.model === 'Post' ? [] : fixesFor(TEXT_FIXES, target.model, row.rowKey);
      for (const f of fixes) fixRowSeen.add(f.index);
      const data: Record<string, unknown> = {};
      const lines: string[] = [];
      const after: Record<string, unknown> = { ...row.fields };
      for (const [field, value] of Object.entries(row.fields)) {
        if (value === null || value === undefined) continue;
        const res = applyFixes(value, fixes);
        res.present.forEach((i) => fixPresent.add(i));
        for (const c of res.changes) {
          fixHits.set(c.fix, (fixHits.get(c.fix) ?? 0) + 1);
          lines.push(`  ${target.model}  ${row.id}  ${row.label}  ${field}${c.path ? `.${c.path}` : ''}  ${c.action} (fix #${c.fix})`);
        }
        for (const fl of res.flags) flagged.push(`  ${target.model}  ${row.id}  ${row.label}  ${field}${fl.path ? `.${fl.path}` : ''}  fix #${fl.fix}: ${fl.reason}`);
        if (res.changed) {
          data[field] = res.value;
          after[field] = res.value;
        }
      }
      if (target.model === 'Setting' && row.id === 'quotes') {
        const q = deactivateQuoteTranslationItem(after.value);
        if (q) {
          data.value = q.value;
          after.value = q.value;
          lines.push(`  Setting  quotes  quotes  value.${q.path}  deactivated (shipped translation catalogue item)`);
        }
      }
      if (lines.length) planned.push({ target, row, data, lines });

      if (target.unpublish && target.salesOnly?.(row) && row.published) unpublish.push({ target, row });

      for (const [field, value] of Object.entries(after)) {
        const where = `  ${target.model}  ${row.id}  ${row.label}${row.published === false ? '  (unpublished)' : ''}  ${field}`;
        const claims = claimHits(value);
        const mentions = reviewHits(value);
        if (claims.length) review.push(`${where}  ${claims.join(', ')}`);
        else if (mentions.length) mentioned.push(`${where}  ${mentions.join(', ')}`);
      }
    }
  }

  console.log(`Text fixes defined: ${TEXT_FIXES.length}`);
  console.log(`\nRows to update: ${planned.length}`);
  for (const p of planned) p.lines.forEach((l) => console.log(l));

  console.log(`\nRows to unpublish (exist only to sell apostille / translation): ${unpublish.length}`);
  for (const u of unpublish) console.log(`  ${u.target.model}  ${u.row.id}  ${u.row.label}  published → false`);

  const found = (i: number) => fixHits.has(i) || fixPresent.has(i);
  const groupFound = (g: string) => TEXT_FIXES.some((f, i) => f.group === g && found(i));
  const notFound = TEXT_FIXES.map((f, i) => ({ f, i })).filter(({ f, i }) => !found(i) && f.new !== null && !(f.group && groupFound(f.group)));
  console.log(`\nFixes whose seeded wording was not found (owner-edited, deleted or never seeded) — check by hand: ${notFound.length}`);
  for (const { f, i } of notFound) {
    console.log(`  fix #${i}  ${f.model}${f.where ? ` (${f.where})` : ''}${fixRowSeen.has(i) ? '' : '  — no such row'}  old starts: "${f.old.slice(0, 50)}${f.old.length > 50 ? '…' : ''}"`);
  }
  const already = TEXT_FIXES.filter((_, i) => !fixHits.has(i) && fixPresent.has(i)).length;
  console.log(`Fixes already applied: ${already}`);

  console.log(`\nOld wording left inside a longer text (not removed automatically): ${flagged.length}`);
  flagged.forEach((l) => console.log(l));

  console.log(`\nLikely leftover claims — a sentence with "we / our" next to apostille / translation / embassy appointment, check by hand: ${review.length}`);
  review.forEach((l) => console.log(l));
  console.log(`\nOther mentions (usually legitimate requirement info; skim when time allows): ${mentioned.length}`);
  mentioned.forEach((l) => console.log(l));

  if (!apply) {
    console.log('\nDry run. Run again with --apply to write the changes.');
    return;
  }
  let written = 0;
  for (const p of planned) {
    await p.target.save(p.row.id, p.data);
    written++;
  }
  let hidden = 0;
  for (const u of unpublish) {
    await u.target.unpublish!(u.row.id);
    hidden++;
  }
  console.log(`\nUpdated ${written} rows, unpublished ${hidden}.`);
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
