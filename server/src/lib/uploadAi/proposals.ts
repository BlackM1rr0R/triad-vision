import type { DocStage } from '@prisma/client';
import { prisma } from '../../db.js';
import { nameLatin, nameMatches } from '../aiDocs/docCheck.js';
import { STAGE_FOLDER } from '../drive/cases.js';
import { findTypeFolder, isTypeFolderName } from '../drive/typeFolders.js';
import { parseDay } from '../expiry/rules.js';
import { scoreText } from './classify.js';
import type { CaseContext, Subject } from './context.js';
import { proposedFileName } from './naming.js';
import { DEFAULT_STAGE, REQUIREMENT_KEYS, satisfiesKey, typeForRequirementKey, type DocType, type InsightAction, type InsightFields, type InsightFlag, type Proposals } from './types.js';

/**
 * Turns a recognition into proposals (pure decisions + a few lookups, no writes):
 *   rename  the standard name, when it differs from the current one;
 *   link    the case requirement the type belongs to — a document uploaded into the wrong slot, a staff
 *           document without one, or a drive file not yet attached to the case;
 *   move    (drive) the folder of the type inside the client folder ("Reisepass", "Lebenslauf" …), else the
 *           stage folder ("Erstdokumente", "Botschaftsunterlagen" …);
 *   expiry  the validity date, when it differs from the document's;
 * and the flags: holder ≠ case client, expired, expires within 6 months, wrong requirement.
 */

const MONTH_MS = 30.44 * 24 * 3600 * 1000;
/** Below this confidence nothing is proposed (the chip still shows the guess). */
export const MIN_PROPOSAL_CONFIDENCE = 0.5;

/** The type a requirement asks for: by its key, else by keywords in its title. */
export const expectedTypeOf = (r: { key: string | null; title: unknown } | undefined | null): DocType | null => {
  if (!r) return null;
  const byKey = typeForRequirementKey(r.key);
  if (byKey || r.key) return byKey;
  const t = (r.title ?? {}) as Record<string, string>;
  const [best, second] = scoreText([t.en, t.de, t.az, t.ru].filter(Boolean).join(' · '));
  return best && (!second || second.score < best.score) ? best.type : null;
};

const fits = (type: DocType, r: { key: string | null; title: unknown }) => (r.key ? satisfiesKey(type, r.key) : expectedTypeOf(r) === type);

/** The requirement of the case a type belongs in: by key priority, the file's stage first, open slots first. */
export const matchRequirement = (type: DocType, ctx: CaseContext, prefer?: { stage?: DocStage; exceptId?: string | null }) => {
  if (type === 'OTHER') return null;
  const keys = REQUIREMENT_KEYS[type];
  const cands = ctx.requirements.filter((r) => r.id !== prefer?.exceptId && fits(type, r));
  if (!cands.length) return null;
  const rank = (r: CaseContext['requirements'][number]) => {
    const k = r.key ? keys.indexOf(r.key) : keys.length;
    const open = r.docs.some((d) => d.status === 'ACCEPTED' || d.status === 'PENDING') ? 1 : 0;
    return [prefer?.stage && r.stage === prefer.stage ? 0 : 1, open, k < 0 ? 99 : k];
  };
  return [...cands].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  })[0];
};

export interface ProposalResult {
  proposedName: string | null;
  proposedRequirementId: string | null;
  proposedFolderId: string | null;
  expiryDate: Date | null;
  flags: InsightFlag[];
  proposals: Proposals;
}

const lower = (s: string) => s.toLocaleLowerCase('en');

/**
 * Does the name read from the document belong to the case's person? The last name decides (spelling tolerant:
 * ə/e, ı/i, ş/sh, Cyrillic …, see nameSkeleton). On a family member's case the first name must fit as well —
 * relatives share the last name, and a parent's passport in the child's case is exactly the mistake to catch.
 */
export const holderMatches = (holder: string, fields: InsightFields, person: { firstName: string; lastName: string }, opts: { member?: boolean } = {}) => {
  if (!nameMatches(holder, person)) return false;
  if (!opts.member) return true;
  // First names compared in plain Latin letters with their vowels (the consonant skeleton is too coarse).
  const want = nameLatin(person.firstName);
  if (!want) return true;
  const given = (fields.firstName ? fields.firstName.split(/[\s,/.-]+/) : holder.split(/[\s,/.-]+/)).map(nameLatin).filter(Boolean);
  const head = (x: string) => x.slice(0, Math.min(3, x.length));
  return given.some((g) => g.startsWith(head(want)) || want.startsWith(head(g)));
};

export const buildProposals = async (input: {
  docType: DocType;
  confidence: number;
  fields: InsightFields;
  subject: Subject;
  ctx: CaseContext | null;
  clientFolderId?: string | null;
  now?: Date;
}): Promise<ProposalResult> => {
  const { docType, confidence, fields, subject: s, ctx } = input;
  const now = input.now ?? new Date();
  const flags: InsightFlag[] = [];
  const actions: InsightAction[] = [];
  const proposals: Proposals = { actions, currentName: s.name };
  const sure = confidence >= MIN_PROPOSAL_CONFIDENCE && docType !== 'OTHER';

  // Flags: holder vs. the case client, validity.
  const holder = fields.holderName ?? [fields.firstName, fields.lastName].filter(Boolean).join(' ');
  if (ctx && holder && !holderMatches(holder, fields, ctx.client, { member: ctx.member })) {
    flags.push('NAME_MISMATCH');
    // Both names for the warning staff / client see ("… does not match the client: X ≠ Y").
    proposals.holder = { found: holder.slice(0, 160), expected: `${ctx.client.firstName} ${ctx.client.lastName}`.trim() };
  }
  const expiry = parseDay(fields.expiryDate);
  if (expiry) {
    const left = expiry.getTime() - now.getTime();
    if (left < 0) flags.push('EXPIRED');
    else if (left < 6 * MONTH_MS) flags.push('EXPIRES_SOON');
  }

  // Rename (the client's name when the document carries none; a foreign holder keeps their own name).
  let proposedName: string | null = null;
  if (sure) {
    const person = flags.includes('NAME_MISMATCH') ? null : ctx?.client;
    const name = proposedFileName({ type: docType, fields, currentName: s.name, person });
    if (name && lower(name) !== lower(s.name)) {
      proposedName = name;
      actions.push('rename');
    }
  }

  // Requirement.
  let proposedRequirementId: string | null = null;
  if (ctx) {
    if (s.kind === 'document') {
      const current = ctx.requirements.find((r) => r.id === s.requirementId);
      if (current) {
        const expected = expectedTypeOf(current);
        proposals.expected = { requirementId: current.id, docType: expected };
        if (sure && confidence >= 0.6 && expected && !fits(docType, current)) {
          flags.push('WRONG_REQUIREMENT');
          const better = matchRequirement(docType, ctx, { stage: s.stage, exceptId: current.id });
          if (better) proposedRequirementId = better.id;
        }
      } else if (sure && (s.stage === 'INITIAL' || s.stage === 'EMBASSY' || s.stage === 'OTHER')) {
        const better = matchRequirement(docType, ctx, { stage: s.stage });
        if (better) proposedRequirementId = better.id;
      }
    } else if (sure && !s.documentId) {
      const better = matchRequirement(docType, ctx);
      // A drive file is attached only to a slot that is still open (no accepted / pending upload).
      if (better && !better.docs.some((d) => d.status === 'ACCEPTED' || d.status === 'PENDING')) proposedRequirementId = better.id;
    }
  }
  if (proposedRequirementId) {
    const r = ctx!.requirements.find((x) => x.id === proposedRequirementId)!;
    proposals.requirement = { id: r.id, title: r.title, stage: r.stage };
    actions.push('link');
  }

  // Move (drive files inside a client folder).
  let proposedFolderId: string | null = null;
  if (s.kind === 'drive' && sure && input.clientFolderId) {
    // The folder of the type ("Reisepass", "Lebenslauf" … — lib/drive/typeFolders.ts), else the stage folder.
    const typeFolder = await findTypeFolder(input.clientFolderId, docType);
    const stage = proposals.requirement?.stage ?? DEFAULT_STAGE[docType];
    const folderName = typeFolder?.name ?? STAGE_FOLDER[stage];
    const parent = s.parentId ? await prisma.driveNode.findUnique({ where: { id: s.parentId }, select: { name: true, parentId: true } }) : null;
    const alreadyThere = parent && parent.parentId === input.clientFolderId && (typeFolder ? isTypeFolderName(docType, parent.name) : lower(parent.name) === lower(folderName));
    if (!alreadyThere) {
      if (typeFolder) proposedFolderId = typeFolder.id;
      else {
        const rows = await prisma.driveNode.findMany({ where: { parentId: input.clientFolderId, name: folderName, kind: 'FOLDER', deletedAt: null }, select: { id: true, name: true } });
        proposedFolderId = rows.find((r) => lower(r.name) === lower(folderName))?.id ?? null;
      }
      proposals.folder = { parentId: input.clientFolderId, name: folderName, id: proposedFolderId };
      actions.push('move');
    }
  }

  // Expiry: on the document (a drive file only through its case document, existing or created by "link").
  if (expiry && sure) {
    if (s.kind === 'document') {
      if ((s.expiresAt?.getTime() ?? null) !== expiry.getTime()) actions.push('expiry');
    } else if (s.documentId || actions.includes('link')) {
      const doc = s.documentId ? await prisma.document.findUnique({ where: { id: s.documentId }, select: { expiresAt: true } }) : null;
      if ((doc?.expiresAt?.getTime() ?? null) !== expiry.getTime()) actions.push('expiry');
    }
  }

  return { proposedName, proposedRequirementId, proposedFolderId, expiryDate: expiry, flags, proposals };
};
