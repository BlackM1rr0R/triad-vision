import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, CheckCircle2, Circle, ExternalLink, MinusCircle, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesStaffOnboarding } from '@/i18n/pagesStaffOnboarding';
import { ErrorBlock, ListSkeleton, PageHead, Panel } from '@/components/admin/ui';
import { fmtDate, toastError } from '@/components/admin/labels';
import { ProgressBar } from '@/components/staffOnboarding/ProgressBar';
import { pick, setupChecklistKey, type SetupChecklist as Checklist, type SetupItem, type SetupState } from '@/components/staffOnboarding/api';

registerCopy(pagesStaffOnboarding);

const STATE_CLASS: Record<SetupState, string> = {
  done: 'bg-success-bg text-success-fg',
  notNeeded: 'bg-neutral-bg text-neutral-fg',
  open: 'bg-warning-bg text-warning-fg',
};
const STATE_ICON = { done: CheckCircle2, notNeeded: MinusCircle, open: Circle } as const;

/** Facts from the server's auto check, in words. */
const useDetail = () => {
  const { t } = useTranslation();
  return (item: SetupItem): string | null => {
    const d = item.detail;
    if (!d) return null;
    const yn = (v: unknown) => (v ? t('sob.setup.detail.yes') : t('sob.setup.detail.no'));
    switch (item.id) {
      case 'studyProgrammes':
        return t('sob.setup.detail.drafts', { drafts: d.drafts ?? 0, total: d.total ?? 0 });
      case 'dataFreshness':
        return Number(d.overdue) > 0 ? t('sob.setup.detail.overdue', { count: Number(d.overdue) }) : null;
      case 'pastPlacements':
      case 'tvToken':
        return t('sob.setup.detail.count', { count: Number(d.count ?? 0) });
      case 'trustCenter': {
        const missing = String(d.missing ?? '')
          .split(',')
          .filter(Boolean);
        return missing.length ? t('sob.setup.detail.missing', { fields: missing.map((f) => t(`sob.setup.detail.fields.${f}`)).join(', ') }) : null;
      }
      case 'googleReview':
        return `${t('sob.setup.detail.link', { v: yn(d.link) })} · ${t('sob.setup.detail.enabled', { v: yn(d.enabled) })}`;
      case 'searchConsole':
        return d.reason ? t(`sob.setup.detail.reason.${String(d.reason)}`) : null;
      default:
        return null;
    }
  };
};

/**
 * Admin → System → Setup checklist (/admin/setup-checklist, ADMIN+): what the owner still has to do so the new
 * features work. Auto items are checked on the server (settings / database), manual items are marked done; any
 * item can be "not needed". Progress excludes optional items (server lib/ownerSetup).
 */
export default function AdminSetupChecklist() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('sob.setup.title'));
  const qc = useQueryClient();
  const detail = useDetail();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: setupChecklistKey, queryFn: async () => (await api.get<Checklist>('/admin/setup-checklist')).data });
  const mark = useMutation({
    mutationFn: async (p: { id: string; state: 'done' | 'notNeeded' | null }) =>
      (await api.post<Checklist>(`/admin/setup-checklist/${p.id}`, { state: p.state, note: notes[p.id]?.trim() || null })).data,
    onSuccess: (data) => qc.setQueryData(setupChecklistKey, data),
    onError: (e) => toastError(e, t('sob.error')),
  });

  if (q.isLoading) return <ListSkeleton rows={12} cols={2} />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const progressLabel = t('sob.setup.progress', { percent: d.percent, resolved: d.resolved, total: d.total });
  const ordered = [...d.items].sort((a, b) => Number(a.state !== 'open') - Number(b.state !== 'open'));

  return (
    <div className="space-y-6">
      <PageHead
        title={t('sob.setup.title')}
        subtitle={t('sob.setup.subtitle')}
        actions={
          <button type="button" className="btn-secondary btn-sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={clsx('size-3.5', q.isFetching && 'animate-spin')} aria-hidden /> {t('sob.setup.refresh')}
          </button>
        }
      />

      <Panel>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink">{progressLabel}</p>
          <ProgressBar percent={d.percent} label={progressLabel} />
        </div>
      </Panel>

      <ul className="space-y-3">
        {ordered.map((item) => {
          const Icon = STATE_ICON[item.state];
          const fact = detail(item);
          return (
            <li key={item.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <Icon className={clsx('mt-0.5 size-5 shrink-0', item.state === 'done' ? 'text-success-fg' : item.state === 'notNeeded' ? 'text-subtle' : 'text-warning-fg')} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-ink">{pick(item.title, i18n.language)}</h2>
                    <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATE_CLASS[item.state])}>{t(`sob.setup.state.${item.state}`)}</span>
                    <span className="text-[11px] text-muted">{t(`sob.setup.kind.${item.kind}`)}</span>
                    {item.optional && <span className="text-[11px] text-muted">· {t('sob.setup.optional')}</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted">{pick(item.explain, i18n.language)}</p>
                  {fact && <p className="mt-1 text-xs font-medium text-ink">{fact}</p>}
                  {item.mark && (
                    <p className="mt-1 text-xs text-muted">
                      {t('sob.setup.markedBy', { by: item.mark.by, date: fmtDate(item.mark.at) })}
                      {item.mark.note ? ` — ${item.mark.note}` : ''}
                    </p>
                  )}
                  {item.state === 'open' && (
                    <label className="mt-2 block max-w-md text-xs">
                      <span className="sr-only">{t('sob.setup.note')}</span>
                      <input
                        className="input w-full"
                        placeholder={t('sob.setup.note')}
                        maxLength={500}
                        value={notes[item.id] ?? ''}
                        onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })}
                      />
                    </label>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.link && (
                      <Link to={item.link} className="btn-secondary btn-sm">
                        {t('sob.setup.go')} <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    )}
                    {item.externalUrl && (
                      <a href={item.externalUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
                        {t('sob.setup.source')} <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    )}
                    {item.state === 'open' && item.kind === 'manual' && (
                      <button type="button" className="btn-primary btn-sm" disabled={mark.isPending} onClick={() => mark.mutate({ id: item.id, state: 'done' })}>
                        {t('sob.setup.markDone')}
                      </button>
                    )}
                    {item.state === 'open' && (
                      <button type="button" className="btn-ghost btn-sm" disabled={mark.isPending} onClick={() => mark.mutate({ id: item.id, state: 'notNeeded' })}>
                        {t('sob.setup.notNeeded')}
                      </button>
                    )}
                    {item.mark && (
                      <button type="button" className="btn-ghost btn-sm" disabled={mark.isPending} onClick={() => mark.mutate({ id: item.id, state: null })}>
                        {t('sob.setup.undo')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
