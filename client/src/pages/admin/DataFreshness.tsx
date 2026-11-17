import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CheckCircle2, Copy, ExternalLink, FileCode2, History } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesDataFreshness } from '@/i18n/pagesDataFreshness';
import { PageHeader } from '@/components/ui/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { toastJobsError } from '@/components/jobs/labels';

registerCopy(pagesDataFreshness);

/** Shapes of GET /api/admin/data-freshness (server/src/lib/dataFreshness/service.ts → listFreshness). */
type Status = 'ok' | 'dueSoon' | 'overdue' | 'done';
type Category = 'wage' | 'tax' | 'social' | 'household' | 'residence' | 'fees' | 'health' | 'content' | 'calendar';
interface Item {
  id: string;
  category: Category;
  label: { az: string; en: string };
  value: string;
  files: { path: string; needle?: string }[];
  fileUrls: string[];
  grep?: string;
  source: { label: string; url: string };
  reviewBy: string;
  cadence: 'yearly' | 'halfYearly' | 'once';
  upcoming?: { value: string; from: string; status: 'enacted' | 'decided' | 'proposed' | 'expected'; implemented: boolean };
  note: { az: string; en: string };
  due: string | null;
  status: Status;
  reviews: number;
  lastReview: { at: string; by: string; note: string | null } | null;
}
interface Overview {
  today: string;
  items: Item[];
}
interface Review {
  at: string;
  by: string;
  note: string | null;
  settledDue: string | null;
  nextDue: string | null;
}

const QK = ['admin-data-freshness'];
const STATUS_ORDER: Record<Status, number> = { overdue: 0, dueSoon: 1, ok: 2, done: 3 };
const STATUS_CLASS: Record<Status, string> = {
  overdue: 'bg-danger-bg text-danger-fg',
  dueSoon: 'bg-warning-bg text-warning-fg',
  ok: 'bg-success-bg text-success-fg',
  done: 'bg-neutral-bg text-neutral-fg',
};
const CATEGORIES: Category[] = ['wage', 'tax', 'social', 'household', 'residence', 'fees', 'health', 'content', 'calendar'];

/**
 * Admin → Site → Data freshness (/admin/data-freshness, ADMIN+): every time-sensitive figure of the site with its
 * files, official source and next review date; status ok / due within 30 days / overdue; "Reviewed" stores
 * reviewer + date + note. The daily job reminds admins (lib/dataFreshness/service.ts).
 */
export default function AdminDataFreshness() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('dataFreshness.title'));
  const qc = useQueryClient();
  const q = useQuery({ queryKey: QK, queryFn: async () => (await api.get<Overview>('/admin/data-freshness')).data });
  const [status, setStatus] = useState<Status | ''>('');
  const [category, setCategory] = useState<Category | ''>('');
  const [search, setSearch] = useState('');
  const lang: 'az' | 'en' = i18n.language === 'az' ? 'az' : 'en';

  const items = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.items ?? [])
      .filter((i) => (!status || i.status === status) && (!category || i.category === category))
      .filter((i) => !s || [i.id, i.label.az, i.label.en, i.value, ...i.files.map((f) => f.path)].some((x) => x.toLowerCase().includes(s)))
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  }, [q.data, status, category, search]);

  const counts = useMemo(() => {
    const c = { overdue: 0, dueSoon: 0, ok: 0 };
    for (const i of q.data?.items ?? []) if (i.status !== 'done') c[i.status] += 1;
    return c;
  }, [q.data]);

  return (
    <div>
      <PageHeader title={t('dataFreshness.title')} subtitle={t('dataFreshness.subtitle')} />
      {q.isLoading ? (
        <Spinner />
      ) : q.isError || !q.data ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted" aria-live="polite">
            {t('dataFreshness.summary', { overdue: counts.overdue, soon: counts.dueSoon, ok: counts.ok })}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted">{t('dataFreshness.filters.status')}</span>
              <select className="input w-44" value={status} onChange={(e) => setStatus(e.target.value as Status | '')}>
                <option value="">{t('dataFreshness.filters.all')}</option>
                {(['overdue', 'dueSoon', 'ok', 'done'] as Status[]).map((s) => (
                  <option key={s} value={s}>
                    {t(`dataFreshness.status.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted">{t('dataFreshness.filters.category')}</span>
              <select className="input w-48" value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
                <option value="">{t('dataFreshness.filters.all')}</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`dataFreshness.category.${c}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[12rem] flex-1 text-sm">
              <span className="mb-1 block text-xs text-muted">{t('dataFreshness.filters.search')}</span>
              <input className="input w-full" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted">{t('dataFreshness.empty')}</p>
          ) : (
            <ul className="space-y-3">
              {items.map((i) => (
                <ItemCard key={i.id} item={i} lang={lang} onChanged={() => void qc.invalidateQueries({ queryKey: QK })} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ItemCard({ item: i, lang, onChanged }: { item: Item; lang: 'az' | 'en'; onChanged: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const review = useMutation({
    mutationFn: async () => (await api.post<{ nextDue: string | null }>(`/admin/data-freshness/${i.id}/review`, { note: note.trim() || null })).data,
    onSuccess: (r) => {
      toast.success(r.nextDue ? t('dataFreshness.saved', { due: r.nextDue }) : t('dataFreshness.savedDone'));
      setOpen(false);
      setNote('');
      onChanged();
    },
    onError: toastJobsError,
  });
  const history = useQuery({
    queryKey: ['admin-data-freshness', i.id, 'reviews', i.reviews],
    enabled: showHistory,
    queryFn: async () => (await api.get<{ reviews: Review[] }>(`/admin/data-freshness/${i.id}/reviews`)).data.reviews,
  });
  const copy = (p: string) => {
    void navigator.clipboard?.writeText(p).then(() => toast.success(t('dataFreshness.copied')));
  };
  const noteId = `df-note-${i.id}`;

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-ink">{i.label[lang]}</h2>
          <p className="text-xs text-muted">
            {t(`dataFreshness.category.${i.category}`)} · {t(`dataFreshness.cadence.${i.cadence}`)} · <code>{i.id}</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx('badge', STATUS_CLASS[i.status])}>{t(`dataFreshness.status.${i.status}`)}</span>
          <span className="text-sm text-ink">
            {t('dataFreshness.due')}: <strong>{i.due ?? t('dataFreshness.noDue')}</strong>
          </span>
        </div>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted">{t('dataFreshness.value')}</dt>
        <dd className="text-ink">
          {i.value}
          {i.upcoming && (
            <span className="mt-0.5 block text-xs text-muted">
              {t('dataFreshness.upcoming', { value: i.upcoming.value, from: i.upcoming.from, status: t(`dataFreshness.upcomingStatus.${i.upcoming.status}`) })}
              {i.upcoming.implemented && <> · {t('dataFreshness.upcomingImplemented')}</>}
            </span>
          )}
        </dd>
        <dt className="text-muted">{t('dataFreshness.source')}</dt>
        <dd>
          <a href={i.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link underline">
            {i.source.label} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </dd>
        <dt className="text-muted">{t('dataFreshness.files')}</dt>
        <dd className="space-y-1">
          {i.files.map((f, k) => (
            <div key={`${f.path}-${k}`} className="flex flex-wrap items-center gap-2">
              <a href={i.fileUrls[k]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-link underline">
                <FileCode2 className="size-3.5 shrink-0" aria-hidden /> {f.path}
              </a>
              <button type="button" className="text-muted hover:text-ink" onClick={() => copy(f.path)} aria-label={`${t('dataFreshness.copyPath')}: ${f.path}`}>
                <Copy className="size-3.5" aria-hidden />
              </button>
              {f.needle && <code className="rounded bg-sunken px-1 text-xs text-muted">{f.needle}</code>}
            </div>
          ))}
          {i.grep && (
            <p className="text-xs text-muted">
              {t('dataFreshness.grep')}: <code className="rounded bg-sunken px-1">{i.grep}</code>
            </p>
          )}
        </dd>
        <dt className="text-muted">{t('dataFreshness.note')}</dt>
        <dd className="text-muted">{i.note[lang]}</dd>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-sm">
        <span className="text-muted">
          {i.lastReview ? t('dataFreshness.lastReview', { date: new Date(i.lastReview.at).toLocaleDateString(), by: i.lastReview.by }) : t('dataFreshness.never')}
          {i.lastReview?.note && <> — „{i.lastReview.note}“</>}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {i.reviews > 0 && (
            <button type="button" className="btn-secondary btn-sm" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
              <History className="size-4" aria-hidden /> {t('dataFreshness.history', { n: i.reviews })}
            </button>
          )}
          {!open && (
            <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}>
              <CheckCircle2 className="size-4" aria-hidden /> {t('dataFreshness.markReviewed')}
            </button>
          )}
        </div>
      </div>

      {open && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            review.mutate();
          }}
        >
          <label htmlFor={noteId} className="block text-xs text-muted">
            {t('dataFreshness.note')}
          </label>
          <textarea id={noteId} className="input w-full" rows={2} maxLength={1000} value={note} placeholder={t('dataFreshness.notePlaceholder')} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary btn-sm" disabled={review.isPending}>
              {review.isPending && <Spinner className="size-3.5" />} {t('dataFreshness.save')}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
              {t('dataFreshness.cancel')}
            </button>
          </div>
        </form>
      )}

      {showHistory && (
        <div className="mt-3">
          {history.isLoading ? (
            <Spinner />
          ) : (
            <ul className="space-y-1 text-xs text-muted">
              {(history.data ?? []).map((r) => (
                <li key={r.at}>
                  {new Date(r.at).toLocaleString()} · {r.by}
                  {r.settledDue && <> · {r.settledDue} → {r.nextDue ?? '—'}</>}
                  {r.note && <> — {r.note}</>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
