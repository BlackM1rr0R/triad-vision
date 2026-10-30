import type { CaseStatus } from '@prisma/client';
import { HttpError } from '../http.js';
import { csvSafe } from '../csvSafe.js';

/**
 * Bulk actions on admin lists (routes/admin/bulk.ts): shared limits, the batched runner with per-item results,
 * the case status transitions allowed for a whole selection, message templates and CSV.
 */

/** Most items one bulk request may touch (the client caps "all matching" to the same number). */
export const BULK_MAX = 500;
/** Items processed in parallel inside one request. */
export const BULK_CHUNK = 10;

export interface BulkItemResult {
  id: string;
  ok: boolean;
  error?: string;
}

const codeOf = (err: unknown) => (err instanceof HttpError ? err.code : err instanceof Error && /^[A-Z_]+$/.test(err.message) ? err.message : 'FAILED');

/** Runs `fn` for every id, BULK_CHUNK at a time; one failure never stops the others. Order of `ids` is kept. */
export const runBatched = async (ids: string[], fn: (id: string) => Promise<void>, chunk = BULK_CHUNK): Promise<BulkItemResult[]> => {
  const out: BulkItemResult[] = [];
  for (let i = 0; i < ids.length; i += chunk) {
    const part = ids.slice(i, i + chunk);
    const settled = await Promise.allSettled(part.map((id) => fn(id)));
    settled.forEach((s, j) => out.push(s.status === 'fulfilled' ? { id: part[j], ok: true } : { id: part[j], ok: false, error: codeOf(s.reason) }));
  }
  return out;
};

export const summarize = (results: BulkItemResult[]) => ({ ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });

// ─── Case status (workflow) ────────────────────────────────────────────

/**
 * Workflow actions offered in bulk and the statuses each one starts from (lib/caseFlow). Actions that need a
 * per-case decision (appointment, visa decision, contract upload) stay on the case page.
 */
export const CASE_BULK_ACTIONS = {
  REQUEST_CHANGES: ['DOCUMENTS_REVIEW', 'EMBASSY_REVIEW'],
  CONFIRM_CONTRACT: ['CONTRACT_SIGNED'],
  MARK_LODGED: ['APPOINTMENT_SCHEDULED'],
  CANCEL: ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'],
  REOPEN: ['REJECTED', 'CANCELLED'],
} as const satisfies Record<string, readonly CaseStatus[]>;
export type CaseBulkAction = keyof typeof CASE_BULK_ACTIONS;
export const CASE_BULK_ACTION_KEYS = Object.keys(CASE_BULK_ACTIONS) as CaseBulkAction[];

/** The actions valid for every one of the given statuses (empty selection = none). */
export const commonCaseActions = (statuses: CaseStatus[]): CaseBulkAction[] => {
  if (!statuses.length) return [];
  const set = new Set(statuses);
  return CASE_BULK_ACTION_KEYS.filter((a) => [...set].every((s) => (CASE_BULK_ACTIONS[a] as readonly CaseStatus[]).includes(s)));
};

/**
 * The action that undoes a status change, when the workflow has one (used by the undo toast of the cases list):
 * a cancellation can be reopened at the step it came from; everything else has no safe reverse.
 */
export const reverseOf = (action: CaseBulkAction, from: CaseStatus): { action: 'REOPEN'; to: 'DOCUMENTS_PENDING' | 'EMBASSY_DOCUMENTS' } | null =>
  action === 'CANCEL' && (from === 'DOCUMENTS_PENDING' || from === 'EMBASSY_DOCUMENTS') ? { action: 'REOPEN', to: from } : null;

// ─── Message templates ─────────────────────────────────────────────────

export const TEMPLATE_VARS = ['firstName', 'lastName', 'fullName', 'caseNumber', 'profession', 'staffName', 'companyName', 'contactName'] as const;
export type TemplateVar = (typeof TEMPLATE_VARS)[number];

/** Replaces {{var}} placeholders (spaces allowed inside the braces); unknown or missing values become "". */
export const renderTemplate = (template: string, vars: Partial<Record<TemplateVar, string | null | undefined>>) =>
  template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_m, name: string) => ((TEMPLATE_VARS as readonly string[]).includes(name) ? (vars[name as TemplateVar] ?? '') : ''));

// ─── CSV ───────────────────────────────────────────────────────────────

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  const safe = csvSafe(s);
  return /[",;\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Semicolon-separated CSV (Excel in de/az locales) with a UTF-8 BOM. */
export const toCsv = (headers: string[], rows: unknown[][]) => `﻿${[headers, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
