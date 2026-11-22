/**
 * Pure rules of the client folder actions in the documents section (no database; unit-tested directly).
 */

/** One case's outcome in a bulk action: ok, skipped (nothing to do) or failed with an error code. */
export interface CaseResult {
  caseId: string;
  ok: boolean;
  /** Nothing changed (already in the stage / already this partner): counted apart from the failures. */
  skipped?: boolean;
  error?: string;
  number?: string;
  name?: string;
}

export const summarize = (results: CaseResult[]) => ({
  total: results.length,
  succeeded: results.filter((r) => r.ok && !r.skipped).length,
  skipped: results.filter((r) => r.ok && r.skipped).length,
  failed: results.filter((r) => !r.ok).length,
});

/**
 * Client ownership follows the case's partner when the client belonged to nobody or to the case's previous
 * partner (the partner was the client's partner); a client owned by somebody else keeps their owner.
 * Returns the new owner, or undefined when the ownership stays as it is.
 */
export const nextOwner = (owner: string | null, from: string | null, to: string | null): string | null | undefined => {
  if (owner === to) return undefined;
  if (owner === null || owner === from) return to;
  return undefined;
};

/** A file of the Fertig folder as it is now. */
export interface ReadyFile {
  nodeId: string;
  version: number;
  name: string;
}

/** A file sent before (CaseReadyDocsSend.files). */
export interface SentFile {
  nodeId: string;
  version: number;
  documentId: string;
  name?: string;
}

/** Files not yet sent in their current version (new files and files replaced since the last send). */
export const newFiles = <F extends ReadyFile>(files: F[], sent: SentFile[]) => {
  const have = new Set(sent.map((s) => `${s.nodeId}:${s.version}`));
  return files.filter((f) => !have.has(`${f.nodeId}:${f.version}`));
};

/**
 * Whether "Müştəriyə göndər" may run: the case must have files in the Fertig folder (sent DIRECTLY from there, no stage move needed), and — once sent — needs an explicit
 * re-send (the UI asks first). A re-send without any new or replaced file is refused (READY_DOCS_NOTHING_NEW): it
 * would copy nothing but still tell the client "N documents are ready". Returns the error code, or null.
 */
export const sendBlocker = (p: { stage?: string | null; fileCount: number; sentBefore: boolean; resend: boolean; newCount?: number }) => {
  if (p.fileCount === 0) return 'READY_DOCS_NO_FILES';
  if (p.sentBefore && !p.resend) return 'READY_DOCS_ALREADY_SENT';
  if (p.sentBefore && p.newCount === 0) return 'READY_DOCS_NOTHING_NEW';
  return null;
};

/**
 * The next admin of a bulk stage move: the chosen one; with nobody chosen, a case already in the target stage keeps
 * its current assignee (only a note is added), a real move clears it (as a single move with "nobody" does).
 */
export const bulkAssignee = (p: { from: string | null; to: string; requested: string | null | undefined; current: string | null | undefined }) =>
  p.requested ? p.requested : p.from === p.to ? (p.current ?? null) : null;

/** Parses CaseReadyDocsSend.files (JSON) defensively. */
export const parseSentFiles = (v: unknown): SentFile[] =>
  Array.isArray(v)
    ? v.flatMap((x) =>
        x && typeof x === 'object' && typeof (x as SentFile).nodeId === 'string' && typeof (x as SentFile).documentId === 'string'
          ? [{ nodeId: (x as SentFile).nodeId, version: Number((x as SentFile).version) || 1, documentId: (x as SentFile).documentId, name: typeof (x as SentFile).name === 'string' ? (x as SentFile).name : undefined }]
          : [],
      )
    : [];
