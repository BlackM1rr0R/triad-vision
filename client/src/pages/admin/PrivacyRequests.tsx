import { useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, ArrowLeft, Clock, Download, FileText, Inbox, ListChecks, Search, ShieldHalf, Trash2, UserRound } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesPrivacy } from '@/i18n/pagesPrivacy';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { Chip, DefRow, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, StatTile } from '@/components/admin/ui';
import { fmtDate, fmtDateTime, fullName } from '@/components/admin/labels';
import {
  CONSENT_TYPES,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  STATUS_TONE,
  isOpenStatus,
  type AdminRequestDetail,
  type AdminRequestsResponse,
  type ConsentLogResponse,
  type DeletionPreviewCounts,
  type RequestStatus,
} from '@/components/privacy/types';

registerCopy(pagesPrivacy);

const LIST_KEY = ['admin-privacy-requests'] as const;

const useAdminError = () => {
  const { t, i18n } = useTranslation();
  return (err: unknown) => {
    const code = errorCode(err);
    const key = i18n.exists(`privacy.admin.errors.${code}`) ? `privacy.admin.errors.${code}` : i18n.exists(`admin.errors.${code}`) ? `admin.errors.${code}` : 'privacy.errors.generic';
    toast.error(t(key));
  };
};

const StatusBadge = ({ status }: { status: RequestStatus }) => {
  const { t } = useTranslation();
  return <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', STATUS_TONE[status])}>{t(`privacy.status.${status}`)}</span>;
};

// ─── Requests list ─────────────────────────────────────────────────────

const RequestsList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const type = params.get('type') ?? '';
  const overdue = params.get('overdue') === '1';
  const [q, setQ] = useState('');

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (type) query.set('type', type);
  if (overdue) query.set('overdue', '1');
  if (q.trim()) query.set('q', q.trim());
  const qs = query.toString();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...LIST_KEY, qs],
    queryFn: async () => (await api.get<AdminRequestsResponse>(`/admin/privacy/requests${qs ? `?${qs}` : ''}`)).data,
    refetchInterval: 120_000,
  });
  const counts = data?.counts;

  return (
    <>
      {counts && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile label={t('privacy.admin.stats.open')} value={counts.byStatus.OPEN} icon={Inbox} />
          <StatTile label={t('privacy.admin.stats.inProgress')} value={counts.byStatus.IN_PROGRESS} icon={ListChecks} />
          <StatTile label={t('privacy.admin.stats.overdue')} value={counts.overdue} icon={AlertTriangle} tone={counts.overdue ? 'danger' : undefined} />
          <StatTile label={t('privacy.admin.stats.dueSoon')} value={counts.dueSoon} icon={Clock} tone={counts.dueSoon ? 'warn' : undefined} />
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">{t('privacy.admin.filters.search')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" className="input pl-9" placeholder={t('privacy.admin.filters.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select aria-label={t('privacy.admin.col.type')} className="input sm:w-52" value={type} onChange={(e) => setParam('type', e.target.value || null)}>
          <option value="">{t('privacy.admin.filters.allTypes')}</option>
          {REQUEST_TYPES.map((k) => (
            <option key={k} value={k}>
              {t(`privacy.typeName.${k}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={!status && !overdue} onClick={() => setParams(new URLSearchParams(type ? { type } : {}), { replace: true })}>
          {t('privacy.admin.filters.allStatuses')}
        </Chip>
        {REQUEST_STATUSES.map((s) => (
          <Chip key={s} active={status === s} onClick={() => setParam('status', status === s ? null : s)} count={counts?.byStatus[s]}>
            {t(`privacy.status.${s}`)}
          </Chip>
        ))}
        <Chip active={overdue} onClick={() => setParam('overdue', overdue ? null : '1')} count={counts?.overdue}>
          {t('privacy.admin.filters.overdue')}
        </Chip>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={ShieldHalf} title={t('privacy.admin.empty')} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="hidden bg-surface text-left text-xs text-muted sm:table-header-group">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t('privacy.admin.col.requester')}</th>
                <th className="px-4 py-2.5 font-medium">{t('privacy.admin.col.type')}</th>
                <th className="px-4 py-2.5 font-medium">{t('privacy.admin.col.status')}</th>
                <th className="px-4 py-2.5 font-medium">{t('privacy.admin.col.due')}</th>
                <th className="px-4 py-2.5 font-medium">{t('privacy.admin.col.created')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  role="link"
                  onClick={() => navigate(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(r.id);
                  }}
                  className={clsx('flex cursor-pointer flex-col gap-1 px-4 py-3 transition hover:bg-surface sm:table-row sm:p-0', r.overdue && 'bg-red-50/60 dark:bg-red-950/20')}
                >
                  <td className="sm:px-4 sm:py-3">
                    <p className="font-semibold break-all text-navy-900">{r.user ? fullName(r.user) : r.email}</p>
                    <p className="text-xs break-all text-muted">{r.user ? r.email : t('privacy.admin.noAccount')}</p>
                  </td>
                  <td className="sm:px-4 sm:py-3">
                    <span className={clsx('font-medium', r.type === 'DELETION' ? 'text-red-700' : 'text-ink')}>{t(`privacy.typeName.${r.type}`)}</span>
                  </td>
                  <td className="sm:px-4 sm:py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="sm:px-4 sm:py-3">
                    <span className={clsx('text-xs tabular-nums', r.overdue ? 'font-bold text-danger' : r.dueSoon ? 'font-semibold text-amber-700' : 'text-muted')}>
                      {isOpenStatus(r.status) ? fmtDate(r.dueAt) : '—'}
                      {r.overdue && ` · ${t('privacy.admin.overdue')}`}
                      {r.dueSoon && ` · ${t('privacy.admin.dueSoon')}`}
                    </span>
                  </td>
                  <td className="text-xs text-muted sm:px-4 sm:py-3">{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

// ─── Deletion ──────────────────────────────────────────────────────────

const DeletionPanel = ({ detail }: { detail: AdminRequestDetail }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const onError = useAdminError();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState('');
  const isSuper = user?.role === 'SUPER_ADMIN';
  const { item, subject, deletionPreview, deletionBlocked } = detail;

  const m = useMutation({
    mutationFn: async () => (await api.post(`/admin/privacy/requests/${item.id}/execute-deletion`, { confirmEmail: typed.trim() })).data,
    onSuccess: () => {
      toast.success(t('privacy.admin.deletion.done'));
      setStep(0);
      setTyped('');
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      void qc.invalidateQueries({ queryKey: ['admin-privacy-request', item.id] });
    },
    onError,
  });

  if (!subject || !isOpenStatus(item.status)) return null;
  const close = () => {
    if (m.isPending) return;
    setStep(0);
    setTyped('');
  };

  return (
    <Panel title={t('privacy.admin.deletion.title')} icon={Trash2} className="border-red-200">
      <p className="text-sm leading-relaxed text-muted">{t('privacy.admin.deletion.intro')}</p>
      {deletionBlocked ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {t('privacy.admin.deletion.blocked', { reason: t(`privacy.admin.errors.${deletionBlocked}`, { defaultValue: deletionBlocked }) })}
        </p>
      ) : (
        deletionPreview && (
          <dl className="mt-3 grid gap-x-6 sm:grid-cols-2">
            {(Object.keys(deletionPreview.counts) as (keyof DeletionPreviewCounts)[]).map((k) => (
              <DefRow key={k} label={t(`privacy.admin.deletion.counts.${k}`)}>
                {deletionPreview.counts[k]}
              </DefRow>
            ))}
          </dl>
        )
      )}
      <div className="mt-4 border-t border-line pt-4">
        {!isSuper ? (
          <p className="text-xs text-muted">{t('privacy.admin.deletion.superOnly')}</p>
        ) : item.status !== 'IN_PROGRESS' ? (
          <p className="text-xs text-muted">{t('privacy.admin.deletion.needsInProgress')}</p>
        ) : null}
        <button type="button" className="btn-danger mt-2 min-h-10" disabled={!isSuper || item.status !== 'IN_PROGRESS' || !!deletionBlocked} onClick={() => setStep(1)}>
          <Trash2 className="size-4" aria-hidden />
          {t('privacy.admin.deletion.execute')}
        </button>
      </div>

      <Modal
        open={step > 0}
        onClose={close}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-danger" aria-hidden />
            {t('privacy.admin.deletion.title')}
          </span>
        }
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-white btn-sm border border-line" onClick={close} disabled={m.isPending}>
              {t('admin.common.cancel')}
            </button>
            {step === 1 ? (
              <button type="button" className="btn-danger btn-sm" onClick={() => setStep(2)}>
                {t('privacy.admin.deletion.continue')}
              </button>
            ) : (
              <button
                type="button"
                className="btn-danger btn-sm"
                disabled={m.isPending || typed.trim().toLowerCase() !== subject.email.toLowerCase()}
                onClick={() => m.mutate()}
              >
                {m.isPending ? <Spinner className="size-4" /> : <Trash2 className="size-4" aria-hidden />}
                {t('privacy.admin.deletion.confirm')}
              </button>
            )}
          </div>
        }
      >
        {step === 1 ? (
          <p className="text-sm leading-relaxed text-ink">{t('privacy.admin.deletion.step1')}</p>
        ) : (
          <label className="block text-sm text-ink">
            <span className="mb-2 block break-all">{t('privacy.admin.deletion.typeEmail', { email: subject.email })}</span>
            <input className="input" autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} data-autofocus />
          </label>
        )}
      </Modal>
    </Panel>
  );
};

// ─── Request detail ────────────────────────────────────────────────────

const RequestDetail = () => {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const onError = useAdminError();
  const [note, setNote] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-privacy-request', id],
    queryFn: async () => (await api.get<AdminRequestDetail>(`/admin/privacy/requests/${id}`)).data,
  });

  const m = useMutation({
    mutationFn: async (status: RequestStatus) =>
      (await api.post(`/admin/privacy/requests/${id}/status`, { status, decisionNote: (note ?? data?.item.decisionNote ?? '').trim() || undefined })).data,
    onSuccess: () => {
      toast.success(t('privacy.admin.saved'));
      setNote(null);
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      void qc.invalidateQueries({ queryKey: ['admin-privacy-request', id] });
    },
    onError,
  });

  const back = (
    <Link to="/admin/privacy-requests" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
      <ArrowLeft className="size-4" aria-hidden />
      {t('privacy.admin.back')}
    </Link>
  );
  if (isLoading) return <LoadingBlock />;
  if (error || !data)
    return (
      <>
        {back}
        <ErrorBlock error={error} onRetry={() => refetch()} />
      </>
    );

  const { item, subject, overview } = data;
  const open = isOpenStatus(item.status);
  const actions: RequestStatus[] = item.status === 'OPEN' ? ['IN_PROGRESS', 'COMPLETED', 'REJECTED'] : item.status === 'IN_PROGRESS' ? ['OPEN', 'COMPLETED', 'REJECTED'] : [];
  const visibleActions = actions.filter((a) => !(a === 'COMPLETED' && item.type === 'DELETION' && subject));

  return (
    <div>
      {back}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className={clsx('text-xl font-bold', item.type === 'DELETION' ? 'text-red-800' : 'text-navy-900')}>{t(`privacy.typeName.${item.type}`)}</h2>
        <StatusBadge status={item.status} />
        {item.overdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">{t('privacy.admin.overdue')}</span>}
        {item.dueSoon && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{t('privacy.admin.dueSoon')}</span>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-6">
          <Panel title={t('privacy.admin.message')} icon={FileText}>
            <dl className="mb-4">
              <DefRow label="E-mail">{item.email}</DefRow>
              <DefRow label={t('privacy.admin.col.created')}>{fmtDateTime(item.createdAt)}</DefRow>
              <DefRow label={t('privacy.admin.col.due')}>{fmtDate(item.dueAt)}</DefRow>
            </dl>
            {item.handledBy && <p className="mb-3 text-xs text-muted">{t('privacy.admin.handledBy', { name: fullName(item.handledBy) })}</p>}
            <p className="text-sm whitespace-pre-line text-ink">{item.message || <span className="text-muted">{t('privacy.admin.noMessage')}</span>}</p>
          </Panel>

          <Panel title={t('privacy.admin.decisionNote')} icon={ListChecks}>
            {open ? (
              <>
                <textarea
                  aria-label={t('privacy.admin.decisionNote')}
                  className="input min-h-24"
                  maxLength={5000}
                  placeholder={t('privacy.admin.notePh')}
                  value={note ?? item.decisionNote ?? ''}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {visibleActions.map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={m.isPending}
                      onClick={() => m.mutate(a)}
                      className={clsx('btn-sm min-h-10', a === 'REJECTED' ? 'btn-danger' : a === 'COMPLETED' ? 'btn-primary' : 'btn-white border border-line')}
                    >
                      {t(`privacy.admin.act.${a}`)}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm whitespace-pre-line text-ink">{item.decisionNote || '—'}</p>
                {item.completedAt && <p className="mt-2 text-xs text-muted">{t('privacy.admin.closed', { date: fmtDateTime(item.completedAt) })}</p>}
              </>
            )}
          </Panel>

          {item.type === 'DELETION' && <DeletionPanel detail={data} />}
        </div>

        <div className="space-y-6">
          <Panel title={t('privacy.admin.subject')} icon={UserRound}>
            {subject ? (
              <>
                <p className="font-semibold text-navy-900">{fullName(subject)}</p>
                <p className="text-xs break-all text-muted">
                  {subject.email} · {subject.role}
                  {!subject.isActive && ` · ${t('privacy.admin.inactive')}`}
                </p>
                {subject.matchedByEmail && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{t('privacy.admin.matchedByEmail')}</p>}
              </>
            ) : (
              <p className="text-sm text-muted">{t('privacy.admin.noSubject')}</p>
            )}
          </Panel>

          {overview && (
            <Panel title={t('privacy.admin.overview')} icon={ShieldHalf}>
              <dl>
                {(['cases', 'documents', 'messages', 'translationOrders', 'sessions', 'devices'] as const).map((k) => (
                  <DefRow key={k} label={t(`privacy.overview.${k}`)}>
                    {overview[k]}
                  </DefRow>
                ))}
              </dl>
            </Panel>
          )}

          {data.otherRequests.length > 0 && (
            <Panel title={t('privacy.admin.other')} icon={Inbox}>
              <ul className="space-y-2">
                {data.otherRequests.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link to={`/admin/privacy-requests/${o.id}`} className="font-medium text-brand-700 hover:underline">
                      {t(`privacy.typeName.${o.type}`)}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {fmtDate(o.createdAt)} <StatusBadge status={o.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {data.consentLog.length > 0 && (
            <Panel title={t('privacy.admin.consentLog')} icon={ListChecks}>
              <ul className="space-y-1.5">
                {data.consentLog.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-ink">
                      {t(`privacy.consentType.${c.type}`)}:{' '}
                      <b className={c.granted ? 'text-emerald-700' : 'text-amber-700'}>{c.granted ? t('privacy.admin.consents.yes') : t('privacy.admin.consents.no')}</b>
                    </span>
                    <span className="shrink-0 text-muted">{fmtDate(c.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Consent log ───────────────────────────────────────────────────────

const ConsentLog = () => {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = new URLSearchParams();
  if (email.trim()) query.set('email', email.trim());
  if (type) query.set('type', type);
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const qs = query.toString();
  const csvQs = new URLSearchParams(query);
  csvQs.set('format', 'csv');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-privacy-consents', qs],
    queryFn: async () => (await api.get<ConsentLogResponse>(`/admin/privacy/consents${qs ? `?${qs}` : ''}`)).data,
  });
  const sourceLabel = (s: string) => (i18n.exists(`privacy.source.${s}`) ? t(`privacy.source.${s}`) : s);

  return (
    <>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_14rem_10rem_10rem_auto]">
        <label className="relative">
          <span className="sr-only">{t('privacy.admin.consents.email')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" className="input pl-9" placeholder={t('privacy.admin.consents.email')} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <select aria-label={t('privacy.admin.consents.type')} className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t('privacy.admin.consents.all')}</option>
          {CONSENT_TYPES.map((k) => (
            <option key={k} value={k}>
              {t(`privacy.consentType.${k}`)}
            </option>
          ))}
        </select>
        <input type="date" aria-label={t('privacy.admin.consents.from')} className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" aria-label={t('privacy.admin.consents.to')} className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        <a href={`/api/admin/privacy/consents?${csvQs.toString()}`} download className="btn-white btn-sm min-h-10 border border-line">
          <Download className="size-4" aria-hidden />
          {t('privacy.admin.consents.csv')}
        </a>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={ListChecks} title={t('privacy.admin.consents.empty')} />
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">{t('privacy.admin.consents.total', { count: data.total })}</p>
          <div className="overflow-x-auto rounded-xl border border-line bg-card">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  {(['date', 'person', 'type', 'value', 'source', 'version', 'ip'] as const).map((c) => (
                    <th key={c} className="px-3 py-2.5 font-medium">
                      {t(`privacy.admin.consents.col.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted tabular-nums">{fmtDateTime(r.createdAt)}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium break-all text-ink">{r.user?.email ?? r.email ?? '—'}</p>
                      {r.user && <p className="text-xs text-muted">{fullName(r.user)}</p>}
                    </td>
                    <td className="px-3 py-2 text-ink">{t(`privacy.consentType.${r.type}`, { defaultValue: r.type })}</td>
                    <td className="px-3 py-2">
                      <span className={clsx('text-xs font-bold', r.granted ? 'text-emerald-700' : 'text-amber-700')}>
                        {r.granted ? t('privacy.admin.consents.yes') : t('privacy.admin.consents.no')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">{sourceLabel(r.source)}</td>
                    <td className="px-3 py-2 text-xs text-muted">{r.version}</td>
                    <td className="px-3 py-2 text-xs text-muted" title={r.userAgent ?? undefined}>
                      {r.ip ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────

const ListPage = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'consents' ? 'consents' : 'requests';
  return (
    <>
      <div className="mb-5 flex gap-1 border-b border-line" role="tablist">
        {(['requests', 'consents'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setParams(k === 'consents' ? { tab: 'consents' } : {}, { replace: true })}
            className={clsx(
              '-mb-px min-h-10 border-b-2 px-3 text-sm font-semibold transition',
              tab === k ? 'border-brand-600 text-navy-900' : 'border-transparent text-muted hover:text-navy-900',
            )}
          >
            {t(`privacy.admin.tabs.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'consents' ? <ConsentLog /> : <RequestsList />}
    </>
  );
};

export default function AdminPrivacyRequests() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHead title={t('privacy.admin.title')} subtitle={t('privacy.admin.subtitle')} />
      <Routes>
        <Route index element={<ListPage />} />
        <Route path=":id" element={<RequestDetail />} />
      </Routes>
    </div>
  );
}
