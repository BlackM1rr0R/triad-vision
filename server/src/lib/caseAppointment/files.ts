import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest } from '../http.js';
import { copyDocumentToDrive } from '../drive/caseFolders.js';

/**
 * Files attached to the embassy appointment (the confirmation the embassy sent: PDF / image).
 * Staff record the appointment, the client has applied: we only store what the embassy gave.
 *
 *  - each file is a case document (stage OTHER, accepted → the client sees it in the cabinet documents) named
 *    "Səfirlik görüşü — təsdiq.<ext>" (a second one: "… (2).<ext>"); that name is the marker that finds them again
 *    (no schema change);
 *  - and a copy goes into the client's drive folder, subfolder "Termin";
 *  - removing a file deletes the case document (row + stored file) and moves its drive copy to the bin.
 */
export const APPOINTMENT_DOC_TITLE = 'Səfirlik görüşü — təsdiq';
export const APPOINTMENT_DRIVE_FOLDER = 'Termin';
export const MAX_APPOINTMENT_FILES = 5;

export const isAppointmentDocName = (name: string) => name.startsWith(APPOINTMENT_DOC_TITLE);

/** "Səfirlik görüşü — təsdiq.pdf", then "… (2).pdf", "… (3).pdf" – the first name not in `taken` (lower-case compare). */
export const appointmentDocName = (originalName: string, taken: Iterable<string>) => {
  const used = new Set([...taken].map((n) => n.toLocaleLowerCase('az')));
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
  let name = `${APPOINTMENT_DOC_TITLE}${ext}`;
  for (let i = 2; used.has(name.toLocaleLowerCase('az')); i++) name = `${APPOINTMENT_DOC_TITLE} (${i})${ext}`;
  return name;
};

/** What the upload route hands over for each verified file (multer's stored file). */
export interface AppointmentUpload {
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface AppointmentFilesInput {
  add: AppointmentUpload[];
  removeIds: string[];
}

/** The appointment files of a case (documents named by the marker, stage OTHER). */
export const listAppointmentDocs = (caseId: string) =>
  prisma.document.findMany({
    where: { caseId, stage: 'OTHER', originalName: { startsWith: APPOINTMENT_DOC_TITLE } },
    select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

/** Every id to remove must be an appointment file of this case, and the total must stay within the limit. */
export const assertAppointmentFiles = async (caseId: string, input: AppointmentFilesInput) => {
  const current = await listAppointmentDocs(caseId);
  const ids = new Set(current.map((d) => d.id));
  const remove = [...new Set(input.removeIds)];
  if (remove.some((id) => !ids.has(id))) throw badRequest('INVALID_APPOINTMENT_FILE');
  if (current.length - remove.length + input.add.length > MAX_APPOINTMENT_FILES) throw badRequest('TOO_MANY_APPOINTMENT_FILES');
  return remove;
};

/**
 * Applies the removals and additions (after the appointment itself was saved). Returns the number of appointment
 * files the case has now. A drive copy that fails never fails the appointment.
 */
export const applyAppointmentFiles = async (caseId: string, actorId: string, input: AppointmentFilesInput): Promise<number> => {
  const remove = [...new Set(input.removeIds)];
  if (remove.length) {
    const docs = await prisma.document.findMany({ where: { id: { in: remove }, caseId }, select: { id: true, storedName: true, originalName: true } });
    await prisma.driveNode.updateMany({ where: { documentId: { in: docs.map((d) => d.id) }, deletedAt: null }, data: { deletedAt: new Date(), deletedById: actorId } });
    await prisma.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
    for (const d of docs) await fs.unlink(path.join(config.uploads.privateDir, path.basename(d.storedName))).catch(() => undefined);
    if (docs.length) await prisma.caseEvent.create({ data: { caseId, type: 'CASE_UPDATED', note: `Səfirlik görüşü faylı silindi (${docs.length})`, actorId, visibleToClient: false } });
  }
  const taken = (await listAppointmentDocs(caseId)).map((d) => d.originalName);
  for (const f of input.add) {
    const originalName = appointmentDocName(f.originalname, taken);
    taken.push(originalName);
    const doc = await prisma.document.create({
      data: { caseId, stage: 'OTHER', originalName, storedName: f.filename, mimeType: f.mimetype, size: f.size, status: 'ACCEPTED', uploadedById: actorId },
    });
    await copyDocumentToDrive(doc.id, { folder: APPOINTMENT_DRIVE_FOLDER });
  }
  return prisma.document.count({ where: { caseId, stage: 'OTHER', originalName: { startsWith: APPOINTMENT_DOC_TITLE } } });
};
