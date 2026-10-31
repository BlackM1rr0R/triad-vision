import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  Activity,
  ArrowLeft,
  Briefcase,
  Building2,
  FileSignature,
  FileText,
  FolderSearch,
  Mail,
  PanelRight,
  Pencil,
  Phone,
  Receipt,
  ScrollText,
  StickyNote,
  UserX,
  Users,
  UsersRound,
  Globe,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { hasMinRole, type CaseStatus, type L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesJobs } from '@/i18n/pagesJobs';
import { pagesPartnerRecords } from '@/i18n/pagesPartnerRecords';
import { Badge, Button, Tabs, useTabParam, type TabItem } from '@/components/ui';
import { ErrorBlock, KpiCell, KpiStrip, LoadingBlock, Panel, SegmentBar } from '@/components/admin/ui';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { ALL_STATUSES, fmtDate, fullName, statusLabel, toastError } from '@/components/admin/labels';
import { TONE_SOLID, statusTone } from '@/components/ui/status';
import { useJobLabels } from '@/components/jobs/labels';
import { COMPANY_STATUS_TONE, VACANCY_STATUS_TONE, type Company, type VacancyStatus } from '@/components/jobs/types';
import { CompanyLogo } from '@/components/jobs/CompanyLogo';
import { CompanyQuotesPanel } from '@/components/quotes/CompanyQuotesPanel';
import { EmployerReportsPanel } from '@/components/employerReports/EmployerReportsPanel';
import { SignaturesPanel } from '@/components/esign/CaseSignatures';
import RecordHistoryPanel from '@/components/history/RecordHistoryPanel';
import { ContractsPanel } from '@/components/partnerRecords/ContractsPanel';
import { ContactsPanel } from '@/components/partnerRecords/ContactsPanel';
import { ActivityTimeline } from '@/components/partnerRecords/ActivityTimeline';
import { CompletenessBar, LegalDataForm, LegalDataView, legalFormOf, legalPayload, type Completeness, type LegalFormValue } from '@/components/partnerRecords/LegalDataForm';
import { daysTone, moneyLabel, recordsError, type PartnerContract } from '@/components/partnerRecords/api';

registerCopy(pagesJobs);
registerCopy(pagesPartnerRecords);

/**
 * Full employer profile (/admin/companies/:id): header with logo, status and key numbers (workers in process /
 * approved, refusals, open vacancies, active contract with days left, unpaid invoices for ADMIN+), the data
 * completeness for contracts and tabs — legal data (view / edit), contracts, contact persons, workers / cases,
 * vacancies, invoices / quotes, documents, history (timeline + field history) and the internal note.
 * The list + quick drawer stay at /admin/companies.
 */

interface CompanyDetail extends Company {
  note: string | null;
  bankLocked?: boolean;
  betriebsnummer?: string | null;
  users: { id: string; firstName: string; lastName: string; email: string; locale: string; isActive: boolean; emailVerifiedAt: string | null }[];
  vacancies: { id: string; slug: string; title: L10n; status: VacancyStatus; city: string | null; positions: number; createdAt: string; _count: { applications: number } }[];
  cases: { id: string; number: string; status: CaseStatus; profession: string; createdAt: string; client: { firstName: string; lastName: string } }[];
  _count: { invoices: number };
  [key: string]: unknown;
}

interface ProfileSummary {
  cases: { total: number; byStatus: Partial<Record<CaseStatus, number>>; inProcess: number; approved: number; refusals: number };
  vacancies: { open: number; total: number };
  contracts: { total: number; active: number; current: PartnerContract | null };
  contacts: number;
  activities: number;
  invoices: { count: number; openCents: number; paidCents: number; overdue: number } | null;
  quotes: number | null;
}

const TABS = ['info', 'contracts', 'contacts', 'workers', 'vacancies', 'finance', 'documents', 'history', 'notes'] as const;
type Tab = (typeof TABS)[number];

const GENERAL = ['name', 'phone', 'email', 'contactName', 'website', 'address'] as const;
type GeneralKey = (typeof GENERAL)[number];

export default function AdminCompanyProfile() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { tr, locale } = useL10n();
  const L = useJobLabels();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = hasMinRole(useAuth().user?.role, 'ADMIN');
  const [tab, setTab] = useTabParam<Tab>('tab', TABS, 'info');

  const detail = useQuery({
    queryKey: ['admin-company', id],
    queryFn: async () => {
      const { data } = await api.get<{ company: CompanyDetail; completeness: Completeness }>(`/admin/companies/${id}`);
      return { ...data.company, completeness: data.completeness };
    },
    enabled: !!id,
  });
  const summary = useQuery({
    queryKey: ['admin-company-profile', id],
    queryFn: async () => (await api.get<ProfileSummary>(`/admin/companies/${id}/profile`)).data,
    enabled: !!id,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-company', id] });
    void qc.invalidateQueries({ queryKey: ['admin-company-profile', id] });
    void qc.invalidateQueries({ queryKey: ['admin-companies'] });
    void qc.invalidateQueries({ queryKey: ['partner-records'] });
  };

  if (detail.isLoading) return <LoadingBlock />;
  if (detail.error || !detail.data) return <ErrorBlock error={detail.error ?? new Error('NOT_FOUND')} onRetry={() => detail.refetch()} />;
  const c = detail.data;
  const s = summary.data;
  const owner = { companyId: c.id };
  const current = s?.contracts.current ?? null;

  const tabs: TabItem<Tab>[] = [
    { key: 'info', label: t('companyProfile.tabs.info'), icon: Building2 },
    { key: 'contracts', label: t('companyProfile.tabs.contracts'), icon: FileText, count: s?.contracts.total },
    { key: 'contacts', label: t('companyProfile.tabs.contacts'), icon: UsersRound, count: s?.contacts },
    { key: 'workers', label: t('companyProfile.tabs.workers'), icon: Users, count: s?.cases.total },
    { key: 'vacancies', label: t('companyProfile.tabs.vacancies'), icon: Briefcase, count: s?.vacancies.total },
    { key: 'finance', label: t('companyProfile.tabs.finance'), icon: Receipt },
    { key: 'documents', label: t('companyProfile.tabs.documents'), icon: FileSignature },
    { key: 'history', label: t('companyProfile.tabs.history'), icon: Activity },
    { key: 'notes', label: t('companyProfile.tabs.notes'), icon: StickyNote },
  ];

  return (
    <div className="space-y-6">
      <Link to="/admin/companies" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> {t('companyProfile.back')}
      </Link>

      {/* Header */}
      <header className="flex flex-col gap-4 rounded-xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)] sm:flex-row sm:items-center sm:p-5">
        {c.logo ? (
          <CompanyLogo logo={c.logo} name={c.name} className="size-16 shrink-0" />
        ) : (
          <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-sunken text-muted">
            <Building2 className="size-7" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight text-ink">
              {c.name} {c.legalForm && !c.name.includes(c.legalForm) ? c.legalForm : ''}
            </h1>
            <span className={clsx('badge', COMPANY_STATUS_TONE[c.status])}>{L.companyStatus(c.status)}</span>
          </div>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {(c.city || c.sector) && <span>{[c.city, L.sector(c.sector)].filter(Boolean).join(' · ')}</span>}
            {c.betriebsnummer && <span>Betriebsnummer {c.betriebsnummer}</span>}
            {c.email && (
              <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-link">
                <Mail className="size-3" aria-hidden /> {c.email}
              </a>
            )}
            {c.phone && (
              <a href={`tel:${c.phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1 hover:text-link">
                <Phone className="size-3" aria-hidden /> {c.phone}
              </a>
            )}
            {c.website && (
              <a href={c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-link">
                <Globe className="size-3" aria-hidden /> {c.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            <span>{t('companyProfile.since', { date: fmtDate(c.createdAt) })}</span>
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={PanelRight} onClick={() => navigate(`/admin/companies?id=${c.id}`)}>
          {t('jobsArea.admin.companies.status')}
        </Button>
      </header>

      {/* Key numbers */}
      <KpiStrip cols={isAdmin ? 6 : 5}>
        <KpiCell label={t('companyProfile.kpi.inProcess')} value={s?.cases.inProcess ?? '—'} icon={Users} />
        <KpiCell label={t('companyProfile.kpi.approved')} value={s?.cases.approved ?? '—'} tone={s?.cases.approved ? 'success' : undefined} />
        <KpiCell label={t('companyProfile.kpi.refusals')} value={s?.cases.refusals ?? '—'} icon={UserX} tone={s?.cases.refusals ? 'danger' : undefined} />
        <KpiCell label={t('companyProfile.kpi.openVacancies')} value={s?.vacancies.open ?? '—'} icon={Briefcase} />
        <KpiCell
          label={t('companyProfile.kpi.contract')}
          value={current ? t(`partnerRecords.contracts.statuses.${current.status}`) : '—'}
          icon={ScrollText}
          hint={
            current ? (
              <span className={daysTone(current.daysLeft)}>
                {current.title}
                {current.daysLeft !== null && ` · ${current.daysLeft >= 0 ? t('partnerRecords.contracts.daysLeft', { count: current.daysLeft }) : t('partnerRecords.contracts.endedAgo', { count: -current.daysLeft })}`}
              </span>
            ) : (
              t('companyProfile.kpi.noContract')
            )
          }
        />
        {isAdmin && s?.invoices && (
          <KpiCell
            label={t('companyProfile.kpi.openInvoices')}
            value={moneyLabel(s.invoices.openCents, 'EUR', locale)}
            icon={Receipt}
            tone={s.invoices.overdue ? 'danger' : undefined}
            hint={t('companyProfile.kpi.paid', { amount: moneyLabel(s.invoices.paidCents, 'EUR', locale) })}
          />
        )}
      </KpiStrip>

      {c.completeness && <CompletenessBar completeness={c.completeness} onFill={tab !== 'info' ? () => setTab('info') : undefined} />}

      <Tabs items={tabs} value={tab} onChange={setTab} label={c.name} idPrefix="cprof" variant="underline" />

      <div role="tabpanel" id={`cprof-panel-${tab}`} aria-labelledby={`cprof-tab-${tab}`}>
        {tab === 'info' && <InfoTab company={c} isAdmin={isAdmin} onSaved={refresh} />}
        {tab === 'contracts' && <ContractsPanel owner={owner} onFillData={() => setTab('info')} />}
        {tab === 'contacts' && <ContactsPanel owner={owner} />}
        {tab === 'workers' && (
          <Panel title={t('companyProfile.tabs.workers')} icon={Users}>
            {s && s.cases.total > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-xs font-semibold text-muted">{t('companyProfile.casesByStage')}</p>
                <SegmentBar
                  label={t('companyProfile.casesByStage')}
                  parts={ALL_STATUSES.filter((st) => s.cases.byStatus[st]).map((st) => ({ key: st, value: s.cases.byStatus[st] ?? 0, className: TONE_SOLID[statusTone('case', st)], title: `${statusLabel(st)}: ${s.cases.byStatus[st]}` }))}
                />
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {ALL_STATUSES.filter((st) => s.cases.byStatus[st]).map((st) => (
                    <li key={st}>
                      <Link to={`/admin/cases?status=${st}&companyId=${c.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px] hover:border-line-strong">
                        <StatusBadge status={st} /> <span className="font-semibold tabular-nums">{s.cases.byStatus[st]}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {c.cases.length === 0 ? (
              <p className="text-sm text-muted">{t('companyProfile.noCases')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.cases.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <Link to={`/admin/cases/${x.id}`} className="min-w-0 truncate font-semibold text-link hover:underline">
                      {x.number} · {fullName(x.client)}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {x.profession} · {fmtDate(x.createdAt)}
                      <StatusBadge status={x.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
        {tab === 'vacancies' && (
          <Panel title={t('companyProfile.tabs.vacancies')} icon={Briefcase}>
            {c.vacancies.length === 0 ? (
              <p className="text-sm text-muted">{t('companyProfile.noVacancies')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.vacancies.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <Link to={`/admin/vacancies?id=${v.id}`} className="min-w-0 truncate font-semibold text-link hover:underline">
                      {tr(v.title)}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {v.city && `${v.city} · `}
                      {t('jobsArea.admin.applicationsCount', { count: v._count.applications })}
                      <span className={clsx('badge', VACANCY_STATUS_TONE[v.status])}>{L.vacancyStatus(v.status)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
        {tab === 'finance' && (
          <div className="space-y-6">
            <Panel title={t('companyProfile.invoices')} icon={Receipt}>
              {isAdmin && s?.invoices ? (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <dl className="flex flex-wrap gap-x-6 gap-y-1">
                    <div>
                      <dt className="text-xs text-muted">{t('companyProfile.invoices')}</dt>
                      <dd className="font-semibold tabular-nums">{s.invoices.count}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t('companyProfile.kpi.openInvoices')}</dt>
                      <dd className={clsx('font-semibold tabular-nums', s.invoices.overdue && 'text-danger-fg')}>{moneyLabel(s.invoices.openCents, 'EUR', locale)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t('companyProfile.kpi.paid', { amount: '' }).replace(/[:\s]+$/, '')}</dt>
                      <dd className="font-semibold tabular-nums">{moneyLabel(s.invoices.paidCents, 'EUR', locale)}</dd>
                    </div>
                  </dl>
                  <Link to={`/admin/invoices?companyId=${c.id}`} className="btn-secondary btn-sm">
                    {t('companyProfile.invoicesOpen')}
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-muted">{t('companyProfile.invoicesAdminOnly')}</p>
              )}
            </Panel>
            <CompanyQuotesPanel companyId={c.id} />
          </div>
        )}
        {tab === 'documents' && (
          <div className="space-y-6">
            <Panel title={t('companyProfile.tabs.documents')} icon={FolderSearch}>
              <p className="text-sm text-muted">{t('companyProfile.documentsHint')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={FileText} onClick={() => setTab('contracts')}>
                  {t('companyProfile.tabs.contracts')}
                </Button>
                <Link to={`/workspace/drive/search?q=${encodeURIComponent(c.name)}`} className="btn-secondary btn-sm">
                  <FolderSearch className="size-3.5" aria-hidden /> {t('companyProfile.driveSearch')}
                </Link>
              </div>
            </Panel>
            <SignaturesPanel companyId={c.id} />
            <EmployerReportsPanel companyId={c.id} />
          </div>
        )}
        {tab === 'history' && (
          <div className="space-y-6">
            <ActivityTimeline owner={owner} />
            <RecordHistoryPanel entity="COMPANY" entityId={c.id} />
          </div>
        )}
        {tab === 'notes' && <NotesTab company={c} onSaved={refresh} />}
      </div>
    </div>
  );
}

// ─── Data tab ───────────────────────────────────────────────────────────

const InfoTab = ({ company, isAdmin, onSaved }: { company: CompanyDetail; isAdmin: boolean; onSaved: () => void }) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [legal, setLegal] = useState<LegalFormValue>(legalFormOf(company));
  const [general, setGeneral] = useState<Record<GeneralKey, string>>(() => Object.fromEntries(GENERAL.map((k) => [k, (company[k] as string | null) ?? ''])) as Record<GeneralKey, string>);
  useEffect(() => {
    if (!editing) {
      setLegal(legalFormOf(company));
      setGeneral(Object.fromEntries(GENERAL.map((k) => [k, (company[k] as string | null) ?? ''])) as Record<GeneralKey, string>);
    }
  }, [company, editing]);
  const bank = isAdmin ? 'edit' : company.bankLocked ? 'locked' : 'hidden';
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/admin/companies/${company.id}`, {
        name: general.name.trim(),
        phone: general.phone.trim() || undefined,
        email: general.email.trim() || null,
        contactName: general.contactName.trim() || null,
        website: general.website.trim() || null,
        address: general.address.trim() || null,
        ...legalPayload(legal, { bank: isAdmin }),
        city: legal.city.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(t('partnerRecords.common.saved'));
      setEditing(false);
      onSaved();
    },
    onError: (err) => toast.error(recordsError(err)),
  });
  const generalLabel = (k: GeneralKey) => t(`jobsArea.register.${k === 'name' ? 'companyName' : k}`);

  if (!editing)
    return (
      <Panel
        title={t('companyProfile.viewLegal')}
        icon={Building2}
        actions={
          <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
            {t('partnerRecords.common.edit')}
          </Button>
        }
      >
        <dl className="mb-5 grid gap-x-6 sm:grid-cols-2">
          {GENERAL.map((k) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-sm">
              <dt className="shrink-0 text-xs text-muted">{generalLabel(k)}</dt>
              <dd className="min-w-0 text-right font-medium break-words text-ink">{(company[k] as string | null) || '—'}</dd>
            </div>
          ))}
        </dl>
        <LegalDataView data={company} bank={bank} />
        {company.users.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('companyProfile.users')}</h3>
            <ul className="flex flex-wrap gap-2">
              {company.users.map((u) => (
                <li key={u.id}>
                  <Badge tone={u.isActive ? 'neutral' : 'warning'}>
                    {fullName(u)} · {u.email}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
    );
  return (
    <Panel title={t('companyProfile.viewLegal')} icon={Building2}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-ink">{t('partnerRecords.legal.sections.general')}</legend>
          {GENERAL.map((k) => (
            <div key={k} className={k === 'address' || k === 'name' ? 'sm:col-span-2' : undefined}>
              <label className="label" htmlFor={`cpi-${k}`}>
                {generalLabel(k)}
              </label>
              <input id={`cpi-${k}`} className="input" required={k === 'name'} maxLength={k === 'address' ? 300 : 200} value={general[k]} onChange={(e) => setGeneral({ ...general, [k]: e.target.value })} />
            </div>
          ))}
        </fieldset>
        <LegalDataForm value={legal} onChange={setLegal} idPrefix="cpi-legal" bank={bank} required={['city']} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditing(false)}>
            {t('partnerRecords.common.cancel')}
          </Button>
          <Button type="submit" loading={save.isPending} disabled={general.name.trim().length < 2}>
            {t('partnerRecords.common.save')}
          </Button>
        </div>
      </form>
    </Panel>
  );
};

// ─── Notes tab ──────────────────────────────────────────────────────────

const NotesTab = ({ company, onSaved }: { company: CompanyDetail; onSaved: () => void }) => {
  const { t } = useTranslation();
  const [note, setNote] = useState(company.note ?? '');
  useEffect(() => setNote(company.note ?? ''), [company.note]);
  const save = useMutation({
    mutationFn: () => api.patch(`/admin/companies/${company.id}`, { note: note.trim() || null }),
    onSuccess: () => {
      toast.success(t('partnerRecords.common.saved'));
      onSaved();
    },
    onError: (err) => toastError(err),
  });
  return (
    <Panel title={t('companyProfile.tabs.notes')} icon={StickyNote}>
      <label className="label" htmlFor="cp-note">
        {t('jobsArea.admin.companies.note')}
      </label>
      <textarea id="cp-note" className="input min-h-40" maxLength={5000} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted">{t('companyProfile.notesHint')}</p>
        <Button size="sm" loading={save.isPending} disabled={note === (company.note ?? '')} onClick={() => save.mutate()}>
          {t('partnerRecords.common.save')}
        </Button>
      </div>
    </Panel>
  );
};
