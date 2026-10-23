import { useSyncExternalStore } from 'react';
import type { TFunction } from 'i18next';
import { api } from '@/lib/api';
import { registerCopy, type Locale } from '@/i18n';
import { pagesCaseNext } from '@/i18n/pagesCaseNext';
import { fmtDate, fmtDateTime } from '@/components/admin/labels';
import { statusTone, TONE_CLASS } from '@/components/ui/status';
import type { CaseStatus, L10n } from '@/lib/types';
import type { FamilyPackageMember } from '@/components/family/FamilyPackageOption';

registerCopy(pagesCaseNext);

/** Shapes of /api/admin/cases/:id/next-step* and /embassy-package* (server: routes/admin/caseNext.ts, lib/caseNext). */

export interface ApiCall {
  method: 'POST';
  path: string;
  body: Record<string, unknown>;
}

export type NextAction =
  | { id: string; kind: 'review'; documentIds: string[] }
  | { id: string; kind: 'request'; request: ApiCall; items: L10n[] }
  | { id: string; kind: 'message'; request: ApiCall; draft: string; locale: Locale }
  | { id: string; kind: 'task'; request: ApiCall; title: string }
  | { id: string; kind: 'transition'; request: ApiCall; confirm: true; note?: string }
  | { id: string; kind: 'package' }
  | { id: string; kind: 'scroll'; target: string };

export interface NextStep {
  code: string;
  priority: number;
  tone: 'urgent' | 'action' | 'info';
  params: Record<string, string | number>;
  items: L10n[];
  actions: NextAction[];
}

export interface NextStepView {
  caseId: string;
  status: CaseStatus;
  steps: NextStep[];
  rest: NextStep[];
  total: number;
  clientLocale: Locale;
  daysInStatus: number;
  typicalDays: number;
  generatedAt: string;
}

export interface NextStepSummary {
  code: string;
  tone: NextStep['tone'];
  params: Record<string, string | number>;
  more: number;
}

export interface NextStepAi {
  explanation: string | null;
  risk: string | null;
  draft: { body: string; locale: Locale } | null;
  ai: { status: 'done' | 'skipped'; reason?: string; model?: string; costUsd?: number };
  cached?: boolean;
  nextStep: NextStepView;
}

export const nextStepKey = (caseId: string) => ['case-next-step', caseId] as const;
export const nextStepAiKey = (caseId: string, generatedFor: string) => ['case-next-step-ai', caseId, generatedFor] as const;

export const fetchNextStep = async (caseId: string) => (await api.get<{ nextStep: NextStepView }>(`/admin/cases/${caseId}/next-step`)).data.nextStep;
export const fetchNextStepAi = async (caseId: string) => (await api.post<NextStepAi>(`/admin/cases/${caseId}/next-step/ai`, {})).data;

/** Runs an action's request against its (existing) endpoint. */
export const runCall = async <T = unknown>(call: ApiCall, body?: Record<string, unknown>) => (await api.post<T>(call.path, body ?? call.body)).data;

/** Rule params with dates formatted for the reader. */
export const ruleText = (t: TFunction, s: { code: string; params: Record<string, string | number> }) => {
  const p: Record<string, string | number> = { ...s.params };
  for (const k of ['date', 'entry'] as const) if (typeof p[k] === 'string') p[k] = fmtDate(String(p[k]));
  return t(`caseNext.rule.${s.code}`, { ...p, defaultValue: s.code });
};

/** Next-step callouts (ring-1 is added by the caller): tint + ring from the central tones. */
export const TONE_STYLE: Record<NextStep['tone'], string> = {
  urgent: `${TONE_CLASS[statusTone('nextStep', 'urgent')]} ring-danger-border`,
  action: `${TONE_CLASS[statusTone('nextStep', 'action')]} ring-warning-border`,
  info: `${TONE_CLASS[statusTone('nextStep', 'info')]} ring-info-border`,
};

// ─── Embassy package ───────────────────────────────────────────────

export type ItemStatus = 'found' | 'pending' | 'missing' | 'manual';

export interface CandidateDoc {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  stage: string;
  createdAt: string;
  embeddable: boolean;
}

export interface PreviewItem {
  key: string;
  source: 'checklist' | 'extra';
  label: L10n;
  requirementKey: string | null;
  requirementId: string | null;
  status: ItemStatus;
  document: CandidateDoc | null;
  candidates: CandidateDoc[];
  include: boolean;
}

export interface PackagePreview {
  caseId: string;
  number: string;
  visaType: string;
  items: PreviewItem[];
  summary: Record<ItemStatus, number>;
  appointmentAt: string | null;
  appointmentPlace: string | null;
  maxBytes: number;
  lastPackage: { documentId: string; name: string; createdAt: string } | null;
  /** Family members of a main case (each can be added as a section, build option `family`). */
  family?: FamilyPackageMember[];
}

export interface BuildResult {
  document: { id: string; originalName: string; mimeType: string; size: number };
  format: 'pdf' | 'zip';
  pages: number;
  sizeBytes: number;
  entries: { key: string; title: string; startPage: number; endPage: number; copies: number; note: string | null }[];
  notIncluded: { key: string; label: L10n; status: ItemStatus }[];
}

export const packageKey = (caseId: string) => ['embassy-package', caseId] as const;
export const fetchPackagePreview = async (caseId: string) => (await api.get<{ preview: PackagePreview }>(`/admin/cases/${caseId}/embassy-package`)).data.preview;

export const fmtAppointment = (iso: string | null) => (iso ? fmtDateTime(iso) : null);

/** Open state of the embassy package drawer, shared by the panel button and the next-step card. */
let openFor: string | null = null;
const listeners = new Set<() => void>();
export const openPackage = (caseId: string | null) => {
  openFor = caseId;
  listeners.forEach((l) => l());
};
export const usePackageOpen = (caseId: string) =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => openFor === caseId,
  );

/** Event the tabbed admin case page listens to: it switches to the tab holding the section, then scrolls (cancelable). */
export const CASE_SECTION_EVENT = 'tv:case-section';

/** Scroll to a section of the case page (ids set in CaseAdmin / components/admin/case). */
export const scrollToSection = (id: string) => {
  // Handled by the case page (the section may live in another tab).
  if (!window.dispatchEvent(new CustomEvent(CASE_SECTION_EVENT, { detail: id, cancelable: true }))) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('ring-2', 'ring-brand-600/40', 'rounded-xl');
  window.setTimeout(() => el.classList.remove('ring-2', 'ring-brand-600/40', 'rounded-xl'), 1600);
};
