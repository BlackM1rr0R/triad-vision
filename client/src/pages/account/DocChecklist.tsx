import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, CheckCircle2, ChevronDown, Circle, ClipboardCheck, Clock, Hourglass, Lock, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { useChosenCase } from '@/lib/caseContext';
import { usePageTitle } from '@/lib/usePageTitle';
import type { CaseStatus, L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesPortalPlans } from '@/i18n/pagesPortalPlans';
import { pagesPortalMoments } from '@/i18n/pagesPortalMoments';
import { TONE_CLASS } from '@/components/ui/status';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';
import { Documents } from '@/components/illustrations';
import { ProgressRing } from '@/components/portal/ProgressRing';
import { FileDrop } from '@/components/portal/FileDrop';
import { useApiError } from '@/components/portal/useApiError';
import { DocExample, exampleKindOf } from '@/components/docGuide/DocExamples';
import { GuideView } from '@/components/clientData/DocGuideButton';
import type { ClientGuide } from '@/components/clientData/api';
import { useDocCheckGate } from '@/components/vault/DocCheckDialog';

registerCopy(pagesPortalPlans);
registerCopy(pagesPortalMoments);

type ItemState = 'waiting' | 'review' | 'accepted' | 'rejected' | 'upcoming';
type Stage = 'INITIAL' | 'EMBASSY';

interface ChecklistItem {
  id: string | null;
  key: string | null;
  title: L10n;
  description: L10n | null;
  required: boolean;
  state: ItemState;
  files: number;
  lastUploadAt: string | null;
  rejectionNote: string | null;
}

interface ChecklistStage {
  stage: Stage;
  created: boolean;
  open: boolean;
  past: boolean;
  items: ChecklistItem[];
}

/** GET /api/account/plus/doc-checklist (server: lib/account/docChecklist.ts). */
export interface DocChecklistResponse {
  case: { id: string; number: string; status: CaseStatus; visaType: string; visaCategory: { title: L10n; visaLabel: string } | null; relation: string | null; memberName: string | null } | null;
  uploadStage: Stage | null;
  stages: ChecklistStage[];
  progress: { accepted: number; inReview: number; required: number; total: number } | null;
  guides: Record<string, ClientGuide>;
}

export const DOC_CHECKLIST_KEY = ['account-doc-checklist'] as const;

const STATE_TONE: Record<ItemState, string> = {
  waiting: TONE_CLASS.neutral,
  review: TONE_CLASS.warning,
  accepted: TONE_CLASS.success,
  rejected: TONE_CLASS.danger,
  upcoming: TONE_CLASS.neutral,
};
const STATE_ICON = { waiting: Circle, review: Clock, accepted: CheckCircle2, rejected: XCircle, upcoming: Hourglass } as const;

const StateChip = ({ state }: { state: ItemState }) => {
  const { t } = useTranslation();
  const Icon = STATE_ICON[state];
  return (
    <span className={clsx('badge whitespace-nowrap', STATE_TONE[state])}>
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{t('pmom.docState.label')}: </span>
      {t(`pplan.checklist.state.${state}`)}
    </span>
  );
};

const FALLBACK_KEYS = ['CV', 'VIDEX', 'HEALTH_INSURANCE', 'SIGNED_CONTRACT', 'ANERKENNUNG', 'ACCOMMODATION'];

const Item = ({ item, caseId, open, guide, onUploaded }: { item: ChecklistItem; caseId: string; open: boolean; guide: ClientGuide | undefined; onUploaded: () => Promise<unknown> }) => {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  const onError = useApiError();
  const panelId = useId();
  const [expanded, setExpanded] = useState(item.state === 'rejected' || (open && item.state === 'waiting' && item.required));
  const [progress, setProgress] = useState<number | null>(null);
  const { gate, dialog } = useDocCheckGate();
  const title = tr(item.title);
  const description = tr(item.description);
  const canUpload = open && !!item.id && item.state !== 'accepted';
  const fallback = item.key && FALLBACK_KEYS.includes(item.key.toUpperCase()) ? t(`pplan.checklist.fallback.${item.key.toUpperCase()}`) : t('pplan.checklist.fallback.generic');

  const upload = async (file: File) => {
    if (!item.id) return;
    if (!(await gate(file, { requirementKey: item.key }))) return;
    const form = new FormData();
    form.append('requirementId', item.id);
    form.append('file', file);
    setProgress(0);
    try {
      await api.post(`/cases/${caseId}/documents`, form, { onUploadProgress: (e) => setProgress(e.total ? e.loaded / e.total : 0) });
      toast.success(t('pplan.checklist.uploaded'));
      await onUploaded();
    } catch (err) {
      onError(err);
    } finally {
      setProgress(null);
    }
  };

  return (
    <li className={clsx('rounded-xl border bg-card', item.state === 'rejected' ? 'border-danger-border' : 'border-line')}>
      <div className="flex gap-3 p-3 sm:p-4">
        <div className="w-20 shrink-0 sm:w-24" aria-hidden>
          {guide?.sampleImage ? (
            <img src={guide.sampleImage} alt="" loading="lazy" className="aspect-[10/7] w-full rounded-lg border border-line bg-surface object-cover" />
          ) : (
            <DocExample kind={exampleKindOf(item.key)} bad={false} className="w-full rounded-lg" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="min-w-0 text-[0.95rem] font-semibold break-words text-ink">{title}</h4>
            <span className={clsx('badge whitespace-nowrap', item.required ? 'border border-line bg-sunken text-ink' : 'bg-sunken text-muted')}>
              {item.required ? t('common.required') : t('common.optional')}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <StateChip state={item.state} />
            {item.files > 0 && <span>{t('pplan.checklist.files', { count: item.files })}</span>}
            {item.lastUploadAt && <span>{t('pplan.checklist.lastUpload', { date: date(item.lastUploadAt) })}</span>}
          </div>
          {item.rejectionNote && (
            <p className="mt-2 rounded-lg bg-danger-bg px-2.5 py-1.5 text-xs text-danger-fg" role="note">
              {t('pplan.checklist.reason', { note: item.rejectionNote })}
            </p>
          )}
          {description && <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>}
          <button
            type="button"
            className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link hover:underline sm:min-h-9"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown className={clsx('size-4 transition-transform', expanded && 'rotate-180')} aria-hidden />
            {t('pplan.checklist.howToGet')}
          </button>
        </div>
      </div>

      {expanded && (
        <div id={panelId} className="space-y-3 border-t border-line px-3 py-3 sm:px-4">
          {guide && guide.hasText !== false ? <GuideView guide={guide} /> : <p className="text-sm text-muted">{fallback}</p>}
          {!guide?.sampleImage && (
            <figure className="max-w-xs">
              <DocExample kind={exampleKindOf(item.key)} bad={false} title={t('pplan.checklist.sample')} className="w-full rounded-lg" />
              <figcaption className="mt-1 text-[11px] text-muted">{t('pplan.checklist.sample')}</figcaption>
            </figure>
          )}
        </div>
      )}

      {(canUpload || item.id) && (
        <div className="flex flex-col gap-2 border-t border-line px-3 py-3 sm:px-4">
          {canUpload && <FileDrop compact onFile={(f) => void upload(f)} progress={progress} label={item.state === 'rejected' || item.files > 0 ? t('pplan.checklist.reupload') : t('pplan.checklist.upload')} />}
          <Link to={`/account/cases/${caseId}?tab=docs`} className="inline-flex min-h-9 items-center gap-1 self-start text-xs font-semibold text-muted hover:text-ink">
            {t('pplan.checklist.openCase')} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      )}
      {dialog}
    </li>
  );
};

const StageSection = ({ s, caseId, guides, onlyOpen, onUploaded }: { s: ChecklistStage; caseId: string; guides: Record<string, ClientGuide>; onlyOpen: boolean; onUploaded: () => Promise<unknown> }) => {
  const { t } = useTranslation();
  const items = onlyOpen ? s.items.filter((i) => i.state !== 'accepted') : s.items;
  const stateKey = s.open ? 'open' : s.past ? 'past' : s.created ? 'closed' : 'later';
  const StateIcon = s.open ? CheckCircle2 : s.past ? CheckCircle2 : Lock;
  const headingId = `chk-${s.stage}`;
  return (
    <section className="card p-4 sm:p-6" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={headingId} className="type-card-title">
            {t(`pplan.checklist.stage.${s.stage}.title`)}
          </h3>
          <p className="mt-0.5 text-sm text-muted">{t(`pplan.checklist.stage.${s.stage}.text`)}</p>
        </div>
        <span className={clsx('badge whitespace-nowrap', s.open ? TONE_CLASS.success : TONE_CLASS.neutral)}>
          <StateIcon className="size-3.5" aria-hidden /> {t(`pplan.checklist.stageState.${stateKey}`)}
        </span>
      </div>
      {items.length ? (
        <ul className="mt-4 space-y-3">
          {items.map((i, n) => (
            <Item key={i.id ?? `${s.stage}-${i.key ?? n}`} item={i} caseId={caseId} open={s.open} guide={i.key ? guides[i.key.toUpperCase()] : undefined} onUploaded={onUploaded} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-success-fg">
          <CheckCircle2 className="size-4" aria-hidden /> {t('pplan.checklist.allDone')}
        </p>
      )}
    </section>
  );
};

/**
 * Portal › Documents › Document checklist: every document of the visa type (current and later stages), each with
 * an illustrated sample, the "Necə almalı?" guide (ASAN xidmət, apostille, translation), its state and an upload
 * right from the item while the stage is open. Follows the family switcher (a member's own list).
 */
export default function AccountDocChecklist() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  usePageTitle(t('pplan.checklist.title'));
  const { user } = useAuth();
  const chosen = useChosenCase(user?.id);
  const qc = useQueryClient();
  const [onlyOpen, setOnlyOpen] = useState(false);
  const q = useQuery({
    queryKey: [...DOC_CHECKLIST_KEY, chosen ?? 'default'],
    queryFn: async () => (await api.get<DocChecklistResponse>('/account/plus/doc-checklist', { params: chosen ? { case: chosen } : undefined })).data,
    placeholderData: (prev) => prev,
  });

  if (q.isLoading) {
    return (
      <div className="space-y-6" aria-busy>
        <div>
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        </div>
        <div className="card p-5">
          <SkeletonList count={4} />
        </div>
      </div>
    );
  }
  const d = q.data;
  if (!d) return <p className="text-sm text-danger-fg" role="alert">{t('common.error')}</p>;

  const header = (
    <div>
      <h2 className="type-page-title flex items-center gap-2">
        <ClipboardCheck className="size-6 text-primary" aria-hidden /> {t('pplan.checklist.title')}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{t('pplan.checklist.subtitle')}</p>
    </div>
  );

  if (!d.case || !d.progress) {
    return (
      <div className="space-y-6">
        {header}
        <div className="card flex flex-col items-center p-8 text-center">
          <Documents className="w-36" />
          <p className="type-card-title mt-4">{t('pplan.checklist.emptyTitle')}</p>
          <p className="text-sm text-muted">{t('pplan.checklist.emptyText')}</p>
        </div>
      </div>
    );
  }

  const c = d.case;
  const p = d.progress;
  const caseId = c.id;
  const pct = p.required ? Math.round((p.accepted / p.required) * 100) : 100;
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: DOC_CHECKLIST_KEY }),
      qc.invalidateQueries({ queryKey: ['case', caseId] }),
      qc.invalidateQueries({ queryKey: ['account-overview'] }),
    ]);

  return (
    <div className="space-y-6">
      {header}

      <div className="card flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <ProgressRing percent={pct} size={64} stroke={6} label={t('pplan.checklist.progress', { accepted: p.accepted, required: p.required })}>
          <span className="font-display text-sm font-semibold text-ink tabular-nums">{pct}%</span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">
            {c.memberName ? t('pplan.checklist.memberLine', { name: c.memberName }) : t('pplan.checklist.caseLine', { number: c.number })}
            {c.visaCategory && <span className="ml-2 text-sm font-normal text-muted">{tr(c.visaCategory.title)} · {c.visaCategory.visaLabel}</span>}
          </p>
          <p className="text-sm text-muted">{t('pplan.checklist.progress', { accepted: p.accepted, required: p.required })}</p>
          {p.inReview > 0 && <p className="text-xs text-warning-fg">{t('pplan.checklist.inReview', { count: p.inReview })}</p>}
        </div>
        <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="size-4 accent-primary" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          <span className="text-xs sm:text-sm">{t('pplan.checklist.onlyOpen')}</span>
        </label>
      </div>

      {d.stages.map((s) => (
        <StageSection key={s.stage} s={s} caseId={caseId} guides={d.guides} onlyOpen={onlyOpen} onUploaded={refresh} />
      ))}
    </div>
  );
}
