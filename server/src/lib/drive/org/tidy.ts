import type { Prisma } from '@prisma/client';
import { prisma } from '../../../db.js';
import { nodeLiteSelect, type DriveAccessCtx, type NodeLite } from '../access.js';
import { collectSubtree } from '../items.js';
import { allows } from '../levels.js';
import { siblingNames } from '../names.js';
import { buildAutoName, baseNameOf, dayOf, getNamingSettings, NAMING_TOKENS, requirementTitle, type CaseNaming } from './naming.js';

/**
 * "Adları qaydaya sal": renames the existing files of a folder (and its sub-folders) to the naming pattern —
 * on request only, preview first. Files outside any client folder, files already named by the pattern and
 * final / locked files are left alone (the preview says why).
 */

export interface TidyRow {
  id: string;
  parentId: string;
  from: string;
  to: string;
  /** Why the file cannot be renamed (FILE_FINAL, FILE_LOCKED, INSUFFICIENT_ACCESS). */
  blocked?: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches names that already follow the pattern ("Məmmədov_Elçin_Pasport_2026-10-21 (2).pdf"). */
const patternRe = (pattern: string) => {
  const parts = pattern.split(/(\{\w+\})/g).map((p) => (/^\{\w+\}$/.test(p) && NAMING_TOKENS.some((t) => `{${t}}`.toLowerCase() === p.toLowerCase()) ? '.+?' : escapeRe(p)));
  return new RegExp(`^${parts.join('')}(?: \\(\\d+\\))?(?:\\.[^.]+)?$`, 'iu');
};

const tidySelect = { ...nodeLiteSelect, createdAt: true, documentId: true, finalAt: true, lockedById: true, lockedAt: true } satisfies Prisma.DriveNodeSelect;

const caseSelect = { id: true, number: true, driveFolderId: true, parentCaseId: true, client: { select: { firstName: true, lastName: true } } } as const;

export const tidyPreview = async (ctx: DriveAccessCtx, folderId: string): Promise<{ items: TidyRow[]; pattern: string }> => {
  const { pattern } = await getNamingSettings();
  const re = patternRe(pattern);
  const sub = await collectSubtree([folderId], tidySelect, { limit: 5000 });
  ctx.add(sub as unknown as NodeLite[]);
  const folderIds = sub.filter((n) => n.kind === 'FOLDER').map((n) => n.id);
  const chainIds = ctx.chain(folderId).map((n) => n.id);
  const cases = await prisma.case.findMany({ where: { driveFolderId: { in: [...new Set([...chainIds, ...folderIds])] } }, select: caseSelect });
  const naming = new Map<string, CaseNaming>();
  for (const c of cases) {
    let firstName = c.client.firstName;
    let lastName = c.client.lastName;
    if (c.parentCaseId) {
      const ev = await prisma.caseEvent.findFirst({ where: { caseId: c.id, type: 'FAMILY_MEMBER' }, orderBy: { createdAt: 'desc' }, select: { note: true } });
      try {
        const v = JSON.parse(ev?.note ?? '') as { firstName?: string; lastName?: string };
        if (v.firstName || v.lastName) [firstName, lastName] = [v.firstName ?? '', v.lastName ?? ''];
      } catch {
        // keep the client's name
      }
    }
    naming.set(c.driveFolderId!, { caseId: c.id, number: c.number, folderId: c.driveFolderId!, firstName, lastName });
  }
  const files = sub.filter((n) => n.kind === 'FILE');
  const docIds = files.map((f) => f.documentId).filter((d): d is string => !!d);
  const docs = docIds.length ? await prisma.document.findMany({ where: { id: { in: docIds } }, select: { id: true, createdAt: true, requirement: { select: { title: true } } } }) : [];
  const docById = new Map(docs.map((d) => [d.id, d]));

  /** The nearest client folder above a node. */
  const caseAbove = (nodeId: string) => {
    let cur = ctx.nodes.get(nodeId)?.parentId ?? null;
    for (let i = 0; cur && i < 100; i++) {
      const hit = naming.get(cur);
      if (hit) return hit;
      cur = ctx.nodes.get(cur)?.parentId ?? null;
    }
    return null;
  };

  const proposals: TidyRow[] = [];
  for (const f of files) {
    if (!f.parentId) continue;
    const c = caseAbove(f.id);
    if (!c) continue;
    if (re.test(f.name)) continue;
    const doc = f.documentId ? docById.get(f.documentId) : undefined;
    const parent = ctx.nodes.get(f.parentId);
    const typ = (doc && requirementTitle(doc.requirement?.title)) || (parent && parent.id !== c.folderId ? parent.name : '') || baseNameOf(f.name);
    const dot = f.name.lastIndexOf('.');
    const ext = dot > 0 ? f.name.slice(dot).toLowerCase() : '';
    const to = buildAutoName(pattern, { Nachname: c.lastName, Vorname: c.firstName, Typ: typ, Datum: dayOf(doc?.createdAt ?? f.createdAt), Fallnummer: c.number }, ext);
    if (to === f.name) continue;
    let blocked: string | undefined;
    if (!allows(ctx.level(f.id), 'EDIT')) blocked = 'INSUFFICIENT_ACCESS';
    else if (f.finalAt) blocked = 'FILE_FINAL';
    else if (f.lockedById && f.lockedById !== ctx.user.id && f.lockedAt && Date.now() - f.lockedAt.getTime() < 5 * 60 * 1000) blocked = 'FILE_LOCKED';
    proposals.push({ id: f.id, parentId: f.parentId, from: f.name, to, ...(blocked ? { blocked } : {}) });
  }

  // Unique names per folder: the names of files that keep their name stay taken.
  const byParent = new Map<string, TidyRow[]>();
  for (const p of proposals) byParent.set(p.parentId, [...(byParent.get(p.parentId) ?? []), p]);
  for (const [parentId, rows] of byParent) {
    const taken = await siblingNames(parentId);
    const moving = rows.filter((r) => !r.blocked);
    for (const r of moving) taken.delete(r.from.toLocaleLowerCase('en'));
    for (const r of moving) {
      let candidate = r.to;
      if (taken.has(candidate.toLocaleLowerCase('en'))) {
        const dot = candidate.lastIndexOf('.');
        const [stem, ext] = dot > 0 ? [candidate.slice(0, dot), candidate.slice(dot)] : [candidate, ''];
        for (let i = 2; taken.has(candidate.toLocaleLowerCase('en')); i++) candidate = `${stem} (${i})${ext}`;
      }
      taken.add(candidate.toLocaleLowerCase('en'));
      r.to = candidate;
    }
  }
  return { items: proposals.filter((p) => p.to !== p.from), pattern };
};
