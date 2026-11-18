/**
 * Pure rules of the case links in the drive (lib/drive/workflowLinks.ts): which "İş axını" folder belongs to a case,
 * which legacy copies a backfill may link by name, and what a left-behind client folder looks like. No I/O.
 */

const lower = (s: string) => s.toLocaleLowerCase('en');

export interface StageFolderRow {
  id: string;
  name: string;
  workflowCaseId: string | null;
  createdAt?: Date;
}

/**
 * The folders of one case directly below a stage folder: the ones linked to the case first (oldest first); only
 * when none is linked, a legacy copy with the client folder's name that is not linked to another case.
 */
export const caseStageFolders = <T extends StageFolderRow>(rows: T[], caseId: string, clientFolderName: string | null): T[] => {
  const byAge = [...rows].sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
  const linked = byAge.filter((r) => r.workflowCaseId === caseId);
  if (linked.length) return linked;
  if (!clientFolderName) return [];
  const legacy = byAge.find((r) => !r.workflowCaseId && lower(r.name) === lower(clientFolderName));
  return legacy ? [legacy] : [];
};

/**
 * Backfill by name: unlinked stage folders → the case whose (live) client folder carries the same name, only when
 * exactly one case does (two clients with the same folder name stay unlinked — the name fallback still covers them).
 */
export const matchWorkflowLinks = (unlinked: { id: string; name: string }[], clientFolders: { caseId: string; name: string }[]): { id: string; caseId: string }[] => {
  const byName = new Map<string, Set<string>>();
  for (const f of clientFolders) {
    const k = lower(f.name);
    byName.set(k, (byName.get(k) ?? new Set()).add(f.caseId));
  }
  const out: { id: string; caseId: string }[] = [];
  for (const w of unlinked) {
    const cases = byName.get(lower(w.name));
    if (cases?.size === 1) out.push({ id: w.id, caseId: [...cases][0]! });
  }
  return out;
};

/** Name of a client folder as lib/drive/caseFolders names them: "Vorname Nachname · Pass-Nr. X" or "… · TV-2026-0012". */
export const looksLikeClientFolderName = (name: string) => /·\s*(Pass-Nr\.\s*\S+|TV-\d{4}-\d+)/i.test(name);

/** Whether a folder is client data for the partner drive: a current client folder, ever one, or a workflow copy. */
export const isClientDataFolder = (n: { id: string; clientFolderAt?: Date | null; workflowCaseId?: string | null }, currentCaseFolders: Set<string>) =>
  currentCaseFolders.has(n.id) || !!n.clientFolderAt || !!n.workflowCaseId;
