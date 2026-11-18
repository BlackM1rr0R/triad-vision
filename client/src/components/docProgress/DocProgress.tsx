import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, Check, CheckCircle2, Circle, Clock, FileStack, Info, Landmark, Lock, RotateCw, Upload, Users, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesDocProgress } from '@/i18n/pagesDocProgress';
import { pagesPortalMoments } from '@/i18n/pagesPortalMoments'; // pmom.docState.* (the same words as the case page chips)
import { TONE_BORDER, TONE_CLASS, TONE_SOLID } from '@/components/ui/status';
import { stepLabel } from '@/components/portal/stepLabel';
import type { RequirementState } from '@/components/portal/requirementState';
import { caseHref } from '@/pages/account/portal/useNextUp';
import {
  PROCESSING_TONE,
  SEGMENT_ORDER,
  STATE_OF,
  STATE_TONE,
  segmentsOf,
  sortForList,
  type DocProgressOverview,
  type OverviewDocStage,
  type OverviewItem,
  type ProcessingInfo,
  type StageCounts,
} from './model';

registerCopy(pagesDocProgress);
registerCopy(pagesPortalMoments);

/**
 * "Sənədlərimin vəziyyəti" (GET /api/doc-progress/cases/:id): a progress ring for the whole way, the six steps as a
 * horizontal timeline, one stacked bar per document stage (accepted / in review / rejected / waiting) with a legend
 * and a table view, a compact list of the documents with coloured chips, the team's stage as information
 * (Schon geschrieben / In Bearbeitung / Fertig / Ablehnung) and — while the client waits for the work contract —
 * "Səfirlik üçün sənədlərin toplanması". Self-made SVG / CSS, no chart library; every chart has a text equivalent.
 */

export const docProgressKey = (caseId: string) => ['doc-progress', caseId] as const;

export const useDocProgress = (caseId: string | null | undefined) =>
  useQuery({
    queryKey: docProgressKey(caseId ?? ''),
    queryFn: async () => (await api.get<{ overview: DocProgressOverview }>(`/doc-progress/cases/${caseId}`)).data.overview,
    enabled: !!caseId,
    staleTime: 30_000,
  });

const STATE_ICON = { waiting: Circle, review: Clock, accepted: CheckCircle2, rejected: XCircle } as const;

// ─── Small pieces ─────────────────────────────────────────────────────

export const DocStateChip = ({ state, className }: { state: RequirementState; className?: string }) => {
  const { t } = useTranslation();
  const Icon = STATE_ICON[state];
  return (
    <span className={clsx('badge whitespace-nowrap', TONE_CLASS[STATE_TONE[state]], className)}>
      <Icon className="size-3.5" aria-hidden />
      {t(`pmom.docState.${state}`)}
    </span>
  );
};

/** "Fertig — hazırdır": the German word always visible, the translation after it. */
export const ProcessingChip = ({ p, className }: { p: ProcessingInfo; className?: string }) => {
  const { tr, locale } = useL10n();
  const Icon = p.stage === 'DONE' ? CheckCircle2 : p.stage === 'REFUSED' ? XCircle : p.stage === 'WRITTEN' ? FileStack : Clock;
  return (
    <span className={clsx('badge whitespace-nowrap', TONE_CLASS[PROCESSING_TONE[p.tone]], className)} lang="de">
      <Icon className="size-3.5" aria-hidden />
      <span className="font-semibold">{p.word}</span>
      {locale !== 'de' && <span lang={locale} className="font-normal"> — {tr(p.meaning)}</span>}
    </span>
  );
};

/** Ring for the whole way (percent 0–100). */
const ProgressRing = ({ percent, size = 112 }: { percent: number; size?: number }) => {
  const { t } = useTranslation();
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const done = percent >= 100;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${t('dprog.overall')}: ${t('dprog.percent', { percent })}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={done ? 'var(--color-success)' : 'var(--color-highlight)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(Math.max(0, Math.min(100, percent)) / 100) * circ} ${circ}`}
          className="transition-[stroke-dasharray] duration-700 motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center" aria-hidden>
        <span>
          <span className="block text-2xl font-bold text-ink tabular-nums">{percent}%</span>
        </span>
      </span>
    </div>
  );
};

/** Six steps, left to right (scrolls sideways on narrow phones). */
const StageTimeline = ({ o }: { o: DocProgressOverview }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const fmt = (iso: string) => date(iso, { day: 'numeric', month: 'short' });
  const total = o.steps.length;
  const currentIndex = o.steps.findIndex((s) => s.state === 'current');
  return (
    <div>
      <h3 className="type-overline text-muted">{t('dprog.stepsTitle')}</h3>
      {currentIndex >= 0 && (
        <p className="mt-1 text-sm text-muted sm:hidden">
          {t('dprog.stepOf', { n: currentIndex + 1, total })} · <span className="font-semibold text-ink">{stepLabel(t, o.steps[currentIndex].key, o.visaType)}</span>
        </p>
      )}
      <ol className="-mx-1 mt-3 flex snap-x gap-1 overflow-x-auto px-1 pb-1" aria-label={t('dprog.stepsTitle')}>
        {o.steps.map((s, i) => {
          const label = stepLabel(t, s.key, o.visaType);
          const when =
            s.state === 'done' && (s.leftAt || s.enteredAt)
              ? t('dprog.doneOn', { date: fmt((s.leftAt ?? s.enteredAt)!) })
              : s.state === 'current' && s.enteredAt
                ? t('dprog.since', { date: fmt(s.enteredAt) })
                : s.state === 'upcoming' && s.expectedTo
                  ? t('dprog.expected', { range: s.expectedFrom && fmt(s.expectedFrom) !== fmt(s.expectedTo) ? `${fmt(s.expectedFrom)} – ${fmt(s.expectedTo)}` : fmt(s.expectedTo) })
                  : null;
          return (
            <li key={s.key} className="relative min-w-[6.5rem] flex-1 snap-start" aria-current={s.state === 'current' ? 'step' : undefined}>
              <div className="flex items-center">
                <span
                  className={clsx(
                    'grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-bold',
                    s.state === 'done' && 'border-success bg-success text-white',
                    s.state === 'current' && 'border-highlight bg-highlight-bg text-highlight-fg',
                    s.state === 'upcoming' && 'border-line bg-card text-muted',
                  )}
                  aria-hidden
                >
                  {s.state === 'done' ? <Check className="size-4" /> : i + 1}
                </span>
                {i < total - 1 && <span className={clsx('mx-1 h-0.5 flex-1 rounded-full', s.state === 'done' ? 'bg-success' : 'bg-line')} aria-hidden />}
              </div>
              <p className={clsx('mt-2 pr-2 text-xs leading-snug font-semibold', s.state === 'upcoming' ? 'text-muted' : 'text-ink')}>{label}</p>
              <p className="pr-2 text-[11px] leading-snug text-muted">
                <span className="sr-only">{t(`dprog.state.${s.state}`)}. </span>
                {when}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

/** One stage as a stacked bar (2px surface gaps between the parts), the counts as text right under it. */
const StageBar = ({ d }: { d: OverviewDocStage }) => {
  const { t } = useTranslation();
  const title = d.stage === 'INITIAL' ? t('portal.docs.initialTitle') : t('portal.docs.embassyTitle');
  const segments = segmentsOf(d.counts);
  const summary = SEGMENT_ORDER.map((s) => [s, s === 'accepted' ? d.counts.accepted : s === 'review' ? d.counts.pending : s === 'rejected' ? d.counts.rejected : d.counts.missing] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${t(`pmom.docState.${s}`)}: ${n}`)
    .join(', ');
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-ink">
          {title}
          {d.preview && <span className="ml-2 badge bg-sunken text-muted">{t('dprog.preview')}</span>}
        </p>
        <p className="text-xs text-muted tabular-nums">{t('dprog.counts', { accepted: d.counts.accepted, total: d.counts.total })}</p>
      </div>
      <div className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${title}: ${summary}`}>
        {segments.map((s) => (
          <span
            key={s.state}
            className={clsx('h-full first:rounded-l-full last:rounded-r-full', d.preview ? 'bg-line' : TONE_SOLID[STATE_TONE[s.state]])}
            style={{ width: `${s.share * 100}%` }}
            title={`${t(`pmom.docState.${s.state}`)}: ${s.count}`}
          />
        ))}
      </div>
      {d.counts.required > 0 && !d.preview && <p className="mt-1 text-xs text-muted tabular-nums">{t('dprog.requiredLine', { done: d.counts.requiredAccepted, total: d.counts.required })}</p>}
    </div>
  );
};

const Legend = () => {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted" aria-label={t('dprog.legend')}>
      {SEGMENT_ORDER.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span className={clsx('size-2.5 rounded-full', TONE_SOLID[STATE_TONE[s]])} aria-hidden />
          {t(`pmom.docState.${s}`)}
        </li>
      ))}
    </ul>
  );
};

/** The numbers behind the bars as a table (folded). */
const CountsTable = ({ stages }: { stages: OverviewDocStage[] }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  const n = (c: StageCounts, s: RequirementState) => (s === 'accepted' ? c.accepted : s === 'review' ? c.pending : s === 'rejected' ? c.rejected : c.missing);
  return (
    <div>
      <button type="button" className="min-h-10 text-sm font-semibold text-link hover:underline" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        {open ? t('dprog.hideTable') : t('dprog.showTable')}
      </button>
      <div id={id} hidden={!open} className="mt-2 overflow-x-auto">
        {open && (
          <table className="w-full min-w-[22rem] text-left text-sm">
            <caption className="sr-only">{t('dprog.tableCaption')}</caption>
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-semibold">{t('dprog.colStage')}</th>
                {SEGMENT_ORDER.map((s) => (
                  <th key={s} scope="col" className="py-1.5 pr-3 text-right font-semibold">{t(`pmom.docState.${s}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stages.map((d) => (
                <tr key={d.stage} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-3 font-medium text-ink">{d.stage === 'INITIAL' ? t('portal.docs.initialTitle') : t('portal.docs.embassyTitle')}</th>
                  {SEGMENT_ORDER.map((s) => (
                    <td key={s} className="py-1.5 pr-3 text-right tabular-nums text-ink">{n(d.counts, s)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

/** The team's stage (informational): chip, explanation, since when. */
export const TeamStatus = ({ p, compact }: { p: ProcessingInfo | null; compact?: boolean }) => {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  if (!p) return compact ? null : <p className="flex items-start gap-2 text-sm text-muted"><Users className="mt-0.5 size-4 shrink-0" aria-hidden />{t('dprog.team.notStarted')}</p>;
  return (
    <div className={clsx('rounded-2xl border p-4', TONE_BORDER[PROCESSING_TONE[p.tone]])} data-testid="doc-progress-team">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Users className="size-4 shrink-0 text-muted" aria-hidden />
          {t('dprog.team.title')}
        </p>
        <ProcessingChip p={p} />
        {p.at && <span className="text-xs text-muted">{t('dprog.team.since', { date: date(p.at) })}</span>}
      </div>
      <p className="mt-2 text-sm text-ink">{tr(p.explanation)}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        <Info className="size-3.5 shrink-0" aria-hidden />
        {t('dprog.team.infoOnly')}
      </p>
    </div>
  );
};

const ItemRow = ({ item, embassy, uploadHref }: { item: OverviewItem; embassy?: boolean; uploadHref?: string }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <span className="flex min-w-0 items-start gap-2 text-sm text-ink">
        {embassy ? <Landmark className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /> : <FileStack className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />}
        <span className="min-w-0 break-words">
          {tr(item.title) || item.key}
          {!item.required && <span className="text-muted"> · {t('dprog.optional')}</span>}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <DocStateChip state={STATE_OF[item.status]} />
        {/* Early embassy uploads (server lib/earlyEmbassy): a direct way to the upload of this document. */}
        {uploadHref && item.uploadable && (item.status === 'MISSING' || item.status === 'REJECTED') && (
          <Link to={uploadHref} className="btn-secondary min-h-10 px-3 text-sm" data-testid="embassy-upload-item">
            <Upload className="size-4" aria-hidden />
            {t('dprog.embassy.uploadOne')}
            <span className="sr-only">: {tr(item.title) || item.key}</span>
          </Link>
        )}
      </span>
    </li>
  );
};

/** Compact list: the team row first (when there is a stage), then the documents (what needs the client first). */
const DocList = ({ o, limit = 6 }: { o: DocProgressOverview; limit?: number }) => {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const items = sortForList(o.documents.filter((d) => !d.preview).flatMap((d) => d.items.map((i) => ({ ...i, embassy: d.stage === 'EMBASSY' }))));
  const shown = all ? items : items.slice(0, limit);
  return (
    <div>
      <h3 className="type-overline text-muted">{t('dprog.listTitle')}</h3>
      <ul className="mt-1 divide-y divide-line">
        {o.processing && (
          <li className="flex items-start justify-between gap-3 py-2.5">
            <span className="flex min-w-0 items-start gap-2 text-sm text-ink">
              <Users className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 break-words">{t('dprog.team.item')}</span>
            </span>
            <ProcessingChip p={o.processing} className="shrink-0" />
          </li>
        )}
        {shown.map((i, n) => (
          <ItemRow key={i.id ?? `${i.key}-${n}`} item={i} embassy={i.embassy} />
        ))}
      </ul>
      {items.length > limit && (
        <button type="button" className="mt-1 min-h-10 text-sm font-semibold text-link hover:underline" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? t('dprog.showLess') : t('dprog.showAll', { count: items.length })}
        </button>
      )}
    </div>
  );
};

/** "Səfirlik üçün sənədlərin toplanması": shown while the client waits for the work contract. */
export const EmbassyCollectionCard = ({ o }: { o: DocProgressOverview }) => {
  const { t } = useTranslation();
  const e = o.embassyCollection;
  if (!e) return null;
  return (
    <section className="rounded-3xl border-2 border-highlight/50 bg-highlight-bg p-5 sm:p-6" aria-labelledby={`embassy-collect-${o.caseId}`} data-testid="embassy-collection">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-card text-highlight-fg" aria-hidden>
          <Landmark className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 id={`embassy-collect-${o.caseId}`} className="type-card-title">{t('dprog.embassy.title')}</h3>
          <p className="mt-1 text-sm text-ink">{t('dprog.embassy.text')}</p>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-line rounded-2xl bg-card px-4">
        {e.items.map((i, n) => (
          <ItemRow key={i.id ?? `${i.key}-${n}`} item={i} embassy uploadHref={e.uploadOpen ? caseHref(o.caseId, 'docs', '#docs-embassy') : undefined} />
        ))}
      </ul>
      {e.uploadOpen ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-ink">{t('dprog.embassy.openNow')}</p>
          <Link to={caseHref(o.caseId, 'docs', '#docs-embassy')} className="btn-primary min-h-11">
            <Upload className="size-4" aria-hidden />
            {t('dprog.embassy.upload')}
          </Link>
        </div>
      ) : (
        <p className="mt-4 flex items-start gap-2 text-sm text-ink" data-testid="embassy-upload-soon">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          {t('dprog.embassy.soon')}
        </p>
      )}
      <p className="mt-3 text-xs text-muted">{t('dprog.embassy.note')}</p>
    </section>
  );
};

// ─── Sections ─────────────────────────────────────────────────────────

const Shell = ({ children, labelledBy }: { children: ReactNode; labelledBy: string }) => (
  <section className="card space-y-6 p-5 sm:p-7" aria-labelledby={labelledBy} data-tour="portal-doc-progress">
    {children}
  </section>
);

/** Portal home: the full overview of the client's case (ring, timeline, bars, list, team stage, embassy card). */
export function DocStatusSection({ caseId }: { caseId: string | null | undefined }) {
  const { t } = useTranslation();
  const q = useDocProgress(caseId);
  const titleId = useId();
  if (!caseId) return null;
  if (q.isLoading) {
    return (
      <Shell labelledBy={titleId}>
        <h2 id={titleId} className="type-card-title">{t('dprog.title')}</h2>
        <div className="h-28 animate-pulse rounded-2xl bg-sunken motion-reduce:animate-none" aria-label={t('dprog.loading')} />
      </Shell>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Shell labelledBy={titleId}>
        <h2 id={titleId} className="type-card-title">{t('dprog.title')}</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          {t('dprog.error')}
          <button type="button" className="btn-secondary min-h-10" onClick={() => void q.refetch()}>
            <RotateCw className="size-4" aria-hidden />
            {t('dprog.retry')}
          </button>
        </div>
      </Shell>
    );
  }
  const o = q.data;
  return (
    <>
      <Shell labelledBy={titleId}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          {o.percent !== null ? <ProgressRing percent={o.percent} /> : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="type-card-title text-xl">{t('dprog.title')}</h2>
            <p className="type-small mt-1">{o.percent === null ? t('dprog.cancelled') : t('dprog.subtitle')}</p>
            {o.percent !== null && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-sunken sm:hidden" role="progressbar" aria-valuenow={o.percent} aria-valuemin={0} aria-valuemax={100} aria-label={t('dprog.overall')}>
                <span className={clsx('block h-full rounded-full', o.percent >= 100 ? 'bg-success' : 'bg-highlight')} style={{ width: `${o.percent}%` }} />
              </div>
            )}
            <Link to={caseHref(o.caseId, 'docs')} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-link hover:underline">
              {t('dprog.openDocs')}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>

        <StageTimeline o={o} />

        <div className="space-y-4">
          <h3 className="type-overline text-muted">{t('dprog.docsTitle')}</h3>
          {o.documents.map((d) => (
            <StageBar key={d.stage} d={d} />
          ))}
          <Legend />
          <CountsTable stages={o.documents} />
        </div>

        {o.processing && <TeamStatus p={o.processing} />}

        <DocList o={o} />
      </Shell>
      {o.embassyCollection && <EmbassyCollectionCard o={o} />}
    </>
  );
}

/** Case page, documents tab: the bars, the team stage and the embassy card (the detailed lists follow below it). */
export function CaseDocProgress({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const q = useDocProgress(caseId);
  const titleId = useId();
  const o = q.data;
  if (!o) return null;
  return (
    <>
      {o.embassyCollection && <EmbassyCollectionCard o={o} />}
      <Shell labelledBy={titleId}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={titleId} className="type-card-title text-xl">{t('dprog.title')}</h2>
          {o.percent !== null && <span className="text-sm font-semibold text-ink tabular-nums">{t('dprog.percent', { percent: o.percent })}</span>}
        </div>
        <div className="space-y-4">
          {o.documents.map((d) => (
            <StageBar key={d.stage} d={d} />
          ))}
          <Legend />
          <CountsTable stages={o.documents} />
        </div>
        <TeamStatus p={o.processing} />
      </Shell>
    </>
  );
}
