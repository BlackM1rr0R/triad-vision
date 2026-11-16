import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, Check, FileDown, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import i18n, { registerCopy } from '@/i18n';
import { pagesPartnerSchools } from '@/i18n/pagesPartnerSchools';
import { usePageTitle } from '@/lib/usePageTitle';
import { TONE_CLASS } from '@/components/ui/status';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { fmtDate } from '@/components/admin/labels';
import { downloadFile } from '@/components/partnerPortal/api';
import { PARTNERS_KEY } from '@/components/partners/api';

registerCopy(pagesPartnerSchools);

type Category = 'AGENCY' | 'SCHOOL' | 'LANGUAGE_SCHOOL';
type RecordStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';
const CATEGORIES: Category[] = ['AGENCY', 'SCHOOL', 'LANGUAGE_SCHOOL'];
const STATUSES: RecordStatus[] = ['PENDING', 'CONFIRMED', 'REJECTED'];
const STATUS_TONE: Record<RecordStatus, string> = { PENDING: TONE_CLASS.warning, CONFIRMED: TONE_CLASS.success, REJECTED: TONE_CLASS.danger };

interface PartnerRow {
  id: string;
  name: string;
  category: Category;
  active: boolean;
  city: string | null;
  pendingRecords: number;
}
interface QueueRow {
  id: string;
  kind: 'ATTENDANCE' | 'EXAM';
  courseName: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  attendancePct: number | null;
  level: string | null;
  examDate: string | null;
  provider: string | null;
  passed: boolean | null;
  note: string | null;
  certificate: { name: string | null } | null;
  status: RecordStatus;
  reviewNote: string | null;
  levelApplied: string | null;
  createdAt: string;
  partner: { id: string; name: string };
  client: { id: string; firstName: string; lastName: string; germanLevel: string | null };
}

const KEY = ['admin-partner-schools'];

const errText = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`partnerSchools.errors.${code}`) ? i18n.t(`partnerSchools.errors.${code}`) : i18n.t('partnerSchools.errors.STUDENT_NOT_FOUND');
};

const Categories = ({ isAdmin }: { isAdmin: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: [...KEY, 'partners'], queryFn: async () => (await api.get<{ items: PartnerRow[] }>('/admin/partner-schools/partners')).data });
  const save = useMutation({
    mutationFn: async (v: { id: string; category: Category }) => (await api.patch(`/admin/partner-schools/partners/${v.id}/category`, { category: v.category })).data,
    onSuccess: async () => {
      toast.success(t('partnerSchools.admin.saved'));
      await qc.invalidateQueries({ queryKey: KEY });
      await qc.invalidateQueries({ queryKey: PARTNERS_KEY });
    },
    onError: (e) => toast.error(errText(e)),
  });
  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  const items = data?.items ?? [];
  return (
    <Panel title={t('partnerSchools.admin.categoriesTitle')}>
      {!isAdmin && <p className="mb-3 text-sm text-muted">{t('partnerSchools.admin.categoriesHint')}</p>}
      <ul className="divide-y divide-line">
        {items.map((p) => (
          <li key={p.id} className={clsx('flex flex-wrap items-center gap-3 py-2', !p.active && 'opacity-70')}>
            <Link to={`/admin/partners/${p.id}`} className="min-w-0 flex-1 truncate font-semibold text-ink hover:text-link">
              {p.name}
              {p.city ? <span className="ml-2 text-xs font-normal text-muted">{p.city}</span> : null}
            </Link>
            {p.pendingRecords > 0 && <span className={clsx('badge', TONE_CLASS.warning)}>{`${t('partnerSchools.admin.pendingCol')}: ${p.pendingRecords}`}</span>}
            <label className="sr-only" htmlFor={`cat-${p.id}`}>
              {t('partnerSchools.admin.partner')}: {p.name}
            </label>
            <select
              id={`cat-${p.id}`}
              className="input !w-auto min-w-48"
              value={p.category}
              disabled={!isAdmin || save.isPending}
              onChange={(e) => save.mutate({ id: p.id, category: e.target.value as Category })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`partnerSchools.admin.category.${c}`)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </Panel>
  );
};

const QueueItem = ({ r }: { r: QueueRow }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const done = async () => {
    await qc.invalidateQueries({ queryKey: KEY });
  };
  const confirm = useMutation({
    mutationFn: async () => (await api.post<{ levelBefore: string | null; levelApplied: string | null }>(`/admin/partner-schools/records/${r.id}/confirm`, {})).data,
    onSuccess: async (d) => {
      toast.success(d.levelApplied ? t('partnerSchools.admin.levelRaised', { from: d.levelBefore ?? '—', to: d.levelApplied }) : t('partnerSchools.admin.confirmed'));
      await done();
    },
    onError: (e) => toast.error(errText(e)),
  });
  const reject = useMutation({
    mutationFn: async () => (await api.post(`/admin/partner-schools/records/${r.id}/reject`, { note: note.trim() })).data,
    onSuccess: async () => {
      toast.success(t('partnerSchools.admin.rejected'));
      await done();
    },
    onError: (e) => toast.error(errText(e)),
  });
  const detail =
    r.kind === 'EXAM'
      ? [r.level, r.provider ? t(`partnerSchools.providers.${r.provider}`) : null, r.examDate ? fmtDate(r.examDate) : null, r.passed == null ? null : r.passed ? t('partnerSchools.passedYes') : t('partnerSchools.passedNo')]
      : [`${r.attendancePct ?? 0}%`, r.courseName, r.periodFrom || r.periodTo ? `${r.periodFrom ? fmtDate(r.periodFrom) : '…'} – ${r.periodTo ? fmtDate(r.periodTo) : '…'}` : null];
  return (
    <li className="rounded-xl border border-line bg-card p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">
            {r.client.firstName} {r.client.lastName} <span className="font-normal text-muted">· {r.partner.name}</span>
          </p>
          <p className="text-sm text-ink">
            <span className="font-semibold">{t(`partnerSchools.kind.${r.kind}`)}</span>: {detail.filter(Boolean).join(' · ')}
          </p>
          <p className="text-xs text-muted">
            {t('partnerSchools.admin.currentLevel', { level: r.client.germanLevel ?? '—' })} · {fmtDate(r.createdAt)}
          </p>
          {r.note && <p className="mt-1 text-sm text-muted">{r.note}</p>}
          {r.reviewNote && r.status !== 'PENDING' && <p className="mt-1 text-xs text-muted">{t('partnerSchools.reviewNote', { note: r.reviewNote })}</p>}
        </div>
        <span className={clsx('badge', STATUS_TONE[r.status])}>{t(`partnerSchools.status.${r.status}`)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {r.certificate && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => downloadFile(`/admin/partner-schools/records/${r.id}/certificate`, r.certificate?.name ?? 'certificate').catch((e) => toast.error(errText(e)))}>
            <FileDown className="size-4" aria-hidden /> {t('partnerSchools.form.certificateLink')}
          </button>
        )}
        {r.status === 'PENDING' && !rejecting && (
          <>
            <button type="button" className="btn-primary btn-sm" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
              <Check className="size-4" aria-hidden /> {t('partnerSchools.admin.confirm')}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setRejecting(true)}>
              <X className="size-4" aria-hidden /> {t('partnerSchools.admin.reject')}
            </button>
          </>
        )}
      </div>
      {rejecting && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim()) reject.mutate();
          }}
        >
          <label className="block min-w-60 flex-1" htmlFor={`rej-${r.id}`}>
            <span className="label">{t('partnerSchools.admin.rejectNote')}</span>
            <input id={`rej-${r.id}`} className="input" required maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="submit" className="btn-danger btn-sm" disabled={reject.isPending || !note.trim()}>
            {t('partnerSchools.admin.reject')}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setRejecting(false)}>
            {t('partnerSchools.close')}
          </button>
        </form>
      )}
    </li>
  );
};

const Queue = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<RecordStatus | ''>('PENDING');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...KEY, 'records', status],
    queryFn: async () => (await api.get<{ items: QueueRow[]; counts: Partial<Record<RecordStatus, number>> }>('/admin/partner-schools/records', { params: { status: status || undefined } })).data,
  });
  return (
    <Panel title={t('partnerSchools.admin.queueTitle')}>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t('partnerSchools.admin.filter')}>
        {(['', ...STATUSES] as const).map((s) => (
          <button key={s || 'all'} type="button" className={clsx('btn-sm', status === s ? 'btn-primary' : 'btn-secondary')} aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s ? `${t(`partnerSchools.status.${s}`)} (${data?.counts?.[s] ?? 0})` : t('partnerSchools.admin.all')}
          </button>
        ))}
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState title={t('partnerSchools.admin.empty')} />
      ) : (
        <ul className="grid gap-2">
          {data.items.map((r) => (
            <QueueItem key={r.id} r={r} />
          ))}
        </ul>
      )}
    </Panel>
  );
};

/** /admin/partners/schools — partner categories (ADMIN+ edit) and the language-school records review queue. */
export const PartnerSchoolsAdmin = ({ isAdmin }: { isAdmin: boolean }) => {
  const { t } = useTranslation();
  usePageTitle(t('partnerSchools.admin.title'));
  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/partners" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-link hover:text-link">
          <ArrowLeft className="size-3.5" /> {t('partnerSchools.admin.back')}
        </Link>
        <PageHead title={t('partnerSchools.admin.title')} subtitle={t('partnerSchools.admin.subtitle')} />
      </div>
      <Queue />
      <Categories isAdmin={isAdmin} />
    </div>
  );
};
