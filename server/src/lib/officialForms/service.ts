import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OfficialFormFill, OfficialFormTemplate, Prisma } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest, conflict, HttpError, notFound } from '../http.js';
import { notifyStaff } from '../notifications.js';
import { ensureCaseFolder } from '../drive/caseFolders.js';
import { nodeLiteSelect } from '../drive/access.js';
import { createFileIn, saveFileVersion } from '../drive/files.js';
import { DATA_KEY_MAP, DATA_KEYS, FORMATS, GROUP_LABELS, isDataKey, suggestMapping, type DataGroup, type FieldMap, type FieldMapping, type PdfFieldInfo } from './catalog.js';
import { applyMapping, deriveData, dmyOf, fixLinkFor, loadCaseData, type CaseData } from './resolve.js';
import { dataSheetPdf, fillPdf, listPdfFields, type SheetSection } from './pdf.js';
import nationalVisa from './defaults/national-visa.json' with { type: 'json' };
import employmentDeclaration from './defaults/employment-declaration.json' with { type: 'json' };

/**
 * Official form engine: templates (an official fillable PDF per key + version with its field map), filling a
 * form for a case (values resolved from the case, staff overrides, missing values with links to where they are
 * fixed), the generated PDF in private storage and in the client's drive folder ("Amtliche Formulare"), the
 * built-in templates (downloaded from the official URL at runtime, never committed) and the data sheet fallback.
 */

export const FILL_STATUSES = ['DRAFT', 'GENERATED', 'SENT_TO_EMPLOYER', 'SIGNED', 'SUBMITTED'] as const;
export type FillStatus = (typeof FILL_STATUSES)[number];
export const EMPLOYER_FORM_KEY = 'EMPLOYMENT_DECLARATION';
export const FORMS_FOLDER_NAME = 'Amtliche Formulare';
export const MAX_TEMPLATE_BYTES = 20 * 1024 * 1024;

export interface DefaultTemplate {
  key: string;
  title: string;
  version: string;
  url: string;
  sha256: string;
  notes: string;
  fieldMap: FieldMap;
}
export const DEFAULT_TEMPLATES: DefaultTemplate[] = [nationalVisa as DefaultTemplate, employmentDeclaration as DefaultTemplate];

// ─── Storage ────────────────────────────────────────────────────────────

const storedPath = (key: string) => path.join(config.uploads.privateDir, path.basename(key));
const writeStored = async (kind: string, data: Buffer) => {
  const key = `${Date.now()}-oform-${kind}-${crypto.randomBytes(12).toString('hex')}.pdf`;
  await fs.mkdir(config.uploads.privateDir, { recursive: true });
  await fs.writeFile(storedPath(key), data);
  return key;
};
export const readStoredForm = async (key: string) => {
  try {
    return await fs.readFile(storedPath(key));
  } catch {
    throw new HttpError(404, 'FILE_MISSING_ON_DISK');
  }
};
const removeStored = (key: string | null | undefined) => (key ? fs.unlink(storedPath(key)).catch(() => undefined) : Promise.resolve());
export const storedFormPath = storedPath;
export const writeStoredForm = writeStored;
export const removeStoredForm = removeStored;

// ─── Field maps ─────────────────────────────────────────────────────────

const mappingSchema = z.object({
  source: z.string().trim().min(1).max(80),
  value: z.string().max(500).optional(),
  format: z.enum(FORMATS).optional(),
  when: z.string().trim().max(200).optional(),
  map: z.record(z.string().max(60), z.string().max(300)).optional(),
  optional: z.boolean().optional(),
});
export const fieldMapSchema = z.record(z.string().min(1).max(300), mappingSchema);

/** Keeps entries for fields the PDF has and sources the catalogue knows (or "const"). */
export const cleanFieldMap = (map: FieldMap, fields: PdfFieldInfo[]) => {
  const names = new Set(fields.map((f) => f.name));
  const out: FieldMap = {};
  const dropped: string[] = [];
  for (const [field, m] of Object.entries(map)) {
    if (!names.has(field) || (m.source !== 'const' && !isDataKey(m.source))) {
      dropped.push(field);
      continue;
    }
    const entry: FieldMapping = { source: m.source };
    if (m.source === 'const') entry.value = m.value ?? '';
    if (m.format && m.format !== 'none') entry.format = m.format;
    if (m.when) entry.when = m.when;
    if (m.map && Object.keys(m.map).length) entry.map = m.map;
    if (m.optional) entry.optional = true;
    out[field] = entry;
  }
  return { map: out, dropped };
};

const asFieldMap = (v: Prisma.JsonValue | null | undefined) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as unknown as FieldMap) : {});

// ─── Templates ──────────────────────────────────────────────────────────

export const templateView = (t: OfficialFormTemplate) => ({
  id: t.id,
  key: t.key,
  title: t.title,
  version: t.version,
  active: t.active,
  notes: t.notes,
  mapped: Object.keys(asFieldMap(t.fieldMap)).length,
  builtIn: DEFAULT_TEMPLATES.some((d) => d.key === t.key && d.version === t.version),
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

export const listTemplates = async () => {
  const rows = await prisma.officialFormTemplate.findMany({ orderBy: [{ key: 'asc' }, { createdAt: 'desc' }] });
  const fillCounts = await prisma.officialFormFill.groupBy({ by: ['templateId'], _count: { _all: true } });
  const counts = new Map(fillCounts.map((c) => [c.templateId, c._count._all]));
  return rows.map((t) => ({ ...templateView(t), fills: counts.get(t.id) ?? 0 }));
};

const templateOr404 = async (id: string) => {
  const t = await prisma.officialFormTemplate.findUnique({ where: { id } });
  if (!t) throw notFound('TEMPLATE_NOT_FOUND');
  return t;
};

export const templateFields = async (t: OfficialFormTemplate) => listPdfFields(await readStoredForm(t.fileKey));

/** Template with its PDF fields, the saved mapping and suggestions for unmapped fields. */
export const templateDetail = async (id: string) => {
  const t = await templateOr404(id);
  const { fields, pages } = await templateFields(t);
  const fieldMap = asFieldMap(t.fieldMap);
  return { template: templateView(t), fields, pages, fieldMap, suggestions: suggestMapping(fields, fieldMap) };
};

export const KEY_RE = /^[A-Z][A-Z0-9_]{1,59}$/;

export interface UploadInput {
  key: string;
  title: string;
  version: string;
  notes?: string | null;
  pdf: Buffer;
  fieldMap?: FieldMap;
  userId: string | null;
}

/** Stores a new template version. The first version of a key becomes active; the mapping starts from the suggestions. */
export const createTemplate = async (input: UploadInput) => {
  if (!KEY_RE.test(input.key)) throw badRequest('INVALID_KEY');
  if (input.pdf.length > MAX_TEMPLATE_BYTES) throw new HttpError(413, 'FILE_TOO_LARGE');
  if (await prisma.officialFormTemplate.count({ where: { key: input.key, version: input.version } })) throw conflict('VERSION_EXISTS');
  const { fields } = await listPdfFields(input.pdf);
  const fillable = fields.filter((f) => !['signature', 'button', 'unknown'].includes(f.type));
  if (!fillable.length) throw badRequest('NOT_FILLABLE');
  const map = input.fieldMap ? cleanFieldMap(input.fieldMap, fields).map : suggestMapping(fields);
  const fileKey = await writeStored('tpl', input.pdf);
  try {
    const hasActive = await prisma.officialFormTemplate.count({ where: { key: input.key, active: true } });
    const t = await prisma.officialFormTemplate.create({
      data: {
        key: input.key,
        title: input.title.trim().slice(0, 200),
        version: input.version.trim().slice(0, 40),
        fileKey,
        fieldMap: map as unknown as Prisma.InputJsonValue,
        active: !hasActive,
        notes: input.notes?.trim() || null,
        createdById: input.userId,
      },
    });
    return { template: t, fields };
  } catch (err) {
    await removeStored(fileKey);
    throw err;
  }
};

export const updateTemplate = async (id: string, patch: { title?: string; notes?: string | null; fieldMap?: FieldMap }) => {
  const t = await templateOr404(id);
  const data: Prisma.OfficialFormTemplateUpdateInput = {};
  let dropped: string[] = [];
  if (patch.title !== undefined) data.title = patch.title.trim().slice(0, 200);
  if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null;
  if (patch.fieldMap !== undefined) {
    const { fields } = await templateFields(t);
    const cleaned = cleanFieldMap(patch.fieldMap, fields);
    dropped = cleaned.dropped;
    data.fieldMap = cleaned.map as unknown as Prisma.InputJsonValue;
  }
  const updated = await prisma.officialFormTemplate.update({ where: { id }, data });
  return { template: templateView(updated), fieldMap: asFieldMap(updated.fieldMap), dropped };
};

export const activateTemplate = async (id: string) => {
  const t = await templateOr404(id);
  await prisma.$transaction([
    prisma.officialFormTemplate.updateMany({ where: { key: t.key, id: { not: t.id } }, data: { active: false } }),
    prisma.officialFormTemplate.update({ where: { id: t.id }, data: { active: true } }),
  ]);
  return templateView({ ...t, active: true });
};

/** Deletes a version nobody filled yet; a version with fills is only deactivated (the fills keep their template). */
export const deleteTemplate = async (id: string) => {
  const t = await templateOr404(id);
  if (await prisma.officialFormFill.count({ where: { templateId: t.id } })) {
    await prisma.officialFormTemplate.update({ where: { id: t.id }, data: { active: false } });
    return { deleted: false, deactivated: true };
  }
  await prisma.officialFormTemplate.delete({ where: { id: t.id } });
  await removeStored(t.fileKey);
  return { deleted: true, deactivated: false };
};

// ─── Built-in templates ─────────────────────────────────────────────────

export type Fetcher = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; arrayBuffer: () => Promise<ArrayBuffer> }>;
export const officialFormDeps: { fetch: Fetcher } = { fetch: (url, init) => fetch(url, init) };

const download = async (url: string) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await officialFormDeps.fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'TriadVision/1.0 (+official-forms)', Accept: 'application/pdf' } });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_TEMPLATE_BYTES) throw new Error('FILE_TOO_LARGE');
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('NOT_A_PDF');
    return buf;
  } finally {
    clearTimeout(timer);
  }
};

export interface InstallResult {
  key: string;
  version: string;
  status: 'INSTALLED' | 'EXISTS' | 'FAILED';
  reason?: string;
  templateId?: string;
  mapped?: number;
  dropped?: string[];
  sha256Matches?: boolean;
}

/**
 * "Install default templates" (idempotent): downloads each official PDF from its URL, checks it is a fillable PDF
 * and applies the shipped mapping (fields the downloaded version lacks are dropped and reported). An existing
 * key + version is left alone. A version becomes active when its key has no active template yet.
 */
export const installDefaultTemplates = async (userId: string | null): Promise<InstallResult[]> => {
  const out: InstallResult[] = [];
  for (const d of DEFAULT_TEMPLATES) {
    const existing = await prisma.officialFormTemplate.findUnique({ where: { key_version: { key: d.key, version: d.version } } });
    if (existing) {
      out.push({ key: d.key, version: d.version, status: 'EXISTS', templateId: existing.id });
      continue;
    }
    try {
      const pdf = await download(d.url);
      const { fields } = await listPdfFields(pdf);
      const { map, dropped } = cleanFieldMap(d.fieldMap, fields);
      if (!Object.keys(map).length) throw new Error('NOT_FILLABLE');
      const { template } = await createTemplate({ key: d.key, title: d.title, version: d.version, notes: `${d.notes}\nSource: ${d.url}`, pdf, fieldMap: map, userId });
      out.push({ key: d.key, version: d.version, status: 'INSTALLED', templateId: template.id, mapped: Object.keys(map).length, dropped, sha256Matches: crypto.createHash('sha256').update(pdf).digest('hex') === d.sha256 });
    } catch (err) {
      out.push({ key: d.key, version: d.version, status: 'FAILED', reason: err instanceof HttpError ? err.code : String((err as Error).message ?? 'ERROR').slice(0, 80) });
    }
  }
  return out;
};

// ─── Resolution for a case ──────────────────────────────────────────────

const caseOr404 = async (caseId: string) => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, number: true, companyId: true, clientId: true, client: { select: { firstName: true, lastName: true } } },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  return c;
};

export const activeTemplate = (key: string) => prisma.officialFormTemplate.findFirst({ where: { key, active: true }, orderBy: { updatedAt: 'desc' } });

export interface FillValues {
  /** Employer corrections (data keys). */
  dataOverrides?: Record<string, string>;
  /** Staff overrides per PDF field. */
  fieldOverrides?: Record<string, string>;
  /** Snapshot of the PDF values when generated. */
  fields?: Record<string, string>;
  flatten?: boolean;
}
export const fillValuesOf = (f: Pick<OfficialFormFill, 'values'> | null): FillValues => (f?.values && typeof f.values === 'object' && !Array.isArray(f.values) ? (f.values as FillValues) : {});

const missingView = (missing: ReturnType<typeof applyMapping>['missing'], ctx: { caseId: string; companyId: string | null }) =>
  missing.map((m) => ({ ...m, fix: fixLinkFor(m.source, ctx) }));

/** Resolves a template for a case: rows (field → value), missing values with fix links. Nothing is stored. */
export const resolveForCase = async (t: OfficialFormTemplate, caseId: string, values: FillValues = {}, mapOverride?: FieldMap) => {
  const c = await caseOr404(caseId);
  const [{ fields }, base] = await Promise.all([templateFields(t), loadCaseData(c.id)]);
  const data = deriveData(base, values.dataOverrides ?? {});
  const map = mapOverride ? cleanFieldMap(mapOverride, fields).map : asFieldMap(t.fieldMap);
  const applied = applyMapping(fields, map, data, values.fieldOverrides ?? {});
  return { case: c, fields, data, map, ...applied, missing: missingView(applied.missing, { caseId: c.id, companyId: c.companyId }) };
};

export const fillView = (f: OfficialFormFill & { template?: Pick<OfficialFormTemplate, 'key' | 'title' | 'version'> | null }) => ({
  id: f.id,
  templateId: f.templateId,
  template: f.template ? { key: f.template.key, title: f.template.title, version: f.template.version } : null,
  caseId: f.caseId,
  companyId: f.companyId,
  status: f.status as FillStatus,
  missing: Array.isArray(f.missing) ? (f.missing as unknown[]) : [],
  hasFile: !!f.fileKey,
  driveNodeId: f.driveNodeId,
  signatureRequestId: f.signatureRequestId,
  generatedAt: f.generatedAt,
  createdAt: f.createdAt,
  updatedAt: f.updatedAt,
});

/** The case panel: every key with an active template (and the built-in keys), latest fill per key. */
export const caseFormsOverview = async (caseId: string) => {
  const c = await caseOr404(caseId);
  const templates = await prisma.officialFormTemplate.findMany({ where: { active: true }, orderBy: { key: 'asc' } });
  const waiting = await prisma.officialFormFill.findMany({ where: { caseId: c.id, status: 'SENT_TO_EMPLOYER', signatureRequestId: { not: null } } });
  for (const f of waiting) await syncSignedFill(f).catch(() => undefined);
  const fresh = await prisma.officialFormFill.findMany({ where: { caseId: c.id }, orderBy: { createdAt: 'desc' } });
  const allTemplates = await prisma.officialFormTemplate.findMany({ where: { id: { in: [...new Set(fresh.map((f) => f.templateId))] } }, select: { id: true, key: true, title: true, version: true } });
  const tplById = new Map(allTemplates.map((t) => [t.id, t]));
  const keys = [...new Set([...templates.map((t) => t.key), ...DEFAULT_TEMPLATES.map((d) => d.key), ...fresh.map((f) => tplById.get(f.templateId)?.key).filter((k): k is string => !!k)])];
  return {
    companyId: c.companyId,
    forms: keys.map((key) => {
      const active = templates.find((t) => t.key === key) ?? null;
      const def = DEFAULT_TEMPLATES.find((d) => d.key === key) ?? null;
      const history = fresh.filter((f) => tplById.get(f.templateId)?.key === key).map((f) => fillView({ ...f, template: tplById.get(f.templateId) ?? null }));
      return {
        key,
        title: active?.title ?? def?.title ?? history[0]?.template?.title ?? key,
        template: active ? templateView(active) : null,
        builtIn: !!def,
        employerForm: key === EMPLOYER_FORM_KEY,
        canSendToEmployer: key === EMPLOYER_FORM_KEY && !!active && !!c.companyId,
        latest: history[0] ?? null,
        history: history.slice(0, 10),
      };
    }),
  };
};

// ─── Drive ──────────────────────────────────────────────────────────────

/** "<client folder>/Amtliche Formulare", created when missing (null when the case has no drive folder). */
const formsFolder = async (caseId: string) => {
  const folderId = await ensureCaseFolder(caseId);
  if (!folderId) return null;
  const rows = await prisma.driveNode.findMany({ where: { parentId: folderId, kind: 'FOLDER', deletedAt: null, name: FORMS_FOLDER_NAME }, select: nodeLiteSelect, orderBy: { createdAt: 'asc' } });
  if (rows[0]) return rows[0];
  return prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: FORMS_FOLDER_NAME, parentId: folderId }, select: nodeLiteSelect });
};

const safeName = (s: string) => s.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 150);

/** Saves the PDF into the case's drive folder: a new version of the previous file when it still exists and is not final. */
const putInDrive = async (caseId: string, name: string, pdf: Buffer, userId: string, previousNodeId: string | null) => {
  try {
    if (previousNodeId) {
      const prev = await prisma.driveNode.findUnique({ where: { id: previousNodeId }, select: { id: true, version: true, deletedAt: true, finalAt: true, kind: true } });
      if (prev && !prev.deletedAt && !prev.finalAt && prev.kind === 'FILE') {
        await saveFileVersion(prev.id, pdf, 'application/pdf', prev.version);
        return prev.id;
      }
    }
    const folder = await formsFolder(caseId);
    if (!folder) return null;
    const created = await createFileIn(folder, name, pdf, 'application/pdf', userId);
    return created.id;
  } catch (err) {
    console.error('[officialForms] drive copy failed', caseId, err);
    return null;
  }
};

const caseEvent = (caseId: string, type: string, actorId: string | null, note: string) =>
  prisma.caseEvent.create({ data: { caseId, type, actorId, note: note.slice(0, 2000), visibleToClient: false } }).catch(() => undefined);

// ─── Fill ───────────────────────────────────────────────────────────────

export interface FillInput {
  fieldOverrides?: Record<string, string>;
  flatten?: boolean;
  userId: string;
}

/**
 * Generates the filled PDF for a case (re-generate = same row while it is DRAFT / GENERATED; a signed or submitted
 * fill stays as it is and a new one starts). The PDF goes to private storage and into the drive folder.
 */
export const fillForCase = async (caseId: string, key: string, input: FillInput) => {
  const t = await activeTemplate(key);
  if (!t) throw notFound('TEMPLATE_NOT_FOUND');
  const latest = await latestFillOfKey(caseId, key);
  if (latest?.status === 'SENT_TO_EMPLOYER') throw conflict('SENT_TO_EMPLOYER');
  const reuse = latest && (latest.status === 'DRAFT' || latest.status === 'GENERATED') && latest.templateId === t.id ? latest : null;
  const prevValues = fillValuesOf(reuse);
  const values: FillValues = {
    dataOverrides: prevValues.dataOverrides ?? {},
    fieldOverrides: cleanOverrides(input.fieldOverrides ?? prevValues.fieldOverrides ?? {}),
    flatten: input.flatten ?? prevValues.flatten ?? false,
  };
  const r = await resolveForCase(t, caseId, values);
  const out = await fillPdf(await readStoredForm(t.fileKey), r.values, { flatten: values.flatten });
  values.fields = Object.fromEntries(r.rows.map((x) => [x.field, x.value]));
  const fileKey = await writeStored('fill', out.pdf);
  const name = safeName(`${t.title} – ${r.case.number}.pdf`);
  const driveNodeId = await putInDrive(caseId, name, out.pdf, input.userId, reuse?.driveNodeId ?? (latest?.templateId === t.id ? latest?.driveNodeId : null) ?? null);
  const data = {
    values: values as unknown as Prisma.InputJsonValue,
    missing: r.missing as unknown as Prisma.InputJsonValue,
    fileKey,
    driveNodeId,
    status: 'GENERATED',
    generatedAt: new Date(),
    companyId: r.case.companyId,
  };
  const fill = reuse
    ? await prisma.officialFormFill.update({ where: { id: reuse.id }, data })
    : await prisma.officialFormFill.create({ data: { ...data, templateId: t.id, caseId, createdById: input.userId } });
  if (reuse?.fileKey && reuse.fileKey !== fileKey) await removeStored(reuse.fileKey);
  await caseEvent(caseId, 'OFFICIAL_FORM_GENERATED', input.userId, `${t.title} (${t.version})${r.missing.length ? ` · ${r.missing.length} fehlend` : ''}`);
  return { fill: fillView({ ...fill, template: t }), rows: r.rows, missing: r.missing, errors: out.errors };
};

/** The newest fill of a form key for the case (any template version). */
export const latestFillOfKey = async (caseId: string, key: string) => {
  const ids = (await prisma.officialFormTemplate.findMany({ where: { key }, select: { id: true } })).map((x) => x.id);
  return ids.length ? prisma.officialFormFill.findFirst({ where: { caseId, templateId: { in: ids } }, orderBy: { createdAt: 'desc' } }) : null;
};

const cleanOverrides = (o: Record<string, string>) => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === 'string' && k.length <= 300) out[k] = v.slice(0, 500);
  return out;
};

/** Preview of a template (unsaved mapping allowed) with a sample case: the filled PDF, nothing stored. */
export const previewTemplate = async (id: string, caseId: string, opts: { fieldMap?: FieldMap; flatten?: boolean } = {}) => {
  const t = await templateOr404(id);
  const r = await resolveForCase(t, caseId, {}, opts.fieldMap);
  const out = await fillPdf(await readStoredForm(t.fileKey), r.values, { flatten: opts.flatten });
  return { template: t, rows: r.rows, missing: r.missing, errors: out.errors, pdf: out.pdf, caseNumber: r.case.number };
};

export const fillOr404 = async (id: string) => {
  const f = await prisma.officialFormFill.findUnique({ where: { id } });
  if (!f) throw notFound('FILL_NOT_FOUND');
  return f;
};

/** Staff take a form back from the employer (open signature request cancelled), it becomes GENERATED again. */
export const withdrawFill = async (id: string, actor: { id: string; role: import('@prisma/client').Role; firstName: string; lastName: string }) => {
  const f = await fillOr404(id);
  if (f.status !== 'SENT_TO_EMPLOYER') throw conflict('INVALID_STATUS');
  if (f.signatureRequestId) {
    const { cancelRequest } = await import('../esign/service.js');
    await cancelRequest(f.signatureRequestId, actor, 'Withdrawn by staff').catch(() => undefined);
  }
  const updated = await prisma.officialFormFill.update({ where: { id: f.id }, data: { status: f.fileKey ? 'GENERATED' : 'DRAFT', signatureRequestId: null } });
  await caseEvent(f.caseId, 'OFFICIAL_FORM_WITHDRAWN', actor.id, 'Arbeitgeber-Formular zurückgezogen');
  return fillView(updated);
};

export const markSubmitted = async (id: string, userId: string) => {
  const f = await fillOr404(id);
  if (!['GENERATED', 'SIGNED'].includes(f.status)) throw conflict('INVALID_STATUS');
  const updated = await prisma.officialFormFill.update({ where: { id: f.id }, data: { status: 'SUBMITTED' } });
  await caseEvent(f.caseId, 'OFFICIAL_FORM_SUBMITTED', userId, 'Formular eingereicht');
  return fillView(updated);
};

// ─── Data sheet ─────────────────────────────────────────────────────────

const GROUP_ORDER: DataGroup[] = ['client', 'passport', 'address', 'case', 'spouse', 'children', 'company', 'contract', 'employment', 'meta'];

/**
 * Data sheet for a key: the data keys its (active or built-in) mapping uses, grouped and in German, with missing
 * values highlighted — the fallback for forms that cannot be filled electronically.
 */
export const dataSheetForCase = async (caseId: string, key: string) => {
  const c = await caseOr404(caseId);
  const t = await activeTemplate(key);
  const def = DEFAULT_TEMPLATES.find((d) => d.key === key);
  const map = t ? asFieldMap(t.fieldMap) : def?.fieldMap;
  if (!map) throw notFound('TEMPLATE_NOT_FOUND');
  const data = await loadCaseData(c.id);
  const sources = new Map<string, boolean>();
  for (const m of Object.values(map)) if (m.source !== 'const' && isDataKey(m.source)) sources.set(m.source, (sources.get(m.source) ?? true) && !!m.optional);
  const sections: SheetSection[] = GROUP_ORDER.map((g) => ({
    title: GROUP_LABELS[g].de,
    rows: [...sources.entries()]
      .filter(([s]) => DATA_KEY_MAP.get(s)!.group === g)
      .map(([s, optional]) => {
        const d = DATA_KEY_MAP.get(s)!;
        const raw = data[s] ?? '';
        const value = d.kind === 'date' && raw ? dmyOf(raw) : d.kind === 'money' && raw ? Number(raw).toLocaleString('de-DE', { minimumFractionDigits: 2 }) : raw;
        return { label: d.label.de, value, missing: !raw && !optional };
      })
      .filter((r) => r.value || r.missing),
  }));
  const title = `${t?.title ?? def?.title ?? key} – Datenblatt`;
  const pdf = await dataSheetPdf({
    title,
    subtitle: `${c.number} · ${c.client.firstName} ${c.client.lastName} · ${dmyOf(new Date().toISOString().slice(0, 10))}`,
    note: 'Werte aus der Akte zum Übertragen in das amtliche Formular. Gelb = fehlt noch.',
    sections,
  });
  return { pdf, fileName: safeName(`${c.number}-${key.toLowerCase()}-datenblatt.pdf`) };
};

// ─── Catalogue for the UI ───────────────────────────────────────────────

export const catalogue = () => ({
  keys: DATA_KEYS.map((d) => ({ key: d.key, group: d.group, kind: d.kind, label: d.label, codes: d.codes ?? null, employer: !!d.employer })),
  groups: GROUP_ORDER.map((g) => ({ key: g, label: GROUP_LABELS[g] })),
  formats: FORMATS,
  defaults: DEFAULT_TEMPLATES.map((d) => ({ key: d.key, title: d.title, version: d.version, url: d.url, mapped: Object.keys(d.fieldMap).length })),
});

// ─── Signed (e-signature completion) ────────────────────────────────────

/**
 * The employer signed: the fill becomes SIGNED, the signed PDF lands in the drive folder (the e-signature module
 * already filed it as a case document) and staff are told. Idempotent; called by the e-signature completion
 * hook and lazily when a list finds a completed request.
 */
export const onFormSigned = async (requestId: string, pdf: Buffer) => {
  const f = await prisma.officialFormFill.findFirst({ where: { signatureRequestId: requestId } });
  if (!f || f.status === 'SIGNED' || f.status === 'SUBMITTED') return null;
  const claimed = await prisma.officialFormFill.updateMany({ where: { id: f.id, status: 'SENT_TO_EMPLOYER' }, data: { status: 'SIGNED' } });
  if (!claimed.count) return null;
  const [t, c, req] = await Promise.all([
    prisma.officialFormTemplate.findUnique({ where: { id: f.templateId }, select: { title: true } }),
    prisma.case.findUnique({ where: { id: f.caseId }, select: { number: true, assignedStaffId: true, client: { select: { firstName: true, lastName: true } } } }),
    prisma.signatureRequest.findUnique({ where: { id: requestId }, select: { createdById: true, signers: { select: { name: true } } } }),
  ]);
  const title = t?.title ?? 'Formular';
  const userId = req?.createdById ?? f.createdById ?? c?.assignedStaffId ?? null;
  let driveNodeId: string | null = f.driveNodeId;
  if (userId) {
    const folder = await formsFolder(f.caseId).catch(() => null);
    if (folder) {
      const created = await createFileIn(folder, safeName(`${title} – ${c?.number ?? ''} (unterschrieben).pdf`), pdf, 'application/pdf', userId).catch(() => null);
      if (created) {
        driveNodeId = created.id;
        await prisma.driveNode.update({ where: { id: created.id }, data: { finalAt: new Date(), finalById: null } }).catch(() => undefined);
      }
    }
  }
  await prisma.officialFormFill.update({ where: { id: f.id }, data: { driveNodeId } });
  const who = req?.signers.map((s) => s.name).join(', ') ?? '';
  await caseEvent(f.caseId, 'OFFICIAL_FORM_SIGNED', null, `${title} unterschrieben${who ? ` (${who})` : ''}`);
  await notifyStaff(`${title} unterschrieben`, `${c?.number ?? ''} · ${c ? `${c.client.firstName} ${c.client.lastName}` : ''}: ${who || 'Arbeitgeber'} hat das Formular unterschrieben.`, {
    caseId: f.caseId,
    link: `/admin/cases/${f.caseId}?tab=documents#case-official-forms`,
    type: 'OFFICIAL_FORM_SIGNED',
  });
  return f.id;
};

/** A fill still waiting for a signature whose request completed meanwhile (hook missed): catch up. */
export const syncSignedFill = async (f: Pick<OfficialFormFill, 'status' | 'signatureRequestId'>) => {
  if (f.status !== 'SENT_TO_EMPLOYER' || !f.signatureRequestId) return;
  const r = await prisma.signatureRequest.findUnique({ where: { id: f.signatureRequestId }, select: { id: true, status: true, finalKey: true } });
  if (r?.status !== 'COMPLETED' || !r.finalKey) return;
  const pdf = await fs.readFile(storedPath(r.finalKey)).catch(() => null);
  if (pdf) await onFormSigned(r.id, pdf);
};

export type { CaseData };
