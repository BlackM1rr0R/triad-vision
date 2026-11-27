/**
 * "Bizdən gələn sənədlər": pure rules of what the client may see in the list of documents Triad Vision sent, and how
 * they are grouped (no database here; lib/receivedDocs/index.ts loads the rows).
 */

export type ReceivedKind = 'READY_DOCS' | 'APPOINTMENT' | 'CONTRACT' | 'CONTRACT_SIGNED' | 'OTHER';

export interface RawDoc {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  stage: string;
  requirementId: string | null;
  /** Role of the user who stored the file (User.role). */
  uploaderRole: string | null;
}

export interface ReceivedFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  isNew: boolean;
}

export interface ReceivedGroup {
  id: string;
  kind: ReceivedKind;
  /** Send time / the day of the files: groups sort by it, newest first. */
  at: Date;
  files: ReceivedFile[];
  newCount: number;
}

export interface SendRef {
  id: string;
  createdAt: Date;
  documentIds: string[];
}

/** Stages whose files without a requirement can reach the client at all (the same set the case view lists). */
export const CLIENT_STAGES = ['OTHER', 'VISA', 'EMBASSY', 'CONTRACT', 'CONTRACT_SIGNED'] as const;

/** The team's embassy package (generated for staff, name marker `_Botschaft_`) is internal. */
const INTERNAL_NAME = /_Botschaft_/;

/**
 * Is this case document something "sent to the client"? Only files that belong to no requirement list (those are the
 * client's own checklist = part B), lie in a stage meant for the client, were stored by the team (never by the
 * client: their own files are part B) and are not the internal embassy package. Signed contract copies are always
 * the client's (the signature module may store them under the client).
 */
export const isReceivedDoc = (d: Pick<RawDoc, 'stage' | 'requirementId' | 'uploaderRole' | 'originalName'>): boolean => {
  if (d.requirementId) return false;
  if (!(CLIENT_STAGES as readonly string[]).includes(d.stage)) return false;
  if (INTERNAL_NAME.test(d.originalName)) return false;
  if (d.stage === 'CONTRACT_SIGNED') return true;
  return d.uploaderRole !== null && d.uploaderRole !== 'CLIENT';
};

/** `YYYY-MM-DD` in UTC: documents of one day form one group. */
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export const kindOfDoc = (d: Pick<RawDoc, 'stage' | 'originalName'>, isAppointment: (name: string) => boolean): ReceivedKind =>
  d.stage === 'CONTRACT' ? 'CONTRACT' : d.stage === 'CONTRACT_SIGNED' ? 'CONTRACT_SIGNED' : isAppointment(d.originalName) ? 'APPOINTMENT' : 'OTHER';

/**
 * Groups the received documents: one group per ready-docs send, one per contract file, the appointment files and the
 * other staff files per day. Newest group first; files of a group oldest first.
 */
export const groupReceived = (input: {
  docs: RawDoc[];
  sends: SendRef[];
  seen: ReadonlySet<string>;
  isAppointment: (name: string) => boolean;
}): ReceivedGroup[] => {
  const docs = input.docs.filter(isReceivedDoc);
  const sendOf = new Map<string, SendRef>();
  // The first send wins when a document appears in several (never in practice).
  for (const s of [...input.sends].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) for (const id of s.documentIds) if (!sendOf.has(id)) sendOf.set(id, s);

  const groups = new Map<string, ReceivedGroup>();
  for (const d of docs) {
    const send = sendOf.get(d.id);
    const kind: ReceivedKind = send ? 'READY_DOCS' : kindOfDoc(d, input.isAppointment);
    const perFile = kind === 'CONTRACT' || kind === 'CONTRACT_SIGNED';
    const key = send ? `send:${send.id}` : perFile ? `${kind.toLowerCase()}:${d.id}` : `${kind.toLowerCase()}:${dayKey(d.createdAt)}`;
    const at = send ? send.createdAt : d.createdAt;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { id: key, kind, at, files: [], newCount: 0 }));
    if (at.getTime() > g.at.getTime()) g.at = at;
    const isNew = !input.seen.has(d.id);
    g.files.push({ id: d.id, name: d.originalName, mimeType: d.mimeType, size: d.size, createdAt: d.createdAt, isNew });
    if (isNew) g.newCount += 1;
  }
  const out = [...groups.values()];
  for (const g of out) g.files.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.name.localeCompare(b.name));
  return out.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));
};

export const newCountOf = (groups: ReceivedGroup[]) => groups.reduce((n, g) => n + g.newCount, 0);
