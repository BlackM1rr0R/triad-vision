import { useMemo, useState } from 'react';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check, Clock, Eye, EyeOff, MailPlus, MessageSquareHeart, Pencil, Search, Send, Star, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { ToneBadge } from '@/components/admin/StatusBadge';
import { fmtDate, fmtDateTime, fullName, toastError } from '@/components/admin/labels';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, StatTile } from '@/components/admin/ui';
import { registerCopy } from '@/i18n';
import { pagesGrowth } from '@/i18n/pagesGrowth';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesGrowth);

type ReviewStatus = 'REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
const STATUSES: ReviewStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'REQUESTED'];
const STATUS_TONE: Record<ReviewStatus, string> = toneClasses(STATUS_TONES.review);

interface AdminReview {
  id: string;
  caseId: string;
  status: ReviewStatus;
  rating: number | null;
  text: string | null;
  displayName: string | null;
  consentPublish: boolean;
  locale: string;
  createdAt: string;
  submittedAt: string | null;
  inviteExpired: boolean;
  user: { id: string; firstName: string; lastName: string; email: string };
  case: { id: string; number: string; profession: string; decisionAt: string | null } | null;
}
interface ReviewsResponse {
  items: AdminReview[];
  summary: { byStatus: Partial<Record<ReviewStatus, number>>; approvedAverage: number | null; approvedCount: number };
}
interface Candidate {
  id: string;
  number: string;
  profession: string;
  decisionAt: string | null;
  client: { firstName: string; lastName: string };
}

const KEY = ['admin-reviews'];

const Stars = ({ value }: { value: number }) => (
  <span className="inline-flex gap-0.5" aria-label={`${value} / 5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} className={clsx('size-4', n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} aria-hidden />
    ))}
  </span>
);

const ReviewCard = ({ r, canModerate }: { r: AdminReview; canModerate: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(r.displayName ?? '');
  const [text, setText] = useState(r.text ?? '');

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.patch(`/admin/reviews/${r.id}`, body)).data,
    onSuccess: () => {
      toast.success(t('growth.adminReviews.saved'));
      setEditing(false);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toastError(err),
  });
  const resend = useMutation({
    mutationFn: async () => (await api.post(`/admin/reviews/${r.id}/resend`)).data,
    onSuccess: () => {
      toast.success(t('growth.adminReviews.resent'));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toastError(err),
  });
  const busy = patch.isPending || resend.isPending;
  const isPublic = r.status === 'APPROVED' && r.consentPublish;
  const editValid = name.trim().length >= 2 && name.trim().length <= 80 && text.trim().length >= 20 && text.trim().length <= 1500;

  return (
    <li className="rounded-xl border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {r.rating ? <Stars value={r.rating} /> : null}
            <ToneBadge tone={STATUS_TONE[r.status]}>{t(`growth.adminReviews.status.${r.status}`)}</ToneBadge>
            {r.status !== 'REQUESTED' &&
              (r.consentPublish ? (
                <ToneBadge tone="bg-brand-50 text-brand-700">
                  <Eye className="size-3" aria-hidden /> {t('growth.adminReviews.consentYes')}
                </ToneBadge>
              ) : (
                <ToneBadge tone="bg-slate-100 text-slate-600">
                  <EyeOff className="size-3" aria-hidden /> {t('growth.adminReviews.consentNo')}
                </ToneBadge>
              ))}
            {isPublic && <ToneBadge tone="bg-emerald-50 text-emerald-700">{t('growth.adminReviews.public')}</ToneBadge>}
            {r.inviteExpired && <ToneBadge tone="bg-red-50 text-red-700">{t('growth.adminReviews.expired')}</ToneBadge>}
          </div>
          <p className="mt-2 text-sm font-semibold text-navy-900">
            {fullName(r.user)} <span className="font-normal text-muted">· {r.user.email}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {r.case && (
              <>
                <Link to={`/admin/cases/${r.case.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                  {r.case.number}
                </Link>{' '}
                · {r.case.profession} ·{' '}
              </>
            )}
            {r.submittedAt ? t('growth.adminReviews.submittedAt', { date: fmtDateTime(r.submittedAt) }) : t('growth.adminReviews.invitedAt', { date: fmtDate(r.createdAt) })}
            {' · '}
            {r.locale.toUpperCase()}
          </p>
        </div>
        {canModerate && (
          <div className="flex flex-wrap gap-2">
            {r.status === 'REQUESTED' ? (
              <button type="button" className="btn-secondary btn-sm" onClick={() => resend.mutate()} disabled={busy}>
                {resend.isPending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" aria-hidden />} {t('growth.adminReviews.resend')}
              </button>
            ) : (
              !editing && (
                <>
                  {r.status !== 'APPROVED' && (
                    <button type="button" className="btn-sm inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 font-semibold text-white hover:bg-emerald-700" onClick={() => patch.mutate({ status: 'APPROVED' })} disabled={busy}>
                      <Check className="size-3.5" aria-hidden /> {t('growth.adminReviews.approve')}
                    </button>
                  )}
                  {r.status !== 'REJECTED' && (
                    <button type="button" className="btn-secondary btn-sm text-danger" onClick={() => patch.mutate({ status: 'REJECTED' })} disabled={busy}>
                      <X className="size-3.5" aria-hidden /> {t('growth.adminReviews.reject')}
                    </button>
                  )}
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(true)} disabled={busy}>
                    <Pencil className="size-3.5" aria-hidden /> {t('growth.adminReviews.edit')}
                  </button>
                </>
              )
            )}
          </div>
        )}
      </div>

      {r.status === 'REQUESTED' ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
          <Clock className="size-4" aria-hidden /> {t('growth.adminReviews.notAnswered')}
        </p>
      ) : editing ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (editValid) patch.mutate({ displayName: name.trim(), text: text.trim() });
          }}
        >
          <div>
            <label className="label" htmlFor={`rv-name-${r.id}`}>
              {t('growth.adminReviews.displayName')}
            </label>
            <input id={`rv-name-${r.id}`} className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={`rv-text-${r.id}`}>
              {t('growth.adminReviews.text')}
            </label>
            <textarea id={`rv-text-${r.id}`} className="input min-h-32 resize-y" value={text} maxLength={1500} onChange={(e) => setText(e.target.value)} />
            <p className="mt-1 text-right text-xs text-muted tabular-nums">{text.trim().length} / 1500</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                setEditing(false);
                setName(r.displayName ?? '');
                setText(r.text ?? '');
              }}
            >
              {t('growth.adminReviews.cancel')}
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={!editValid || busy}>
              {patch.isPending && <Spinner className="size-3.5" />} {t('growth.adminReviews.save')}
            </button>
          </div>
        </form>
      ) : (
        <figure className="mt-3 rounded-lg bg-surface p-3.5">
          <blockquote className="text-sm leading-relaxed whitespace-pre-line text-ink">{r.text}</blockquote>
          <figcaption className="mt-2 text-xs font-semibold text-navy-900">— {r.displayName}</figcaption>
        </figure>
      )}
    </li>
  );
};

const Candidates = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: [...KEY, 'candidates'],
    queryFn: async () => (await api.get<{ items: Candidate[] }>('/admin/reviews/candidates')).data,
  });
  const invite = useMutation({
    mutationFn: async (caseId: string) => (await api.post('/admin/reviews/invite', { caseId })).data,
    onSuccess: () => {
      toast.success(t('growth.adminReviews.resent'));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toastError(err),
  });
  if (!data?.items.length) return null;
  return (
    <Panel title={t('growth.adminReviews.candidates')} icon={MailPlus}>
      <p className="-mt-1 mb-4 text-sm text-muted">{t('growth.adminReviews.candidatesHint')}</p>
      <ul className="divide-y divide-line">
        {data.items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <span className="min-w-0 text-sm">
              <Link to={`/admin/cases/${c.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                {c.number}
              </Link>{' '}
              <span className="text-navy-900">{fullName(c.client)}</span> <span className="text-muted">· {c.profession} · {fmtDate(c.decisionAt)}</span>
            </span>
            <button type="button" className="btn-secondary btn-sm" onClick={() => invite.mutate(c.id)} disabled={invite.isPending}>
              <Send className="size-3.5" aria-hidden /> {t('growth.adminReviews.invite')}
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
};

export default function AdminReviews() {
  const { t } = useTranslation();
  usePageTitle(t('growth.adminReviews.title'));
  const { user } = useAuth();
  const canModerate = hasMinRole(user?.role, 'ADMIN');
  const [status, setStatus] = useState<ReviewStatus | 'ALL'>('PENDING');
  const [q, setQ] = useState('');

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: [...KEY, 'list'],
    queryFn: async () => (await api.get<ReviewsResponse>('/admin/reviews')).data,
    placeholderData: keepPreviousData,
  });

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.items ?? []).filter(
      (r) =>
        (status === 'ALL' || r.status === status) &&
        (!s || [fullName(r.user), r.user.email, r.displayName ?? '', r.text ?? '', r.case?.number ?? ''].some((v) => v.toLowerCase().includes(s))),
    );
  }, [data, status, q]);

  const by = data?.summary.byStatus ?? {};
  const total = Object.values(by).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div>
      <PageHead title={t('growth.adminReviews.title')} subtitle={t('growth.adminReviews.subtitle')} actions={isFetching && !isLoading ? <Spinner className="size-4 text-brand-600" /> : undefined} />

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label={t('growth.adminReviews.tiles.average')} value={data?.summary.approvedAverage?.toFixed(1) ?? '—'} icon={Star} />
            <StatTile label={t('growth.adminReviews.tiles.pending')} value={by.PENDING ?? 0} tone={(by.PENDING ?? 0) > 0 ? 'warn' : undefined} icon={MessageSquareHeart} />
            <StatTile label={t('growth.adminReviews.tiles.requested')} value={by.REQUESTED ?? 0} icon={Clock} />
            <StatTile label={t('growth.adminReviews.tiles.approved')} value={by.APPROVED ?? 0} tone="good" icon={Check} />
          </div>

          {!canModerate && <p className="rounded-lg bg-surface px-4 py-3 text-sm text-muted">{t('growth.adminReviews.readOnly')}</p>}

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
              <Chip active={status === 'ALL'} onClick={() => setStatus('ALL')} count={total}>
                {t('growth.adminReviews.all')}
              </Chip>
              {STATUSES.map((s) => (
                <Chip key={s} active={status === s} onClick={() => setStatus(s)} count={by[s] ?? 0}>
                  {t(`growth.adminReviews.status.${s}`)}
                </Chip>
              ))}
            </div>
            <label className="relative block w-full lg:w-72">
              <span className="sr-only">{t('growth.adminReviews.search')}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('growth.adminReviews.search')} />
            </label>
          </div>

          {items.length === 0 ? (
            <Panel>
              <EmptyState icon={MessageSquareHeart} title={t('growth.adminReviews.empty')}>
                {t('growth.adminReviews.emptyHint')}
              </EmptyState>
            </Panel>
          ) : (
            <ul className="space-y-3">
              {items.map((r) => (
                <ReviewCard key={`${r.id}:${r.status}:${r.displayName}:${r.text?.length}`} r={r} canModerate={canModerate} />
              ))}
            </ul>
          )}

          {canModerate && <Candidates />}
        </div>
      )}
    </div>
  );
}
