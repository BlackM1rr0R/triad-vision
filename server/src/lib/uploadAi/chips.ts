import { prisma } from '../../db.js';
import { ACTIONS, isDocType, type DocType } from './types.js';

/**
 * The small "AI" chip of drive rows: detected type, open proposals, low-quality marker. One query for a whole
 * folder listing; kept free of the pipeline's imports (drive/items.ts loads it on every listing).
 */
export interface UploadAiChip {
  id: string;
  docType: DocType;
  status: string;
  qualityLevel: string | null;
  open: number;
  flags: string[];
  /** NAME_MISMATCH: the name on the document and the case person's name (warning on the row). */
  holder?: { found: string; expected: string } | null;
}

const openActions = (proposals: unknown) => {
  const a = (proposals as { actions?: unknown } | null)?.actions;
  return Array.isArray(a) ? a.filter((x) => (ACTIONS as readonly string[]).includes(x)).length : 0;
};

const holderOf = (proposals: unknown) => {
  const h = (proposals as { holder?: { found?: unknown; expected?: unknown } } | null)?.holder;
  return h && typeof h.found === 'string' && typeof h.expected === 'string' ? { found: h.found, expected: h.expected } : null;
};

export const chipsForNodes = async (nodeIds: string[]): Promise<Map<string, UploadAiChip>> => {
  if (!nodeIds.length) return new Map();
  const rows = await prisma.documentInsight
    .findMany({ where: { driveNodeId: { in: nodeIds } }, select: { id: true, driveNodeId: true, docType: true, status: true, qualityLevel: true, proposals: true, flags: true } })
    .catch(() => []);
  return new Map(
    rows.map((r) => [
      r.driveNodeId!,
      {
        id: r.id,
        docType: isDocType(r.docType) ? r.docType : 'OTHER',
        status: r.status,
        qualityLevel: r.qualityLevel,
        open: r.status === 'PROPOSED' ? openActions(r.proposals) : 0,
        flags: Array.isArray(r.flags) ? (r.flags as string[]) : [],
        holder: holderOf(r.proposals),
      },
    ]),
  );
};

/** Adds `uploadAi` to file items that have an insight. */
export const decorateUploadAi = async <T extends { id: string; kind: string; uploadAi?: UploadAiChip }>(items: T[]) => {
  const chips = await chipsForNodes(items.filter((i) => i.kind === 'FILE').map((i) => i.id));
  for (const item of items) {
    const c = chips.get(item.id);
    if (c) item.uploadAi = c;
  }
  return items;
};
