/**
 * Referrer tree (pyramid of Baku referrers who bring clients; no commissions) — pure logic, no database.
 *
 * Every referrer (`ReferralPartner.isReferrer`) may have a parent referrer (`parentPartnerId`). The tree is shallow
 * (MAX_DEPTH levels, top level = depth 1) and never has cycles. A referrer sees only its own subtree (itself and the
 * referrers below it), never its parent or siblings — lib/referrers/service.ts and the portal routes rely on
 * `subtreeIds` / `isInSubtree` for that.
 */

export const MAX_DEPTH = 5;
export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface TreeNode {
  id: string;
  parentPartnerId: string | null;
}

/** parent id → child ids (input order kept). */
export const childrenIndex = <T extends TreeNode>(nodes: readonly T[]) => {
  const out = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentPartnerId) continue;
    const list = out.get(n.parentPartnerId);
    if (list) list.push(n.id);
    else out.set(n.parentPartnerId, [n.id]);
  }
  return out;
};

/**
 * `rootId` and every node below it (breadth first, root first). A broken cycle in the data never loops: each id is
 * visited once. Unknown root → [].
 */
export const subtreeIds = <T extends TreeNode>(nodes: readonly T[], rootId: string): string[] => {
  if (!nodes.some((n) => n.id === rootId)) return [];
  const kids = childrenIndex(nodes);
  const seen = new Set<string>([rootId]);
  const out = [rootId];
  for (let i = 0; i < out.length; i++) {
    for (const c of kids.get(out[i]!) ?? []) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
  }
  return out;
};

/** Strictly below `rootId` (the root itself excluded). */
export const descendantIds = <T extends TreeNode>(nodes: readonly T[], rootId: string) => subtreeIds(nodes, rootId).slice(1);

/** Whether `id` is `rootId` or below it. */
export const isInSubtree = <T extends TreeNode>(nodes: readonly T[], rootId: string, id: string) => subtreeIds(nodes, rootId).includes(id);

/** Ancestors of `id`, nearest first (stops on a cycle or an unknown parent). */
export const ancestorIds = <T extends TreeNode>(nodes: readonly T[], id: string): string[] => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let cur = byId.get(id)?.parentPartnerId ?? null;
  while (cur && !seen.has(cur) && byId.has(cur)) {
    out.push(cur);
    seen.add(cur);
    cur = byId.get(cur)!.parentPartnerId;
  }
  return out;
};

/** Level of a node: top level = 1. Unknown node → 0. */
export const depthOf = <T extends TreeNode>(nodes: readonly T[], id: string) => (nodes.some((n) => n.id === id) ? ancestorIds(nodes, id).length + 1 : 0);

/** How many levels the subtree of `id` spans (a leaf = 1). */
export const subtreeHeight = <T extends TreeNode>(nodes: readonly T[], id: string): number => {
  const kids = childrenIndex(nodes);
  const seen = new Set<string>();
  const walk = (n: string): number => {
    if (seen.has(n)) return 0;
    seen.add(n);
    return 1 + Math.max(0, ...(kids.get(n) ?? []).map(walk));
  };
  return nodes.some((n) => n.id === id) ? walk(id) : 0;
};

export type MoveError = 'REFERRER_NOT_FOUND' | 'PARENT_NOT_FOUND' | 'REFERRER_CYCLE' | 'REFERRER_TOO_DEEP';

/**
 * Whether `id` may be placed under `newParentId` (null = top level): the parent must exist, must not be the node or
 * one of its descendants (cycle), and the whole moved subtree must still fit in MAX_DEPTH levels. null = allowed.
 */
export const moveError = <T extends TreeNode>(nodes: readonly T[], id: string, newParentId: string | null, maxDepth = MAX_DEPTH): MoveError | null => {
  if (!nodes.some((n) => n.id === id)) return 'REFERRER_NOT_FOUND';
  if (newParentId === null) return subtreeHeight(nodes, id) > maxDepth ? 'REFERRER_TOO_DEEP' : null;
  if (!nodes.some((n) => n.id === newParentId)) return 'PARENT_NOT_FOUND';
  if (isInSubtree(nodes, id, newParentId)) return 'REFERRER_CYCLE';
  return depthOf(nodes, newParentId) + subtreeHeight(nodes, id) > maxDepth ? 'REFERRER_TOO_DEEP' : null;
};

/** Whether a new referrer may be created under `parentId` (its depth would be parent depth + 1). */
export const canAddChild = <T extends TreeNode>(nodes: readonly T[], parentId: string, maxDepth = MAX_DEPTH) => {
  const d = depthOf(nodes, parentId);
  return d > 0 && d + 1 <= maxDepth;
};

// ─── KPIs ─────────────────────────────────────────────────────────────

export interface NodeStats {
  /** Distinct clients the referrer brought (owned clients + clients of cases linked to it). */
  clients: number;
  activeCases: number;
  approvedVisas: number;
  paidCents: number;
  outstandingCents: number;
}

export const emptyStats = (): NodeStats => ({ clients: 0, activeCases: 0, approvedVisas: 0, paidCents: 0, outstandingCents: 0 });

export const addStats = (a: NodeStats, b: NodeStats): NodeStats => ({
  clients: a.clients + b.clients,
  activeCases: a.activeCases + b.activeCases,
  approvedVisas: a.approvedVisas + b.approvedVisas,
  paidCents: a.paidCents + b.paidCents,
  outstandingCents: a.outstandingCents + b.outstandingCents,
});

/**
 * Own figures of each node summed over its subtree (the node's own included). A client belongs to exactly one
 * referrer, so the sums do not count anyone twice. Nodes without stats count as zero.
 */
export const aggregateSubtree = <T extends TreeNode>(nodes: readonly T[], own: ReadonlyMap<string, NodeStats>) => {
  const out = new Map<string, NodeStats>();
  for (const n of nodes) {
    out.set(
      n.id,
      subtreeIds(nodes, n.id).reduce((acc, id) => addStats(acc, own.get(id) ?? emptyStats()), emptyStats()),
    );
  }
  return out;
};
