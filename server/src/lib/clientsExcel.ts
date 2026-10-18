import fs from 'node:fs/promises';
import type { CaseStatus, VisaType } from '@prisma/client';
import { prisma } from '../db.js';
import { buildXlsx } from './xlsx.js';
import { CLIENTS_FOLDER_NAME, ensureRoots } from './drive/roots.js';
import { newStorageKey, storagePath } from './drive/storage.js';

/**
 * "Bütün müştərilər" — one Excel workbook with every registered client, kept in each super admin's
 * "My files" (folder "Bütün müştərilər"). It is rebuilt shortly after every new registration (and
 * hourly, so case statuses stay current) and can also be downloaded on demand from Admin → Users.
 */
export const CLIENTS_FOLDER = CLIENTS_FOLDER_NAME;
export const CLIENTS_FILE = 'Alle Kunden.xlsx';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const STATUS_AZ: Record<CaseStatus, string> = {
  DOCUMENTS_PENDING: 'Sənədlər gözlənilir',
  DOCUMENTS_REVIEW: 'Sənədlər yoxlanılır',
  CONTRACT_SENT: 'Müqavilə göndərilib',
  CONTRACT_SIGNED: 'Müqavilə imzalanıb',
  EMBASSY_DOCUMENTS: 'Səfirlik sənədləri gözlənilir',
  EMBASSY_REVIEW: 'Səfirlik sənədləri yoxlanılır',
  APPOINTMENT_SCHEDULED: 'Səfirlik görüşü təyin olunub',
  DECISION_PENDING: 'Qərar gözlənilir',
  APPROVED: 'Viza verilib',
  REJECTED: 'İmtina',
  CANCELLED: 'Ləğv edilib',
};

const TYPE_AZ: Record<VisaType, string> = {
  WORK: 'İş vizası',
  AUSBILDUNG: 'Ausbildung',
  WEITERBILDUNG: 'Weiterbildung',
  JOB_SEEKER: 'İş axtarışı',
  STUDY: 'Təhsil vizası',
  FAMILY: 'Ailə birləşməsi',
  TOURIST: 'Turist vizası',
};

const GERMAN: Record<string, string> = { none: 'Yoxdur' };

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10).split('-').reverse().join('.') : '');
const dateTime = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  // Baku time (UTC+4) — the office works in it.
  const b = new Date(d.getTime() + 4 * 3600_000);
  return `${p(b.getUTCDate())}.${p(b.getUTCMonth() + 1)}.${b.getUTCFullYear()} ${p(b.getUTCHours())}:${p(b.getUTCMinutes())}`;
};
const az = (v: unknown) => (v && typeof v === 'object' ? ((v as Record<string, string>).az ?? '') : '');

export const CLIENT_HEADERS = [
  '№',
  'Ad',
  'Soyad',
  'E-poçt',
  'Telefon',
  'Doğum tarixi',
  'Pasport №',
  'Vətəndaşlıq',
  'Şəhər',
  'Peşə',
  'Alman dili',
  'Qeydiyyat tarixi',
  'E-poçt təsdiqlənib',
  'Aktiv',
  'Müraciət №',
  'Müraciət növü',
  'Viza kateqoriyası',
  'Status',
  'Məsul əməkdaş',
  'Müraciət sayı',
  'Agent kodu',
  'Partnyor', // referral partner (middleman) of the latest case
];

/** All client accounts as spreadsheet rows (newest registration last, so new clients are appended). */
export const clientRows = async () => {
  const users = await prisma.user.findMany({
    where: { role: 'CLIENT' },
    orderBy: { createdAt: 'asc' },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      birthDate: true,
      passportNumber: true,
      nationality: true,
      city: true,
      profession: true,
      germanLevel: true,
      createdAt: true,
      emailVerifiedAt: true,
      isActive: true,
      referredByAgent: { select: { code: true } },
      cases: {
        orderBy: { createdAt: 'desc' },
        select: {
          number: true,
          visaType: true,
          status: true,
          visaCategory: { select: { title: true, visaLabel: true } },
          assignedStaff: { select: { firstName: true, lastName: true } },
          partner: { select: { name: true } },
        },
      },
    },
  });
  return users.map((u, i) => {
    const c = u.cases[0];
    return [
      i + 1,
      u.firstName,
      u.lastName,
      u.email,
      u.phone ?? '',
      day(u.birthDate),
      u.passportNumber ?? '',
      u.nationality ?? '',
      u.city ?? '',
      u.profession ?? '',
      u.germanLevel ? (GERMAN[u.germanLevel] ?? u.germanLevel) : '',
      dateTime(u.createdAt),
      u.emailVerifiedAt ? 'Bəli' : 'Xeyr',
      u.isActive ? 'Bəli' : 'Xeyr',
      c?.number ?? '',
      c ? TYPE_AZ[c.visaType] : '',
      c?.visaCategory ? `${az(c.visaCategory.title)} (${c.visaCategory.visaLabel})` : '',
      c ? (STATUS_AZ[c.status] ?? c.status) : 'Müraciət yoxdur',
      c?.assignedStaff ? `${c.assignedStaff.firstName} ${c.assignedStaff.lastName}` : '',
      u.cases.length,
      u.referredByAgent?.code ?? '',
      c?.partner?.name ?? '',
    ];
  });
};

/** The workbook as bytes. */
export const buildClientsWorkbook = async () => buildXlsx('Müştərilər', CLIENT_HEADERS, await clientRows());

let dirty = true; // build once after start-up
/** Ask for a rebuild (called after a registration); the job picks it up within a minute. */
export const markClientsExcelDirty = () => {
  dirty = true;
};
export const clientsExcelDirty = () => dirty;

/** A folder or file of the clients workbook (not trashed). */
const findNode = (parentId: string, name: string, kind: 'FOLDER' | 'FILE') =>
  prisma.driveNode.findFirst({ where: { parentId, name, kind, deletedAt: null }, select: { id: true, storageKey: true, version: true } });

/**
 * The "Alle Kunden" system folder directly in the shared workspace. Permissions are not inherited and it
 * has no grants, so — like the super admins' own files before — only super admins see it.
 */
const ensureClientsFolder = async () => (await ensureRoots()).clientsId;

/** Rebuilds the workbook and writes it into "Gemeinsame Dokumente/Alle Kunden". Returns the byte size. */
export const refreshClientsExcel = async () => {
  dirty = false;
  const data = await buildClientsWorkbook();
  const folderId = await ensureClientsFolder();
  const file = await findNode(folderId, CLIENTS_FILE, 'FILE');
  const key = file?.storageKey ?? newStorageKey();
  // Write next to the target and rename, so a download never sees a half-written file.
  const target = storagePath(key);
  await fs.writeFile(`${target}.tmp`, data);
  await fs.rename(`${target}.tmp`, target);
  if (file) {
    await prisma.driveNode.update({ where: { id: file.id }, data: { size: data.length, mimeType: XLSX_MIME, version: file.version + 1 } });
  } else {
    await prisma.driveNode.create({
      data: { space: 'SHARED', kind: 'FILE', name: CLIENTS_FILE, parentId: folderId, system: true, storageKey: key, mimeType: XLSX_MIME, size: data.length },
    });
  }
  return data.length;
};
