import { useEffect, useState, type ChangeEvent } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, Download, FolderOpen, FolderPlus, HandCoins, Handshake, Mail, Pencil, Phone, Plus, Search, Trash2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Switch } from '@/components/admin/ui';
import { fmtDate, fullName } from '@/components/admin/labels';
import { PARTNERS_KEY, partnerError, type Partner, type PartnerCase, type PartnerCounts } from '@/components/partners/api';
import { CommissionsPanel, fromCents, toCents } from '@/components/partners/Commissions';
import { PortalLoginPanel } from '@/components/partners/PortalLogin';
import { DeletePartnerDialog, invalidatePartnerViews } from '@/components/partners/DeletePartnerDialog';
import { money } from '@/components/agents/format';

type ActiveFilter = 'all' | 'true' | 'false';

const CountRow = ({ counts }: { counts: PartnerCounts }) => {
  const { t } = useTranslation();
  const cells: [string, number, string][] = [
    [t('refPartners.counts.clients'), counts.clients, 'text-ink'],
    [t('refPartners.counts.active'), counts.activeCases, 'text-brand-700'],
    [t('refPartners.counts.approved'), counts.approved, 'text-emerald-700'],
    [t('refPartners.counts.negative'), counts.closedNegative, 'text-red-700'],
  ];
  return (
    <dl className="grid grid-cols-4 gap-2">
      {cells.map(([label, n, tone]) => (
        <div key={label} className="min-w-0 rounded-lg bg-surface px-2 py-1.5 text-center">
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
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose} disabled={save.isPending}>
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
            {isFetching && !isLoading && <Spinner className="size-4 text-brand-600" />}
            <Link to="/admin/partners/commissions" className="btn-white btn-sm border border-line">
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
            <li key={p.id} className={clsx('flex flex-col rounded-xl border border-line bg-card p-4 transition hover:border-brand-400/60', !p.active && 'opacity-70')}>
              <div className="flex items-start justify-between gap-2">
                <Link to={`/admin/partners/${p.id}`} className="min-w-0">
                  <p className="flex items-center gap-2 truncate font-semibold text-ink hover:text-brand-700">
                    <Handshake className="size-4 shrink-0 text-brand-600" aria-hidden /> <span className="truncate">{p.name}</span>
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  {!p.active && <span className="badge bg-surface text-muted">{t('refPartners.inactive')}</span>}
                  {isAdmin && (
                    <button type="button" className="btn-ghost btn-sm" aria-label={t('refPartners.edit')} title={t('refPartners.edit')} onClick={() => setDialog({ open: true, partner: p })}>
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
              <p className="mt-2 text-[11px] text-muted">{p.counts.lastCaseAt ? t('refPartners.lastCase', { date: fmtDate(p.counts.lastCaseAt) }) : t('refPartners.noCases')}</p>
              {(p.commissionCents != null || (p.commissionTotals && p.commissionTotals.totalCents > 0)) && (
                <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
                  {p.commissionCents != null && <span>{t('refPartners.perClient', { amount: money(p.commissionCents, p.currency ?? 'EUR') })}</span>}
                  {p.commissionTotals && p.commissionTotals.pendingCents + p.commissionTotals.approvedCents > 0 && (
                    <span className="text-amber-700">
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
  const [tab, setTab] = useState<'clients' | 'commissions'>('clients');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...PARTNERS_KEY, 'one', id],
    queryFn: async () => (await api.get<{ partner: Partner; cases: PartnerCase[] }>(`/admin/partners/${id}`)).data,
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

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  const { partner, cases } = data;
  const hasCases = cases.length > 0;

  return (
    <div>
      <Link to="/admin/partners" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
        <ArrowLeft className="size-3.5" /> {t('refPartners.back')}
      </Link>
      <PageHead
        title={partner.name}
        subtitle={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {!partner.active && <span className="badge bg-surface text-muted">{t('refPartners.inactive')}</span>}
            {partner.phone && (
              <a href={`tel:${partner.phone}`} className="inline-flex items-center gap-1 hover:text-brand-700">
                <Phone className="size-3.5" /> {partner.phone}
              </a>
            )}
            {partner.email && (
              <a href={`mailto:${partner.email}`} className="inline-flex items-center gap-1 hover:text-brand-700">
                <Mail className="size-3.5" /> {partner.email}
              </a>
            )}
          </span>
        }
        actions={
          <>
            <a href={`/api/admin/partners/${partner.id}/export.xlsx`} className="btn-white btn-sm border border-line" download>
              <Download className="size-3.5" /> {t('refPartners.download')}
            </a>
            <button type="button" className="btn-white btn-sm border border-line" onClick={() => openFolder.mutate()} disabled={openFolder.isPending}>
              {openFolder.isPending ? <Spinner className="size-3.5" /> : partner.folderId === null ? <FolderPlus className="size-3.5" /> : <FolderOpen className="size-3.5" />}{' '}
              {partner.folderId === null ? t('refPartners.noFolder') : t('refPartners.openFolder')}
            </button>
            {isAdmin && (
              <>
                <button type="button" className="btn-white btn-sm border border-line" onClick={() => setEditing(true)}>
                  <Pencil className="size-3.5" /> {t('refPartners.edit')}
                </button>
                <button type="button" className="btn-white btn-sm border border-line text-danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-3.5" /> {t('refPartners.delete')}
                </button>
              </>
            )}
          </>
        }
      />
      {partner.note && <p className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm whitespace-pre-line text-ink/80">{partner.note}</p>}
      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-3">
          <div className="max-w-xl">
            <CountRow counts={partner.counts} />
          </div>
          {partner.commissionTotals && (
            <dl className="grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ['pending', partner.commissionTotals.pendingCents, 'text-amber-700'],
                  ['approved', partner.commissionTotals.approvedCents, 'text-brand-700'],
                  ['paid', partner.commissionTotals.paidCents, 'text-emerald-700'],
                  ['thisMonth', partner.commissionTotals.thisMonthCents, 'text-ink'],
                ] as const
              ).map(([k, v, tone]) => (
                <div key={k} className="min-w-0 rounded-lg bg-surface px-2 py-1.5 text-center">
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

      <div className="mb-4 flex gap-1.5" role="tablist">
        {(['clients', 'commissions'] as const).map((k) => (
          <Chip key={k} active={tab === k} onClick={() => setTab(k)}>
            {t(`refPartners.tabs.${k}`)}
          </Chip>
        ))}
      </div>

      {tab === 'commissions' ? (
        <CommissionsPanel partnerId={partner.id} isAdmin={isAdmin} />
      ) : (
      <section className="rounded-xl border border-line bg-card">
        <header className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <Users className="size-4 text-brand-600" aria-hidden />
          <h2 className="text-sm font-semibold text-ink">{t('refPartners.clientsTitle', { count: cases.length })}</h2>
        </header>
        {!hasCases ? (
          <p className="px-5 py-8 text-center text-sm text-muted">{t('refPartners.clientsEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-line bg-surface/70 text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t('refPartners.th.number')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th.client')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th.passport')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th.type')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th.status')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th.staff')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th.created')}</th>
                  <th className="px-4 py-2.5">{t('refPartners.th.decision')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {cases.map((c) => (
                  <tr key={c.id} className="cursor-pointer transition hover:bg-brand-50/50" onClick={() => navigate(`/admin/cases/${c.id}`)}>
                    <td className="px-4 py-3 align-top">
                      <Link to={`/admin/cases/${c.id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                        {c.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-semibold whitespace-nowrap text-ink">{fullName(c.client)}</p>
                      {c.client.phone && <p className="text-xs text-muted">{c.client.phone}</p>}
                    </td>
                    <td className="px-4 py-3 align-top font-mono text-xs text-ink/80">{c.client.passportNumber ?? '—'}</td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-ink">{t(`refPartners.types.${c.visaType}`, { defaultValue: c.visaType })}</p>
                      {c.visaCategory && (
                        <p className="text-xs text-muted">
                          {tr(c.visaCategory.title)} · {c.visaCategory.visaLabel}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusBadge status={c.status} />
                    </td>
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
      <Link to="/admin/partners" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
        <ArrowLeft className="size-3.5" /> {t('refPartners.back')}
      </Link>
      <PageHead title={t('refPartners.com.title')} subtitle={t('refPartners.com.subtitle')} />
      <CommissionsPanel isAdmin={isAdmin} />
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
      <Route path=":id" element={<PartnerDetail isAdmin={isAdmin} />} />
    </Routes>
  );
}
