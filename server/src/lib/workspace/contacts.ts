import { Prisma, type Contact, type Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';
import { csvSafe, csvUnsafe } from '../csvSafe.js';

/** Shared address book: visibility, response shape, search and the hand-written CSV codec. */

export const CSV_COLUMNS = ['firstName', 'lastName', 'email', 'phone', 'company', 'position', 'tags', 'address', 'notes'] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

export interface ContactActor {
  id: string;
  role: Role;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normaliseEmail = (s: string | null | undefined) => {
  const v = (s ?? '').trim().toLowerCase();
  return v || null;
};

export const normaliseTags = (v: unknown): string[] => {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;]/) : [];
  const out: string[] = [];
  for (const t of raw) {
    const s = String(t).trim().replace(/\s+/g, ' ').slice(0, 40);
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.slice(0, 20);
};

export const normaliseEmails = (v: unknown, primary: string | null): string[] => {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;\s]+/) : [];
  const out: string[] = [];
  for (const e of raw) {
    const s = normaliseEmail(String(e));
    if (s && s !== primary && !out.includes(s) && EMAIL_RE.test(s)) out.push(s);
  }
  return out.slice(0, 10);
};

/** Private contacts are only visible to their creator. */
export const visibilityWhere = (actor: ContactActor): Prisma.ContactWhereInput => ({ OR: [{ shared: true }, { createdById: actor.id }] });

/** Shared contacts belong to the team (anyone may edit); private ones only to their creator (or an admin). */
export const canEdit = (actor: ContactActor, c: Pick<Contact, 'shared' | 'createdById'>) =>
  c.shared ? true : c.createdById === actor.id || hasMinRole(actor.role, 'ADMIN');

export const canDelete = (actor: ContactActor, c: Pick<Contact, 'shared' | 'createdById'>) =>
  c.createdById === actor.id || (c.shared && hasMinRole(actor.role, 'ADMIN'));

export const contactSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  emails: true,
  phone: true,
  company: true,
  companyId: true,
  position: true,
  address: true,
  notes: true,
  tags: true,
  shared: true,
  source: true,
  lastContactAt: true,
  userId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ContactSelect;

export type ContactRow = Prisma.ContactGetPayload<{ select: typeof contactSelect }>;

export const toContact = (c: ContactRow, actor: ContactActor) => ({
  ...c,
  emails: normaliseEmails(c.emails, null),
  tags: normaliseTags(c.tags),
  canEdit: canEdit(actor, c),
  canDelete: canDelete(actor, c),
});

export type ContactOut = ReturnType<typeof toContact>;

// ─── Search ────────────────────────────────────────────────────────────

/** Boolean-mode query: every word required, prefix match ("+ays* +mam*"). Words under 3 chars are dropped (InnoDB min token). */
export const fulltextQuery = (q: string) => {
  const words = q
    .replace(/[+\-<>()~*"@]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);
  return words.length ? words.map((w) => `+${w}*`).join(' ') : null;
};

/**
 * Ids of visible contacts matching `q`: MATCH … AGAINST on (firstName, lastName, email, company)
 * first, LIKE across the same columns (plus phone) when fulltext finds nothing (short prefixes,
 * e-mail fragments, unsupported engines). Returns ids in rank order; the caller loads the rows.
 */
export const searchContactIds = async (actor: ContactActor, q: string, limit: number): Promise<{ ids: string[]; mode: 'fulltext' | 'like' }> => {
  const ft = fulltextQuery(q);
  if (ft) {
    try {
      const rows = await prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM Contact WHERE MATCH(firstName, lastName, email, company) AGAINST (${ft} IN BOOLEAN MODE) AND (shared = 1 OR createdById = ${actor.id}) ORDER BY MATCH(firstName, lastName, email, company) AGAINST (${ft} IN BOOLEAN MODE) DESC, lastName ASC, firstName ASC LIMIT ${limit}`,
      );
      if (rows.length) return { ids: rows.map((r) => r.id), mode: 'fulltext' };
    } catch (err) {
      console.error('[contacts] fulltext search failed, falling back to LIKE', (err as Error).message);
    }
  }
  const rows = await prisma.contact.findMany({
    where: {
      AND: [
        visibilityWhere(actor),
        { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { email: { contains: q } }, { company: { contains: q } }, { phone: { contains: q } }] },
      ],
    },
    select: { id: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: limit,
  });
  return { ids: rows.map((r) => r.id), mode: 'like' };
};

/** Marks a contact (by id or by e-mail address) as contacted now. The mail module calls this when a message is sent. */
export const touchContact = async (ref: { id?: string; email?: string }, at = new Date()) => {
  if (ref.id) {
    await prisma.contact.updateMany({ where: { id: ref.id }, data: { lastContactAt: at } });
    return;
  }
  const email = normaliseEmail(ref.email);
  if (email) await prisma.contact.updateMany({ where: { email }, data: { lastContactAt: at } });
};

// ─── CSV ───────────────────────────────────────────────────────────────

/** Header spellings accepted on import (English + az/de/en/ru), compared after `headerKey`. */
const HEADER_SYNONYMS: Record<CsvColumn, string[]> = {
  firstName: ['first name', 'first', 'given name', 'name', 'ad', 'adı', 'vorname', 'имя'],
  lastName: ['last name', 'last', 'surname', 'family name', 'soyad', 'soyadı', 'nachname', 'familienname', 'фамилия'],
  email: ['e-mail', 'email address', 'e-mail address', 'mail', 'e-poçt', 'epoçt', 'elektron poçt', 'e-mail-adresse', 'эл. почта', 'почта', 'электронная почта', 'e-mail адрес'],
  phone: ['phone', 'telephone', 'mobile', 'phone number', 'telefon', 'nömrə', 'telefon nömrəsi', 'telefonnummer', 'mobil', 'телефон', 'мобильный'],
  company: ['company', 'organisation', 'organization', 'şirkət', 'firma', 'unternehmen', 'компания', 'организация', 'фирма'],
  position: ['position', 'job title', 'title', 'role', 'vəzifə', 'stelle', 'funktion', 'должность', 'позиция'],
  tags: ['tags', 'tag', 'labels', 'etiketlər', 'teqlər', 'schlagwörter', 'schlagworte', 'теги', 'метки', 'тэги'],
  address: ['address', 'ünvan', 'adresse', 'anschrift', 'адрес'],
  notes: ['notes', 'note', 'comment', 'qeyd', 'qeydlər', 'notizen', 'notiz', 'bemerkung', 'заметки', 'заметка', 'примечание', 'комментарий'],
};

const headerKey = (h: string) =>
  h
    .replace(/^﻿/, '')
    .toLowerCase()
    .replace(/[\s_\-().:]/g, '')
    .replace(/["']/g, '');

export const mapHeader = (h: string): CsvColumn | null => {
  const k = headerKey(h);
  if (!k) return null;
  for (const col of CSV_COLUMNS) if (headerKey(col) === k || HEADER_SYNONYMS[col].some((s) => headerKey(s) === k)) return col;
  return null;
};

const detectDelimiter = (line: string) => {
  const counts: [string, number][] = [
    [',', (line.match(/,/g) ?? []).length],
    [';', (line.match(/;/g) ?? []).length],
    ['\t', (line.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
};

/** RFC 4180 style parser: quoted fields, doubled quotes, embedded newlines, CRLF; delimiter auto-detected (, ; tab). */
export const parseCsv = (text: string): string[][] => {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
};

export interface CsvRecord {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  position: string | null;
  tags: string[];
  address: string | null;
  notes: string | null;
}

/** Rows → records using the header line; `unmapped` lists header cells nobody understood. */
export const csvToRecords = (text: string): { records: CsvRecord[]; columns: CsvColumn[]; unmapped: string[] } => {
  const rows = parseCsv(text);
  if (!rows.length) return { records: [], columns: [], unmapped: [] };
  const header = rows[0].map(mapHeader);
  const unmapped = rows[0].filter((_h, i) => header[i] === null).map((h) => h.trim());
  const columns = header.filter((c): c is CsvColumn => c !== null);
  const records: CsvRecord[] = [];
  const trim = (v: string | undefined, max: number) => (v && v.trim() ? v.trim().slice(0, max) : null);
  for (const cells of rows.slice(1)) {
    const rec: Partial<Record<CsvColumn, string>> = {};
    header.forEach((col, i) => {
      if (col && cells[i] !== undefined && !rec[col]) rec[col] = csvUnsafe(cells[i].trim());
    });
    let firstName = trim(rec.firstName, 80);
    let lastName = trim(rec.lastName, 80);
    if (!firstName && lastName) {
      firstName = lastName;
      lastName = null;
    }
    if (!firstName && rec.email) firstName = rec.email.split('@')[0].slice(0, 80);
    if (!firstName && rec.company) firstName = rec.company.slice(0, 80);
    if (!firstName) continue;
    const email = normaliseEmail(rec.email);
    records.push({
      firstName,
      lastName,
      email: email && EMAIL_RE.test(email) ? email : null,
      phone: trim(rec.phone, 40),
      company: trim(rec.company, 120),
      position: trim(rec.position, 120),
      tags: normaliseTags(rec.tags ?? ''),
      address: trim(rec.address, 255),
      notes: trim(rec.notes, 5000),
    });
  }
  return { records, columns, unmapped };
};

const csvCell = (v: string | null | undefined) => {
  const s = csvSafe(v ?? ''); // no spreadsheet formulas (CSV injection)
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Contacts → CSV text (UTF-8 BOM so Excel opens it with the right encoding). */
export const contactsToCsv = (rows: ContactOut[]) => {
  const lines = [CSV_COLUMNS.join(',')];
  for (const c of rows) {
    lines.push([c.firstName, c.lastName, c.email, c.phone, c.company, c.position, c.tags.join(', '), c.address, c.notes].map((v) => csvCell(v)).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
};
