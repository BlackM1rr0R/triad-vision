import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Check, ChevronDown, Compass, ExternalLink, PartyPopper, Sparkles, StickyNote, Undo2 } from 'lucide-react';
import { api } from '@/lib/api';
import { optimistic } from '@/lib/optimistic';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesJourney } from '@/i18n/pagesJourney';
import { Icon, hasIcon } from '@/components/ui/Icon';
import { PageLoader } from '@/components/ui/Spinner';
import { ProgressRing } from '@/components/portal/ProgressRing';
import { useApiError } from '@/components/portal/useApiError';
import { daysUntil, ONBOARDING_KEY, useOnboarding } from '@/components/journey/api';
import type { OnboardingProgress, OnboardingResponse, OnboardingRow } from '@/components/journey/types';

registerCopy(pagesJourney);

const DueHint = ({ row }: { row: OnboardingRow }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  if (row.done) return row.doneAt ? <span className="text-success">{t('journey.onboarding.doneAt', { date: date(row.doneAt) })}</span> : null;
  if (!row.dueAt) return row.dueDays !== null ? <span>{t('journey.onboarding.within', { count: row.dueDays })}</span> : null;
  const days = daysUntil(row.dueAt);
  return (
    <span className={clsx(days < 0 ? 'font-semibold text-danger' : days <= 3 ? 'font-semibold text-amber-700' : '')}>
      {t('journey.onboarding.due', { date: date(row.dueAt) })} ·{' '}
      {days < 0 ? t('journey.onboarding.overdue', { count: -days }) : days === 0 ? t('journey.onboarding.dueToday') : t('journey.onboarding.dueIn', { count: days })}
    </span>
  );
};

const ItemCard = ({ row, index, canEdit, defaultOpen }: { row: OnboardingRow; index: number; canEdit: boolean; defaultOpen: boolean }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const apiError = useApiError();
  const [open, setOpen] = useState(defaultOpen);
  const [note, setNote] = useState(row.note ?? '');
  const [editingNote, setEditingNote] = useState(false);

  const mutation = useMutation({
    mutationFn: async (body: { done: boolean; note?: string | null }) =>
      (await api.put<{ item: { id: string; done: boolean; doneAt: string | null; note: string | null }; progress: OnboardingProgress }>(`/journey/onboarding/${row.id}`, body)).data,
    // Optimistic tick: the check, strike-through and progress move at once; the server's values replace
    // them on success, a failure restores the previous state (with the error toast).
    ...optimistic<OnboardingResponse, { done: boolean; note?: string | null }>(qc, {
      key: ONBOARDING_KEY,
      update: (old, body) => {
        if (!old) return old;
        const items = old.items.map((i) =>
          i.id === row.id ? { ...i, done: body.done, doneAt: body.done ? (i.doneAt ?? new Date().toISOString()) : null, ...(body.note !== undefined ? { note: body.note } : {}) } : i,
        );
        const done = items.filter((i) => i.done).length;
        const progress = old.progress ? { ...old.progress, done, percent: old.progress.total ? Math.round((done / old.progress.total) * 100) : old.progress.percent } : old.progress;
        return { ...old, items, progress };
      },
      onError: (err) => apiError(err),
      keepOnSuccess: true,
    }),
    onSuccess: (res) => {
      qc.setQueryData<OnboardingResponse>(ONBOARDING_KEY, (old) =>
        old ? { ...old, progress: res.progress, items: old.items.map((i) => (i.id === row.id ? { ...i, done: res.item.done, doneAt: res.item.doneAt, note: res.item.note } : i)) } : old,
      );
    },
  });

  const paragraphs = tr(row.body)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const panelId = `onb-${row.id}`;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.3), ease: [0.22, 1, 0.36, 1] }}
      className={clsx('card overflow-hidden transition-colors', row.done && 'border-success/30 bg-emerald-50/30')}
    >
      <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
        {canEdit ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={row.done}
            aria-label={`${tr(row.title)}: ${row.done ? t('journey.onboarding.undo') : t('journey.onboarding.markDone')}`}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ done: !row.done })}
            className={clsx(
              'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 transition',
              row.done ? 'border-success bg-success text-white' : 'border-line bg-white text-transparent hover:border-brand-500',
            )}
          >
            <Check className="size-4" strokeWidth={3} />
          </button>
        ) : (
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 border-dashed border-line text-muted" aria-hidden>
            {index + 1}
          </span>
        )}
        <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', row.done ? 'bg-success/10 text-success' : 'bg-brand-50 text-brand-700')}>
          {hasIcon(row.icon) ? <Icon name={row.icon} className="size-5" aria-hidden /> : <Compass className="size-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="flex w-full items-start justify-between gap-3 text-left"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="min-w-0">
              <span className={clsx('block font-semibold break-words text-navy-900', row.done && 'line-through decoration-success/60')}>{tr(row.title)}</span>
              <span className="mt-0.5 block text-xs text-muted">
                <DueHint row={row} />
              </span>
            </span>
            <ChevronDown className={clsx('mt-1 size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div id={panelId} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                <div className="space-y-3 pt-3 text-sm leading-relaxed text-ink/85">
                  {paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                  {row.link && (
                    <a href={row.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:text-brand-700">
                      <ExternalLink className="size-3.5" aria-hidden />
                      {t('journey.onboarding.official')}
                    </a>
                  )}
                  {canEdit && (
                    <div className="rounded-xl bg-surface p-3">
                      <label htmlFor={`${panelId}-note`} className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                        <StickyNote className="size-3.5" aria-hidden />
                        {t('journey.onboarding.note')}
                      </label>
                      {editingNote || !row.note ? (
                        <>
                          <textarea
                            id={`${panelId}-note`}
                            className="input mt-1.5 text-sm"
                            rows={2}
                            maxLength={1000}
                            value={note}
                            placeholder={t('journey.onboarding.notePlaceholder')}
                            onChange={(e) => setNote(e.target.value)}
                          />
                          {(note.trim() !== (row.note ?? '')) && (
                            <button
                              type="button"
                              className="btn-primary btn-sm mt-2"
                              disabled={mutation.isPending}
                              onClick={() =>
                                mutation.mutate({ done: row.done, note: note.trim() || null }, { onSuccess: () => { setEditingNote(false); toast.success(t('journey.onboarding.noteSaved')); } })
                              }
                            >
                              {t('journey.onboarding.saveNote')}
                            </button>
                          )}
                        </>
                      ) : (
                        <button type="button" className="mt-1 block w-full text-left text-sm whitespace-pre-line text-navy-900 hover:text-brand-700" onClick={() => setEditingNote(true)}>
                          {row.note}
                        </button>
                      )}
                    </div>
                  )}
                  {canEdit && row.done && (
                    <button type="button" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-navy-900" onClick={() => mutation.mutate({ done: false })}>
                      <Undo2 className="size-3.5" aria-hidden /> {t('journey.onboarding.undo')}
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.li>
  );
};

export default function Onboarding() {
  const { t } = useTranslation();
  const { date } = useL10n();
  const { user } = useAuth();
  usePageTitle(t('journey.onboarding.title'));
  const { data, isLoading, isError } = useOnboarding(user?.role === 'CLIENT');

  if (isLoading) return <PageLoader />;
  if (isError || !data) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-warning" aria-hidden />
        <p className="mt-4 font-semibold text-navy-900">{t('common.error')}</p>
      </div>
    );
  }

  const active = !!data.case && !!data.progress;
  const allDone = active && data.progress!.total > 0 && data.progress!.done === data.progress!.total;
  const firstOpen = data.items.find((i) => !i.done)?.id;

  return (
    <div className="space-y-6">
      <section className={clsx('card relative overflow-hidden p-5 sm:p-7', active && 'bg-gradient-to-br from-navy-900 via-navy-800 to-brand-700 text-white')} aria-labelledby="onboarding-title">
        {active && <div className="pointer-events-none absolute -top-20 -right-16 size-64 rounded-full bg-[radial-gradient(closest-side,var(--color-brand-400),transparent)] opacity-25" aria-hidden />}
        <div className="relative flex items-start gap-4 sm:gap-6">
          <div className="min-w-0 flex-1">
            <span className={clsx('eyebrow', active ? 'text-brand-400' : '')}>
              <Compass className="size-4" aria-hidden />
              {t('journey.onboarding.caseLabel')} {data.case?.number}
            </span>
            <h1 id="onboarding-title" className={clsx('mt-2 text-2xl font-extrabold sm:text-3xl', active ? 'text-white' : 'text-navy-900')}>
              {t('journey.onboarding.title')}
            </h1>
            <p className={clsx('mt-1', active ? 'text-white/75' : 'text-muted')}>{t('journey.onboarding.subtitle')}</p>
            {active && data.baseDate && <p className="mt-3 text-xs text-white/60">{t('journey.onboarding.basedOn', { date: date(data.baseDate) })}</p>}
          </div>
          {active && (
            <ProgressRing percent={data.progress!.percent} size={84} stroke={7} tone="light" label={t('journey.onboarding.progress', { done: data.progress!.done, total: data.progress!.total })}>
              <span className="text-center leading-none">
                <span className="block font-display text-lg font-extrabold">{data.progress!.done}/{data.progress!.total}</span>
                <span className="mt-0.5 block text-[10px] font-semibold text-white/70">{t('journey.onboarding.markDone')}</span>
              </span>
            </ProgressRing>
          )}
        </div>
      </section>

      {!active && (
        <section className="card border-brand-200 bg-brand-50/50 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-navy-900">{t('journey.onboarding.empty.title')}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t('journey.onboarding.empty.body')}</p>
              <Link to="/account" className="btn-primary mt-4 min-h-10 px-4 py-2 text-sm">
                {t('journey.onboarding.empty.cta')}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>
      )}

      <AnimatePresence>
        {allDone && (
          <motion.section initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="card flex items-start gap-4 border-success/30 bg-emerald-50 p-5 sm:p-6" aria-live="polite">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-success text-white">
              <PartyPopper className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-bold text-emerald-900">{t('journey.onboarding.allDone')}</h2>
              <p className="mt-1 text-sm text-emerald-900/80">{t('journey.onboarding.allDoneBody')}</p>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {!active && data.items.length > 0 && <p className="eyebrow">{t('journey.onboarding.preview')}</p>}
      <ul className="space-y-3">
        {data.items.map((row, i) => (
          <ItemCard key={row.id} row={row} index={i} canEdit={active} defaultOpen={active && row.id === firstOpen} />
        ))}
      </ul>
    </div>
  );
}
