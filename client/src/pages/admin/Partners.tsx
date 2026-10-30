import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, Ban, ClipboardPen, Download, FolderOpen, FolderPlus, HandCoins, Handshake, Mail, Pencil, Phone, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Switch } from '@/components/admin/ui';
import { Tabs } from '@/components/ui/Tabs';
import { fmtDate, fullName } from '@/components/admin/labels';
import { PARTNERS_KEY, partnerError, type Partner, type PartnerCase, type PartnerCounts } from '@/components/partners/api';
import { CommissionsPanel, fromCents, toCents } from '@/components/partners/Commissions';
import { PortalLoginPanel } from '@/components/partners/PortalLogin';
import { OwnershipPanel, type OwnedClient, type PartnerOwnershipFields } from '@/components/partners/Ownership'; // sign-up code, rules, own clients
import { DeletePartnerDialog, invalidatePartnerViews } from '@/components/partners/DeletePartnerDialog';
import { money } from '@/components/agents/format';
import { SensitiveValue } from '@/components/privacyTools/SensitiveValue';
import { RefusalReport } from '@/components/partners/RefusalReport'; // Ablehnung by partner / employer company
import { PROCESSING_STAGES, stageLabel, type ProcessingStage } from '@/components/caseProcessing/api'; // team document workflow
import { StageCell } from '@/components/caseProcessing/parts';

type ActiveFilter = 'all' | 'true' | 'false';

const CountRow = ({ counts }: { counts: PartnerCounts }) => {
  const { t } = useTranslation();
  const cells: [string, number, string][] = [
    [t('refPartners.counts.clients'), counts.clients, 'text-ink'],
    [t('refPartners.counts.active'), counts.activeCases, 'text-link'],
    [t('refPartners.counts.approved'), counts.approved, 'text-success-fg'],
    // Visa refused ("rədd"): REJECTED or marked "Ablehnung" by the team; cancellations are listed separately.
    [t('refPartners.counts.rejected'), counts.rejected ?? counts.closedNegative, 'text-danger-fg'],
  ];
  return (
    <dl className="grid grid-cols-4 gap-2">
      {cells.map(([label, n, tone]) => (
        <div key={label} className="min-w-0 rounded-lg bg-sunken px-2 py-1.5 text-center">
          <dd className={clsx('text-base font-bold tabular-nums', tone)}>{n}</dd>
          <dt className="truncate text-[10px] text-muted" title={label}>
            {label}
          </dt>
        </div>
      ))}
    </dl>
  );
};

/** Add / edit dialog (admins only). */
const PartnerDialog = ({ open, partner, onClose }: { open: boolean; partner: Partner | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', phone: '', email: '', note: '', active: true, commission: '', currency: 'EUR' });
  useEffect(() => {
    if (open)
      setForm({
        name: partner?.name ?? '',
        phone: partner?.phone ?? '',
        email: partner?.email ?? '',
        note: partner?.note ?? '',
        active: partner?.active ?? true,
        commission: fromCents(partner?.commissionCents),
        currency: partner?.currency ?? 'EUR',
      });
  }, [open, partner]);
  const commissionInvalid = form.commission.trim() !== '' && toCents(form.commission) === null;
  const save = useMutation({
    mutationFn: async () => {
      const { commission, ...rest } = form;
      const body = { ...rest, name: form.name.trim(), commissionCents: toCents(commission), currency: form.currency.trim().toUpperCase() || 'EUR' };
      if (partner) await api.patch(`/admin/partners/${partner.id}`, body);
      else await api.post('/admin/partners', body);
    },
    onSuccess: async () => {
      toast.success(t('refPartners.saved'));
      await qc.invalidateQueries({ queryKey: PARTNERS_KEY });
      onClose();
    },
    onError: partnerError,
  });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Modal
      open={open}
      onClose={() => !save.isPending && onClose()}
      title={partner ? t('refPartners.edit') : t('refPartners.add')}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={save.isPending}>
            {t('refPartners.form.cancel')}
          </button>
          <button type="submit" form="partner-form" className="btn-primary btn-sm" disabled={save.isPending || !form.name.trim() || commissionInvalid}>
            {save.isPending && <Spinner className="size-3.5" />} {t('refPartners.form.save')}
          </button>
        </div>
      }
    >
      <form
        id="partner-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.name.trim() && !commissionInvalid) save.mutate();
        }}
      >
        <label className="block">
          <span className="label">{t('refPartners.form.name')}</span>
          <input className="input" required maxLength={120} value={form.name} onChange={set('name')} autoFocus />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t('refPartners.form.phone')}</span>
            <input className="input" type="tel" maxLength={40} value={form.phone} onChange={set('phone')} />
          </label>
          <label className="block">
            <span className="label">{t('refPartners.form.email')}</span>
            <input className="input" type="email" maxLength={191} value={form.email} onChange={set('email')} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <label className="block">
            <span className="label">{t('refPartners.commissionField')}</span>
            <input
              className="input tabular-nums"
              inputMode="decimal"
              placeholder="150.00"
              value={form.commission}
              onChange={set('commission')}
              aria-invalid={commissionInvalid || undefined}
              aria-describedby="partner-commission-hint"
            />
          </label>
          <label className="block">
            <span className="label">{t('refPartners.currency')}</span>
            <input className="input uppercase" maxLength={3} value={form.currency} onChange={set('currency')} />
          </label>
          <p id="partner-commission-hint" className="-mt-2 text-xs text-muted sm:col-span-2">
            {t('refPartners.commissionHint')}
          </p>
        </div>
        <label className="block">
          <span className="label">{t('refPartners.form.note')}</span>
          <textarea className="input min-h-24" maxLength={5000} placeholder={t('refPartners.form.notePh')} value={form.note} onChange={set('note')} />
        </label>
        <div className="flex items-center gap-3">
          <Switch checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} label={t('refPartners.form.active')} />
          <span className="text-sm text-ink">{t('refPartners.form.active')}</span>
        </div>
      </form>
    </Modal>
  );
};

const PartnerList = ({ isAdmin }: { isAdmin: boolean }) => {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<ActiveFilter>('all');
  const [dialog, setDialog] = useState<{ open: boolean; partner: Partner | null }>({ open: false, partner: null });
  usePageTitle(t('refPartners.title'));
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [...PARTNERS_KEY, 'list', { search, active }],
    queryFn: async () => (await api.get<{ items: Partner[] }>('/admin/partners', { params: { search: search || undefined, active } })).data.items,
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHead
        title={t('refPartners.title')}
        subtitle={t('refPartners.subtitle')}
        actions={
          <>
            {isFetching && !isLoading && <Spinner className="size-4 text-link" />}
            <Link to="/admin/partners/refusals" className="btn-secondary btn-sm">
              <Ban className="size-4" /> {t('refPartners.refusals.open')}
            </Link>
            <Link to="/admin/partners/commissions" className="btn-secondary btn-sm">
              <HandCoins className="size-4" /> {t('refPartners.allCommissions')}
            </Link>
            {isAdmin && (
              <button type="button" className="btn-primary btn-sm" onClick={() => setDialog({ open: true, partner: null })}>
                <Plus className="size-4" /> {t('refPartners.add')}
              </button>
            )}
          </>
        }
      />
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">{t('refPartners.searchPh')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" className="input pl-9" placeholder={t('refPartners.searchPh')} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </label>
        <div className="flex gap-1.5">
          {(['all', 'true', 'false'] as const).map((v) => (
            <Chip key={v} active={active === v} onClick={() => setActive(v)}>
              {t(`refPartners.filter.${v === 'all' ? 'all' : v === 'true' ? 'active' : 'inactive'}`)}
            </Chip>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={Handshake} title={search || active !== 'all' ? t('refPartners.notFound') : t('refPartners.emptyTitle')}>
            {!search && active === 'all' && t('refPartners.emptyText')}
          </EmptyState>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {data.map((p) => (
            <li key={p.id} className={clsx('flex flex-col rounded-xl border border-line bg-card p-4 transition hover:border-line-strong', !p.active && 'opacity-70')}>
              <div className="flex items-start justify-between gap-2">
                <Link to={`/admin/partners/${p.id}`} className="min-w-0">
                  <p className="flex items-center gap-2 truncate font-semibold text-ink hover:text-link">
                    <Handshake className="size-4 shrink-0 text-link" aria-hidden /> <span className="truncate">{p.name}</span>
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  {!p.active && <span className="badge bg-sunken text-muted">{t('refPartners.inactive')}</span>}
                  {isAdmin && (
                    <button type="button" className="btn-secondary btn-sm" aria-label={t('refPartners.edit')} title={t('refPartners.edit')} onClick={() => setDialog({ open: true, partner: p })}>
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                {p.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3" aria-hidden /> {p.phone}
                  </span>
                )}
                {p.email && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <Mail className="size-3" aria-hidden /> <span className="truncate">{p.email}</span>
                  </span>
                )}
              </p>
              <div className="mt-3">
                <CountRow counts={p.counts} />
              </div>
              <p className="mt-2 text-[11px] text-muted">
                {p.counts.lastCaseAt ? t('refPartners.lastCase', { date: fmtDate(p.counts.lastCaseAt) }) : t('refPartners.noCases')}
                {!!p.counts.cancelled && ` · ${t('refPartners.counts.cancelled', { count: p.counts.cancelled })}`}
              </p>
              {(p.commissionCents != null || (p.commissionTotals && p.commissionTotals.totalCents > 0)) && (
                <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
                  {p.commissionCents != null && <span>{t('refPartners.perClient', { amount: money(p.commissionCents, p.currency ?? 'EUR') })}</span>}
                  {p.commissionTotals && p.commissionTotals.pendingCents + p.commissionTotals.approvedCents > 0 && (
                    <span className="text-warning-fg">
                      {t('refPartners.totals.pending')}: {money(p.commissionTotals.pendingCents + p.commissionTotals.approvedCents, p.currency ?? 'EUR')}
                    </span>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <PartnerDialog open={dialog.open} partner={dialog.partner} onClose={() => setDialog({ open: false, partner: null })} />
    </div>
  );
};

const PartnerDetail = ({ isAdmin }: { isAdmin: boolean }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<'clients' | 'refusals' | 'commissions'>('clients');
  // Client list filters: visa kind (category, else type) and team workflow stage.
  const [visa, setVisa] = useState('');
  const [stage, setStage] = useState<ProcessingStage | ''>('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...PARTNERS_KEY, 'one', id],
    queryFn: async () => (await api.get<{ partner: Partner & PartnerOwnershipFields; cases: PartnerCase[]; ownedClients?: OwnedClient[] }>(`/admin/partners/${id}`)).data,
  });
  usePageTitle(data?.partner.name ?? t('refPartners.title'));
  // The partner's drive folder: opened when it exists, restored from the bin or created when it does not.
  const openFolder = useMutation({
    mutationFn: async () => (await api.post<{ folderId: string; restored: boolean; created: boolean }>(`/admin/partners/${id}/folder`)).data,
    onSuccess: (r) => {
      if (r.restored) toast.success(t('refPartners.folderRestored'));
      else if (r.created) toast.success(t('refPartners.folderCreated'));
      void invalidatePartnerViews(qc);
      navigate(`/workspace/drive/f/${encodeURIComponent(r.folderId)}`);
    },
    onError: partnerError,
  });

  const allCases = data?.cases;
  // Visa kinds of the partner's cases with counts (the filter chips): "LKW-Fahrer", "Ausbildung", …
  const visaKinds = useMemo(() => {
    const out = new Map<string, { key: string; label: string; count: number; refused: number }>();
    for (const c of allCases ?? []) {
      const key = c.visaKey ?? (c.visaCategory ? `cat:${c.visaCategory.visaLabel}` : `type:${c.visaType}`);
      const label = c.visaCategory ? tr(c.visaCategory.title) : t(`refPartners.types.${c.visaType}`, { defaultValue: c.visaType });
      const k = out.get(key) ?? { key, label, count: 0, refused: 0 };
      k.count++;
      if (c.refused) k.refused++;
      out.set(key, k);
    }
    return [...out.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [allCases, tr, t]);
  const stageCounts = useMemo(() => {
    const out = Object.fromEntries(PROCESSING_STAGES.map((s) => [s, 0])) as Record<ProcessingStage, number>;
    for (const c of allCases ?? []) if (c.processing?.stage) out[c.processing.stage]++;
    return out;
  }, [allCases]);

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  const { partner } = data;
  const cases = data.cases.filter((c) => (!visa || c.visaKey === visa) && (!stage || c.processing?.stage === stage));
  const hasCases = data.cases.length > 0;
  const filtered = !!visa || !!stage;

  return (
    <div>
      <Link to="/admin/partners" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-link hover:text-link">
        <ArrowLeft className="size-3.5" /> {t('refPartners.back')}
      </Link>
      <PageHead
        title={partner.name}
        subtitle={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {!partner.active && <span className="badge bg-sunken text-muted">{t('refPartners.inactive')}</span>}
            {partner.phone && (
              <a href={`tel:${partner.phone}`} className="inline-flex items-center gap-1 hover:text-link">
                <Phone className="size-3.5" /> {partner.phone}
              </a>
            )}
            {partner.email && (
              <a href={`mailto:${partner.email}`} className="inline-flex items-center gap-1 hover:text-link">
                <Mail className="size-3.5" /> {partner.email}
              </a>
            )}
          </span>
        }
        actions={
          <>
            <a href={`/api/admin/partners/${partner.id}/export.xlsx`} className="btn-secondary btn-sm" download>
              <Download className="size-3.5" /> {t('refPartners.download')}
            </a>
            <button type="button" className="btn-secondary btn-sm" onClick={() => openFolder.mutate()} disabled={openFolder.isPending}>
              {openFolder.isPending ? <Spinner className="size-3.5" /> : partner.folderId === null ? <FolderPlus className="size-3.5" /> : <FolderOpen className="size-3.5" />}{' '}
              {partner.folderId === null ? t('refPartners.noFolder') : t('refPartners.openFolder')}
            </button>
            {isAdmin && (
              <>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(true)}>
                  <Pencil className="size-3.5" /> {t('refPartners.edit')}
                </button>
                <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-3.5" /> {t('refPartners.delete')}
                </button>
              </>
            )}
          </>
        }
      />
      {partner.note && <p className="mb-4 rounded-xl border border-line bg-sunken px-4 py-3 text-sm whitespace-pre-line text-ink/80">{partner.note}</p>}
      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-3">
          <div className="max-w-xl">
            <CountRow counts={partner.counts} />
          </div>
          {partner.commissionTotals && (
            <dl className="grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ['pending', partner.commissionTotals.pendingCents, 'text-warning-fg'],
                  ['approved', partner.commissionTotals.approvedCents, 'text-link'],
                  ['paid', partner.commissionTotals.paidCents, 'text-success-fg'],
                  ['thisMonth', partner.commissionTotals.thisMonthCents, 'text-ink'],
                ] as const
              ).map(([k, v, tone]) => (
                <div key={k} className="min-w-0 rounded-lg bg-sunken px-2 py-1.5 text-center">
                  <dd className={clsx('truncate text-sm font-bold tabular-nums', tone)}>{money(v, partner.currency ?? 'EUR')}</dd>
                  <dt className="truncate text-[10px] text-muted">{t(`refPartners.totals.${k}`)}</dt>
                </div>
              ))}
            </dl>
          )}
          {partner.commissionCents != null && <p className="text-xs text-muted">{t('refPartners.perClient', { amount: money(partner.commissionCents, partner.currency ?? 'EUR') })}</p>}
        </div>
        <PortalLoginPanel partner={partner} isAdmin={isAdmin} />
      </div>
      <OwnershipPanel partner={partner} ownedClients={data.ownedClients ?? []} isAdmin={isAdmin} />

      <Tabs
        className="mb-4"
        label={partner.name}
        items={(['clients', 'refusals', 'commissions'] as const).map((k) => ({ key: k, label: k === 'refusals' ? t('refPartners.tabs2.refusals') : t(`refPartners.tabs.${k}`) }))}
        value={tab}
        onChange={setTab}
      />

      {tab === 'commissions' ? (
        <CommissionsPanel partnerId={partner.id} isAdmin={isAdmin} />
      ) : tab === 'refusals' ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">{t('refPartners.refusals.companiesOfPartner')}</p>
          <RefusalReport partnerId={partner.id} />
        </div>
      ) : (
      <section className="rounded-xl border border-line bg-card">
        <header className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <Users className="size-4 text-link" aria-hidden />
          <h2 className="text-sm font-semibold text-ink">{t('refPartners.clientsTitle', { count: data.cases.length })}</h2>
          {filtered && <span className="text-xs text-muted">{t('refPartners.filteredCount', { shown: cases.length, total: data.cases.length })}</span>}
        </header>
        {hasCases && (
          <div className="space-y-2 border-b border-line px-5 py-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('refPartners.visa.label')}>
              <span className="pr-1 text-xs font-semibold text-muted">{t('refPartners.visa.label')}</span>
              <Chip active={!visa} onClick={() => setVisa('')} count={data.cases.length}>
                {t('refPartners.visa.all')}
              </Chip>
              {visaKinds.map((v) => (
                <Chip key={v.key} active={visa === v.key} onClick={() => setVisa(visa === v.key ? '' : v.key)} count={v.count}>
                  <span title={v.refused ? `${t('refPartners.counts.rejected')}: ${v.refused}` : undefined}>{v.label}</span>
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('refPartners.stageFilter')}>
              <span className="inline-flex items-center gap-1 pr-1 text-xs font-semibold text-muted">
                <ClipboardPen className="size-3.5" aria-hidden /> {t('refPartners.stageFilter')}
              </span>
              {PROCESSING_STAGES.map((s) => (
                <Chip key={s} active={stage === s} onClick={() => setStage(stage === s ? '' : s)} count={stageCounts[s]}>
                  <span title={t(`caseProcessing.hints.${s}`)}>{stageLabel(s)}</span>
                </Chip>
              ))}
              {filtered && (
                <button type="button" className="btn-secondary btn-sm ml-auto" onClick={() => (setVisa(''), setStage(''))}>
                  <X className="size-3.5" aria-hidden /> {t('refPartners.resetFilters')}
                </button>
              )}
            </div>
          </div>
        )}
        {!hasCases || cases.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">{hasCases ? t('refPartners.notFound') : t('refPartners.clientsEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-b border-line bg-surface/70 text-xs font-medium whitespace-nowrap text-muted">
                <tr>
                  <th className="px-4 py-2.5">{t('refPartners.th.number')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th.client')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th.passport')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th2.visa')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th.status')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th2.stage')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th2.company')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th.staff')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th.created')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th.decision')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {cases.map((c) => (
                  <tr key={c.id} className="cursor-pointer transition hover:bg-primary/[0.04]" onClick={() => navigate(`/admin/cases/${c.id}`)}>
                    <td className="px-4 py-3 align-top">
                      <Link to={`/admin/cases/${c.id}`} className="code-id text-xs font-medium text-link hover:underline whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {c.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-semibold whitespace-nowrap text-ink">{fullName(c.client)}</p>
                      {c.client.phone && <p className="text-xs text-muted">{c.client.phone}</p>}
                    </td>
                    <td className="px-4 py-3 align-top code-id text-xs text-ink/80">
                      <SensitiveValue value={c.client.passportNumber} entity="user" id={c.client.id} field="passportNumber" />
                    </td>
                    <td className="px-4 py-3 align-top">
                      {/* The real visa kind: the category ("LKW-Fahrer") when there is one, else the visa type. */}
                      <p className="font-medium text-ink">{c.visaCategory ? tr(c.visaCategory.title) : t(`refPartners.types.${c.visaType}`, { defaultValue: c.visaType })}</p>
                      <p className="text-xs text-muted">
                        {c.visaCategory ? `${c.visaCategory.visaLabel} · ${t(`refPartners.types.${c.visaType}`, { defaultValue: c.visaType })}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusBadge status={c.status} />
                      {c.refused && c.status !== 'REJECTED' && <p className="mt-1 text-[11px] font-semibold text-danger-fg">{t('refPartners.counts.rejected')}</p>}
                    </td>
                    <td className="px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                      <StageCell p={c.processing} />
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3 align-top text-xs text-ink/80">{c.company?.name ?? '—'}</td>
                    <td className="px-4 py-3 align-top whitespace-nowrap text-ink/80">{c.assignedStaff ? fullName(c.assignedStaff) : '—'}</td>
                    <td className="px-4 py-3 align-top text-xs whitespace-nowrap text-muted">{fmtDate(c.createdAt)}</td>
                    <td className="px-4 py-3 align-top text-xs whitespace-nowrap text-muted">{c.decisionAt ? fmtDate(c.decisionAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      <PartnerDialog open={editing} partner={partner} onClose={() => setEditing(false)} />
      <DeletePartnerDialog partner={confirmDelete ? partner : null} onClose={() => setConfirmDelete(false)} onDeleted={() => navigate('/admin/partners')} />
    </div>
  );
};

/** /admin/partners/commissions — commissions of all partners with filters and the monthly Excel report. */
const AllCommissions = ({ isAdmin }: { isAdmin: boolean }) => {
  const { t } = useTranslation();
  usePageTitle(t('refPartners.com.title'));
  return (
    <div>
      <Link to="/admin/partners" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-link hover:text-link">
        <ArrowLeft className="size-3.5" /> {t('refPartners.back')}
      </Link>
      <PageHead title={t('refPartners.com.title')} subtitle={t('refPartners.com.subtitle')} />
      <CommissionsPanel isAdmin={isAdmin} />
    </div>
  );
};

/** /admin/partners/refusals — visa refusals ("Ablehnung") by partner and by employer company, with CSV. */
const Refusals = () => {
  const { t } = useTranslation();
  usePageTitle(t('refPartners.refusals.title'));
  return (
    <div>
      <Link to="/admin/partners" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-link hover:text-link">
        <ArrowLeft className="size-3.5" /> {t('refPartners.back')}
      </Link>
      <PageHead title={t('refPartners.refusals.title')} subtitle={t('refPartners.refusals.subtitle')} />
      <RefusalReport />
    </div>
  );
};

/** /admin/partners/* — referral partners (middlemen who bring visa clients). */
export default function AdminPartners() {
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  return (
    <Routes>
      <Route index element={<PartnerList isAdmin={isAdmin} />} />
      <Route path="commissions" element={<AllCommissions isAdmin={isAdmin} />} />
      <Route path="refusals" element={<Refusals />} />
      <Route path=":id" element={<PartnerDetail isAdmin={isAdmin} />} />
    </Routes>
  );
}
