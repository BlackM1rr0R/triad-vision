import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Ban, Building2, CheckCircle2, ChevronLeft, ChevronRight, Mail, Phone, Plus, RotateCcw, Search, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { CaseStatus, L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesJobs } from '@/i18n/pagesJobs';
import { Spinner } from '@/components/ui/Spinner';
import { Drawer } from '@/components/admin/Drawer';
import { Modal } from '@/components/admin/Modal';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { fmtDate, fullName } from '@/components/admin/labels';
import { Chip, DefRow, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { toastJobsError, useJobLabels } from '@/components/jobs/labels';
import { COMPANY_STATUS_TONE, SECTORS, VACANCY_STATUS_TONE, type Company, type CompanyStatus, type VacancyStatus } from '@/components/jobs/types';
import { SignaturesPanel } from '@/components/esign/CaseSignatures';
import { CompanyQuotesPanel } from '@/components/quotes/CompanyQuotesPanel';
import { EmployerReportsPanel } from '@/components/employerReports/EmployerReportsPanel';
import RecordHistoryPanel from '@/components/history/RecordHistoryPanel';
import { useNewParam } from '@/components/command/useNewParam'; // ?new=1 deep link (Ctrl+K palette)

registerCopy(pagesJobs);

const STATUSES: CompanyStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED'];

interface CompanyRow extends Company {
  note: string | null;
  _count: { users: number; vacancies: number; cases: number; invoices: number };
}
interface CompanyDetail extends Company {
  note: string | null;
  users: { id: string; firstName: string; lastName: string; email: string; phone: string | null; locale: string; isActive: boolean; emailVerifiedAt: string | null; createdAt: string }[];
  vacancies: { id: string; slug: string; title: L10n; status: VacancyStatus; city: string | null; positions: number; createdAt: string; _count: { applications: number } }[];
  cases: { id: string; number: string; status: CaseStatus; profession: string; createdAt: string; client: { firstName: string; lastName: string } }[];
  _count: { invoices: number };
}

const COMPANY_FIELDS = ['name', 'legalForm', 'city', 'phone', 'email', 'address', 'vatId', 'website', 'contactName'] as const;
type CompanyField = (typeof COMPANY_FIELDS)[number];
type CompanyForm = Record<CompanyField, string> & { sector: string; note: string };

const emptyForm = (c?: Partial<CompanyDetail>): CompanyForm => ({
  ...(Object.fromEntries(COMPANY_FIELDS.map((k) => [k, (c?.[k] as string | null | undefined) ?? ''])) as Record<CompanyField, string>),
  sector: c?.sector ?? 'logistics',
  note: c?.note ?? '',
});
const formPayload = (f: CompanyForm) => ({
  name: f.name.trim(),
  legalForm: f.legalForm.trim() || null,
  sector: f.sector,
  city: f.city.trim(),
  phone: f.phone.trim() || undefined,
  email: f.email.trim() || null,
  address: f.address.trim() || null,
  vatId: f.vatId.trim() || null,
  website: f.website.trim() || null,
  contactName: f.contactName.trim() || null,
  note: f.note.trim() || null,
});

const CompanyFields = ({ f, setF, idPrefix }: { f: CompanyForm; setF: (f: CompanyForm) => void; idPrefix: string }) => {
  const { t } = useTranslation();
  const L = useJobLabels();
  const input = (k: CompanyField, label: string, span = false, required = false) => (
    <div className={span ? 'sm:col-span-2' : undefined}>
      <label className="label" htmlFor={`${idPrefix}-${k}`}>
        {label}
      </label>
      <input id={`${idPrefix}-${k}`} className="input" required={required} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {input('name', t('jobsArea.register.companyName'), true, true)}
      {input('legalForm', t('jobsArea.register.legalForm'))}
      <div>
        <label className="label" htmlFor={`${idPrefix}-sector`}>
          {t('jobsArea.register.sector')}
        </label>
        <select id={`${idPrefix}-sector`} className="input" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })}>
          {SECTORS.map((s) => (
            <option key={s} value={s}>
              {L.sector(s)}
            </option>
          ))}
        </select>
      </div>
      {input('city', t('jobsArea.register.city'), false, true)}
      {input('phone', t('jobsArea.register.phone'))}
      {input('email', t('jobsArea.register.email'))}
      {input('contactName', t('jobsArea.register.contactName'))}
      {input('address', t('jobsArea.register.address'), true)}
      {input('vatId', t('jobsArea.register.vatId'))}
      {input('website', t('jobsArea.register.website'))}
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${idPrefix}-note`}>
          {t('jobsArea.admin.companies.note')}
        </label>
        <textarea id={`${idPrefix}-note`} className="input min-h-20" maxLength={5000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <p className="mt-1 text-[11px] text-muted">{t('jobsArea.admin.companies.noteHint')}</p>
      </div>
    </div>
  );
};

const InviteForm = ({ onSubmit, busy, idPrefix }: { onSubmit: (v: { firstName: string; lastName: string; email: string; locale: string }) => void; busy?: boolean; idPrefix: string }) => {
  const { t } = useTranslation();
  const [v, setV] = useState({ firstName: '', lastName: '', email: '', locale: 'de' });
  const ok = v.firstName.trim() && v.lastName.trim() && /\S+@\S+\.\S+/.test(v.email);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <input aria-label={t('jobsArea.register.firstName')} placeholder={t('jobsArea.register.firstName')} className="input" value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} />
      <input aria-label={t('jobsArea.register.lastName')} placeholder={t('jobsArea.register.lastName')} className="input" value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} />
      <input aria-label={t('jobsArea.register.email')} placeholder={t('jobsArea.register.email')} type="email" className="input" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
      <div className="flex gap-2">
        <select aria-label={t('jobsArea.admin.companies.language')} id={`${idPrefix}-locale`} className="input w-24" value={v.locale} onChange={(e) => setV({ ...v, locale: e.target.value })}>
          {['de', 'en', 'az', 'ru'].map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-primary btn-sm flex-1"
          disabled={!ok || busy}
          onClick={() => {
            onSubmit({ ...v, email: v.email.trim().toLowerCase() });
            setV({ firstName: '', lastName: '', email: '', locale: v.locale });
          }}
        >
          {busy ? <Spinner className="size-3.5" /> : <UserPlus className="size-3.5" />} {t('jobsArea.admin.companies.invite')}
        </button>
      </div>
    </div>
  );
};

const CreateCompanyModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState(emptyForm());
  const [invite, setInvite] = useState({ firstName: '', lastName: '', email: '', locale: 'de' });
  const m = useMutation({
    mutationFn: () =>
      api.post('/admin/companies', {
        company: formPayload(f),
        invite: invite.email.trim() ? { ...invite, email: invite.email.trim().toLowerCase() } : undefined,
      }),
    onSuccess: () => {
      toast.success(t('jobsArea.admin.companies.created'));
      void qc.invalidateQueries({ queryKey: ['admin-companies'] });
      setF(emptyForm());
      setInvite({ firstName: '', lastName: '', email: '', locale: 'de' });
      onClose();
    },
    onError: toastJobsError,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('jobsArea.admin.companies.new')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('admin.common.cancel')}
          </button>
          <button type="submit" form="create-company" className="btn-primary btn-sm" disabled={m.isPending || f.name.trim().length < 2 || f.city.trim().length < 2}>
            {m.isPending && <Spinner className="size-3.5" />} {t('admin.common.create')}
          </button>
        </>
      }
    >
      <form
        id="create-company"
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <CompanyFields f={f} setF={setF} idPrefix="cc" />
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-navy-900">{t('jobsArea.admin.companies.inviteOptional')}</legend>
          <input aria-label={t('jobsArea.register.firstName')} placeholder={t('jobsArea.register.firstName')} className="input" value={invite.firstName} onChange={(e) => setInvite({ ...invite, firstName: e.target.value })} />
          <input aria-label={t('jobsArea.register.lastName')} placeholder={t('jobsArea.register.lastName')} className="input" value={invite.lastName} onChange={(e) => setInvite({ ...invite, lastName: e.target.value })} />
          <input aria-label={t('jobsArea.register.email')} placeholder={t('jobsArea.register.email')} type="email" className="input" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <select aria-label={t('jobsArea.admin.companies.language')} className="input" value={invite.locale} onChange={(e) => setInvite({ ...invite, locale: e.target.value })}>
            {['de', 'en', 'az', 'ru'].map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted sm:col-span-2">{t('jobsArea.admin.companies.inviteHint')}</p>
        </fieldset>
      </form>
    </Modal>
  );
};

const CompanyDrawer = ({ id, onClose }: { id: string | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const L = useJobLabels();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-company', id],
    queryFn: async () => (await api.get<{ company: CompanyDetail }>(`/admin/companies/${id}`)).data.company,
    enabled: !!id,
  });
  const [f, setF] = useState<CompanyForm | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (data) setF(emptyForm(data));
  }, [data]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-companies'] });
    void qc.invalidateQueries({ queryKey: ['admin-company', id] });
  };
  const save = useMutation({
    mutationFn: () => api.patch(`/admin/companies/${id}`, formPayload(f!)),
    onSuccess: () => {
      toast.success(t('jobsArea.admin.companies.saved'));
      refresh();
    },
    onError: toastJobsError,
  });
  const status = useMutation({
    mutationFn: (s: CompanyStatus) => api.post(`/admin/companies/${id}/status`, { status: s, reason: reason.trim() || undefined }),
    onSuccess: () => {
      toast.success(t('jobsArea.admin.companies.statusChanged'));
      setReason('');
      refresh();
    },
    onError: toastJobsError,
  });
  const invite = useMutation({
    mutationFn: (v: { firstName: string; lastName: string; email: string; locale: string }) => api.post(`/admin/companies/${id}/users`, v),
    onSuccess: () => {
      toast.success(t('jobsArea.admin.companies.invited'));
      refresh();
    },
    onError: toastJobsError,
  });

  return (
    <Drawer open={!!id} onClose={onClose} title={data?.name ?? t('admin.nav.companies')}>
      {isLoading || !f ? (
        error ? <ErrorBlock error={error} onRetry={() => refetch()} /> : <LoadingBlock />
      ) : (
        data && (
          <div className="space-y-6">
            <Panel title={t('jobsArea.admin.companies.status')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={clsx('badge', COMPANY_STATUS_TONE[data.status])}>{L.companyStatus(data.status)}</span>
                <span className="text-xs text-muted">{t('jobsArea.admin.companies.since', { date: fmtDate(data.createdAt) })}</span>
              </div>
              <label className="label mt-4" htmlFor="cd-reason">
                {t('jobsArea.admin.companies.reason')}
              </label>
              <input id="cd-reason" className="input" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('jobsArea.admin.companies.reasonHint')} />
              <div className="mt-3 flex flex-wrap gap-2">
                {data.status !== 'ACTIVE' && (
                  <button type="button" className="btn-primary btn-sm" disabled={status.isPending} onClick={() => status.mutate('ACTIVE')}>
                    <CheckCircle2 className="size-3.5" /> {t('jobsArea.admin.companies.approve')}
                  </button>
                )}
                {data.status !== 'SUSPENDED' && (
                  <button type="button" className="btn-danger btn-sm" disabled={status.isPending} onClick={() => status.mutate('SUSPENDED')}>
                    <Ban className="size-3.5" /> {t('jobsArea.admin.companies.suspend')}
                  </button>
                )}
                {data.status !== 'PENDING' && (
                  <button type="button" className="btn-secondary btn-sm" disabled={status.isPending} onClick={() => status.mutate('PENDING')}>
                    <RotateCcw className="size-3.5" /> {t('jobsArea.admin.companies.backToPending')}
                  </button>
                )}
              </div>
              <p className="mt-2 text-[11px] text-muted">{t('jobsArea.admin.companies.statusHint')}</p>
            </Panel>

            <Panel title={t('jobsArea.admin.companies.details')}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate();
                }}
                className="space-y-4"
              >
                <CompanyFields f={f} setF={setF} idPrefix="cd" />
                <div className="flex justify-end">
                  <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
                    {save.isPending && <Spinner className="size-3.5" />} {t('admin.common.save')}
                  </button>
                </div>
              </form>
            </Panel>

            <Panel title={t('jobsArea.admin.companies.users', { count: data.users.length })}>
              <ul className="divide-y divide-line">
                {data.users.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-navy-900">{fullName(u)}</p>
                      <p className="truncate text-xs text-muted">
                        {u.email} · {u.locale.toUpperCase()}
                      </p>
                    </div>
                    <span className={clsx('badge', u.emailVerifiedAt ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg')}>
                      {u.emailVerifiedAt ? t('jobsArea.admin.verified') : t('jobsArea.admin.unverified')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 mb-2 text-xs font-semibold text-navy-900">{t('jobsArea.admin.companies.inviteUser')}</p>
              <InviteForm idPrefix="cdi" busy={invite.isPending} onSubmit={(v) => invite.mutate(v)} />
            </Panel>

            <Panel title={t('jobsArea.admin.companies.vacancies', { count: data.vacancies.length })}>
              {data.vacancies.length === 0 ? (
                <p className="text-sm text-muted">—</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.vacancies.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <Link to={`/admin/vacancies?id=${v.id}`} className="min-w-0 truncate font-semibold text-brand-700 hover:underline">
                        {tr(v.title)}
                      </Link>
                      <span className="flex items-center gap-2 text-xs text-muted">
                        {t('jobsArea.admin.applicationsCount', { count: v._count.applications })}
                        <span className={clsx('badge', VACANCY_STATUS_TONE[v.status])}>{L.vacancyStatus(v.status)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title={t('jobsArea.admin.companies.workers', { count: data.cases.length })}>
              {data.cases.length === 0 ? (
                <p className="text-sm text-muted">—</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.cases.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <Link to={`/admin/cases/${c.id}`} className="min-w-0 truncate font-semibold text-brand-700 hover:underline">
                        {c.number} · {fullName(c.client)}
                      </Link>
                      <StatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
              <dl className="mt-3 border-t border-line pt-2">
                <DefRow label={t('jobsArea.admin.companies.invoices')}>{data._count.invoices}</DefRow>
              </dl>
            </Panel>

            <CompanyQuotesPanel companyId={data.id} />
            <EmployerReportsPanel companyId={data.id} />
            <SignaturesPanel companyId={data.id} />
            <RecordHistoryPanel entity="COMPANY" entityId={data.id} />
          </div>
        )
      )}
    </Drawer>
  );
};

export default function AdminCompanies() {
  const { t } = useTranslation();
  const L = useJobLabels();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as CompanyStatus | null) ?? null;
  const openId = params.get('id');
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const [creating, setCreating] = useState(false);
  useNewParam(() => setCreating(true));
  const search = params.get('search') ?? '';

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page' && k !== 'id') next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => {
    const h = window.setTimeout(() => {
      if (searchInput.trim() !== search) setParam('search', searchInput.trim() || null);
    }, 350);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-companies', { status, search, page }],
    queryFn: async () =>
      (
        await api.get<{ items: CompanyRow[]; total: number; pageSize: number; counts: Partial<Record<CompanyStatus, number>> }>('/admin/companies', {
          params: { status: status ?? undefined, search: search || undefined, page },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHead
        title={t('admin.nav.companies')}
        subtitle={t('jobsArea.admin.companies.subtitle')}
        actions={
          <>
            {isFetching && !isLoading && <Spinner className="size-4 text-brand-600" />}
            <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" /> {t('jobsArea.admin.companies.new')}
            </button>
          </>
        }
      />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">{t('admin.common.search')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" className="input pl-9" placeholder={t('jobsArea.admin.companies.search')} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </label>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 sm:pb-0">
          <Chip active={!status} onClick={() => setParam('status', null)}>
            {t('admin.common.all')}
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setParam('status', status === s ? null : s)} count={data?.counts[s] ?? 0}>
              {L.companyStatus(s)}
            </Chip>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={Building2} title={t('jobsArea.admin.companies.empty')} />
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {data.items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setParam('id', c.id)}
                className="h-full w-full rounded-xl border border-line bg-white p-4 text-left transition hover:border-brand-400/60 hover:shadow-[0_8px_24px_-14px_rgba(11,31,68,0.35)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-navy-900">
                      {c.name} {c.legalForm && !c.name.includes(c.legalForm) ? c.legalForm : ''}
                    </p>
                    <p className="truncate text-xs text-muted">{[c.city, L.sector(c.sector)].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className={clsx('badge shrink-0', COMPANY_STATUS_TONE[c.status])}>{L.companyStatus(c.status)}</span>
                </div>
                <div className="mt-3 space-y-0.5 text-xs text-ink/75">
                  {c.email && (
                    <p className="flex items-center gap-1.5 truncate">
                      <Mail className="size-3 shrink-0" /> {c.email}
                    </p>
                  )}
                  {c.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="size-3 shrink-0" /> {c.phone}
                    </p>
                  )}
                </div>
                <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3 text-[11px] text-muted tabular-nums">
                  <span>{t('jobsArea.admin.companies.usersCount', { count: c._count.users })}</span>
                  <span>{t('jobsArea.admin.companies.vacanciesCount', { count: c._count.vacancies })}</span>
                  <span>{t('jobsArea.admin.companies.workersCount', { count: c._count.cases })}</span>
                  <span>{t('jobsArea.admin.companies.invoicesCount', { count: c._count.invoices })}</span>
                  <span className="ml-auto">{fmtDate(c.createdAt)}</span>
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-2" aria-label={t('admin.common.pagination')}>
          <button type="button" className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))} aria-label={t('admin.common.prev')}>
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-xs text-muted">{t('admin.common.pageOf', { page, pages })}</span>
          <button type="button" className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setParam('page', String(page + 1))} aria-label={t('admin.common.next')}>
            <ChevronRight className="size-4" />
          </button>
        </nav>
      )}

      <CreateCompanyModal open={creating} onClose={() => setCreating(false)} />
      <CompanyDrawer id={openId} onClose={() => setParam('id', null)} />
    </div>
  );
}
