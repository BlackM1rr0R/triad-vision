import { prisma } from '../../db.js';
import { badRequest, notFound } from '../http.js';
import { syncPartnerFolder } from '../drive/caseFolders.js';
import { isClientDataFolder } from '../drive/workflowLinkRules.js';

/**
 * The partner's own Drive folder ("Gemeinsame Dokumente/Partner/<partner name>", lib/drive/caseFolders.ts) as the
 * partner portal sees it. Isolation rules (every request):
 *   - only the partner's folder and what lies below it — any other node is 404 (looks exactly like a missing one);
 *   - client folders (a case's drive folder, or one that ever was — DriveNode.clientFolderAt, so a folder left behind
 *     after its case was deleted stays hidden) and everything inside them, and copies of case documents anywhere, are
 *     NEVER shown here: client documents are reached only through the case view and its document permission;
 *   - nodes in the bin are invisible.
 * The staff drive API (/api/drive, STAFF+) is not reachable for partners at all.
 */

const MAX_DEPTH = 60;

export interface PartnerDriveNode {
  id: string;
  name: string;
  kind: 'FOLDER' | 'FILE';
  size: number | null;
  mimeType: string | null;
  updatedAt: Date;
}

/** The partner's folder id (created when missing, like the admin page does). Null when the drive failed. */
export const partnerDriveRoot = (partnerId: string) => syncPartnerFolder(partnerId);

/**
 * Ids among `ids` that are client data folders: a current client (case) folder, a folder that ever was one
 * (DriveNode.clientFolderAt — also after its case was deleted) or an "İş axını" copy of one (workflowCaseId).
 */
const caseFolderIds = async (ids: string[]) => {
  if (!ids.length) return new Set<string>();
  const [cases, marked] = await Promise.all([
    prisma.case.findMany({ where: { driveFolderId: { in: ids } }, select: { driveFolderId: true } }),
    prisma.driveNode.findMany({ where: { id: { in: ids }, OR: [{ clientFolderAt: { not: null } }, { workflowCaseId: { not: null } }] }, select: { id: true, clientFolderAt: true, workflowCaseId: true } }),
  ]);
  const current = new Set(cases.map((r) => r.driveFolderId!).filter(Boolean));
  for (const n of marked) if (isClientDataFolder(n, current)) current.add(n.id);
  return current;
};

/**
 * Pure part of the isolation check: `chain` is the node and its ancestors (node first, as loaded from the database,
 * stopping at the root or the top). Inside = the chain reaches `rootId`, no node on the way is deleted and none of
 * the nodes below the root is a client folder.
 */
export const isInsidePartnerFolder = (
  chain: { id: string; parentId: string | null; deletedAt: Date | null }[],
  rootId: string,
  clientFolders: Set<string>,
): boolean => {
  if (!chain.length) return false;
  for (const n of chain) {
    if (n.deletedAt) return false;
    if (n.id === rootId) return true;
    if (clientFolders.has(n.id)) return false;
  }
  return false;
};

/** The node if it lies in the partner's folder (the folder itself included), else 404 NODE_NOT_FOUND. */
export const nodeInPartnerFolder = async (rootId: string, nodeId: string) => {
  const chain: { id: string; parentId: string | null; deletedAt: Date | null; kind: 'FOLDER' | 'FILE'; name: string; documentId: string | null }[] = [];
  let cur: string | null = nodeId;
  for (let i = 0; cur && i < MAX_DEPTH; i++) {
    const row: { id: string; parentId: string | null; deletedAt: Date | null; kind: 'FOLDER' | 'FILE'; name: string; documentId: string | null } | null = await prisma.driveNode.findUnique({
      where: { id: cur },
      select: { id: true, parentId: true, deletedAt: true, kind: true, name: true, documentId: true },
    });
    if (!row) break;
    chain.push(row);
    if (row.id === rootId) break;
    cur = row.parentId;
  }
  const below = chain.filter((n) => n.id !== rootId).map((n) => n.id);
  if (!isInsidePartnerFolder(chain, rootId, await caseFolderIds(below))) throw notFound('NODE_NOT_FOUND');
  // Copies of case documents (DriveNode.documentId) are client data, wherever staff put them.
  if (chain[0]!.documentId) throw notFound('NODE_NOT_FOUND');
  // Breadcrumbs from the root down to the node.
  return { node: chain[0]!, path: chain.slice().reverse().map((n) => ({ id: n.id, name: n.name })) };
};

/** Children of a folder in the partner's folder (client folders left out). */
export const listPartnerFolder = async (rootId: string, folderId: string): Promise<{ folder: { id: string; name: string }; path: { id: string; name: string }[]; items: PartnerDriveNode[] }> => {
  const { node, path } = await nodeInPartnerFolder(rootId, folderId);
  if (node.kind !== 'FOLDER') throw badRequest('NOT_A_FOLDER');
  const rows = await prisma.driveNode.findMany({
    // Copies of case documents never show up here (client data stays behind the document permission).
    where: { parentId: node.id, deletedAt: null, documentId: null },
    orderBy: [{ kind: 'desc' }, { name: 'asc' }],
    take: 1000,
    select: { id: true, name: true, kind: true, size: true, mimeType: true, updatedAt: true },
  });
  const hidden = await caseFolderIds(rows.filter((r) => r.kind === 'FOLDER').map((r) => r.id));
  return { folder: { id: node.id, name: node.name }, path, items: rows.filter((r) => !hidden.has(r.id)) };
};
