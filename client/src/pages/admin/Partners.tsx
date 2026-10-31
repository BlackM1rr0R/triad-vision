import { useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Ban, Building2, Download, HandCoins, Handshake, Mail, Pencil, Phone, Plus, Search, Settings2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { fmtDate, fmtRelative } from '@/components/admin/labels';
import { PARTNERS_KEY, type Partner, type PartnerType } from '@/components/partners/api';
import { CommissionsPanel } from '@/components/partners/Commissions';
import { PartnerFormDialog } from '@/components/partners/PartnerForm'; // the one partner form (also used by the drive)
import { PartnerFieldsManager } from '@/components/partners/PartnerFieldsManager';
import { PartnerKeyInfo } from '@/components/partners/PartnerProfile';
import type { PartnerOwnershipFields } from '@/components/partners/Ownership';
import { money } from '@/components/agents/format';
import { RefusalReport } from '@/components/partners/RefusalReport'; // Ablehnung by partner / employer company
import { PartnerHub } from '@/components/partners/hub/PartnerHub'; // full profile page with tabs
import { ContractBadge } from '@/components/partners/hub/parts';
import { CONTRACT_STATUSES } from '@/components/partners/hub/types';

type ActiveFilter = 'all' | 'true' | 'false';
type SortKey = 'name' | 'clients' | 'activeCases' | 'commissions' | 'pending' | 'lastActivity' | 'contractEnd';
const SORTS: SortKey[] = ['name', 'clients', 'activeCases', 'commissions', 'pending', 'lastActivity', 'contractEnd'];

interface ListResponse {
  items: (Partner & PartnerOwnershipFields)[];
  facets: { countries: string[]; tags: string[] };
}

/** List filters kept in the URL (?q, ?active, ?type, ?country, ?tag, ?contract, ?sort, ?dir) so a filtered view can be linked and survives reloads. */
const useListParams = () => {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const active = (['all', 'true', 'false'] as const).find((v) => v === params.get('active')) ?? 'all';
  const sort = SORTS.find((s) => s === params.get('sort'));
  const dir: 'asc' | 'desc' = params.get('dir') === 'desc' ? 'desc' : 'asc';
  const contract = CONTRACT_STATUSES.find((s) => s === params.get('contract'));
  const type = params.get('type') === 'COMPANY' || params.get('type') === 'INDIVIDUAL' ? (params.get('type') as PartnerType) : undefined;
  const set = (patch: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (!v || (k === 'active' && v === 'all')) p.delete(k);
          else p.set(k, v);
        }
        return p;
      },
      { replace: true },
    );
  return { q: get('q'), active: active as ActiveFilter, type, country: get('country'), tag: get('tag'), contract, sort, dir, set };
};

const SortHeader = ({ k, label, sort, dir, onSort, className }: { k: SortKey; label: string; sort?: SortKey; dir: 'asc' | 'desc'; onSort: (k: SortKey) => void; className?: string }) => {
  const { t } = useTranslation();
  const on = sort === k;
  const Icon = on ? (dir === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <th className={clsx('px-3 py-2.5', className)} aria-sort={on ? (dir === 'desc' ? 'descending' : 'ascending') : undefined}>
      <button type="button" className={clsx('inline-flex items-center gap-1 whitespace-nowrap hover:text-ink', on && 'font-semibold text-ink')} onClick={() => onSort(k)} title={t('partnerHub.list.sortBy', { column: label })}>
        {label} <Icon className={clsx('size-3', !on && 'opacity-50')} aria-hidden />
      </button>
    </th>
  );
};

const PartnerList = ({ isAdmin }: { isAdmin: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lp = useListParams();
  const [searchInput, setSearchInput] = useState(lp.q);
  const [dialog, setDialog] = useState<{ open: boolean; partner: Partner | null }>({ open: false, partner: null });
  const [managingFields, setManagingFields] = useState(false);
  usePageTitle(t('refPartners.title'));
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (searchInput.trim() !== lp.q) lp.set({ q: searchInput.trim() || undefined });
    }, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed text debounces into the URL
  }, [searchInput]);
  const query = {
    search: lp.q || undefined,
    active: lp.active,
    type: lp.type,
    country: lp.country || undefined,
    tag: lp.tag || undefined,
    contract: lp.contract,
    sort: lp.sort,
    dir: lp.sort ? lp.dir : undefined,
  };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [...PARTNERS_KEY, 'list', query],
    queryFn: async () => (await api.get<ListResponse>('/admin/partners', { params: query })).data,
    placeholderData: keepPreviousData,
  });
  const items = data?.items;
  const facets = data?.facets ?? { countries: [], tags: [] };
  const filtered = !!(lp.q || lp.active !== 'all' || lp.type || lp.country || lp.tag || lp.contract);
  const onSort = (k: SortKey) => {
    // name / contract end start ascending, the numbers descending; a second click flips the direction.
    const first: 'asc' | 'desc' = k === 'name' || k === 'contractEnd' ? 'asc' : 'desc';
    lp.set({ sort: k, dir: lp.sort === k ? (lp.dir === 'asc' ? 'desc' : 'asc') : first });
  };
  const csvHref = `/api/admin/partners/export.csv?${new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1])).toString()}`;
  const sortProps = { sort: lp.sort, dir: lp.dir, onSort };

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
            <a href={csvHref} className="btn-secondary btn-sm" download>
              <Download className="size-4" /> {t('partnerHub.list.exportCsv')}
            </a>
            {isAdmin && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => setManagingFields(true)}>
                <Settings2 className="size-4" /> {t('partnerForm.custom.manage')}
              </button>
            )}
            {isAdmin && (
              <button type="button" className="btn-primary btn-sm" onClick={() => setDialog({ open: true, partner: null })}>
                <Plus className="size-4" /> {t('refPartners.add')}
              </button>
            )}
          </>
        }
      />
      <div className="mb-4 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">{t('partnerForm.searchPh')}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" className="input pl-9" placeholder={t('partnerForm.searchPh')} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </label>
          <div className="flex gap-1.5 overflow-x-auto">
            {(['all', 'true', 'false'] as const).map((v) => (
              <Chip key={v} active={lp.active === v} onClick={() => lp.set({ active: v })}>
                {t(`refPartners.filter.${v === 'all' ? 'all' : v === 'true' ? 'active' : 'inactive'}`)}
              </Chip>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:flex xl:flex-wrap xl:items-center">
          <select className="input xl:w-44" aria-label={t('partnerHub.list.th.type')} value={lp.type ?? ''} onChange={(e) => lp.set({ type: e.target.value || undefined })}>
            <option value="">{t('partnerHub.list.type.all')}</option>
            <option value="INDIVIDUAL">{t('partnerHub.list.type.INDIVIDUAL')}</option>
            <option value="COMPANY">{t('partnerHub.list.type.COMPANY')}</option>
          </select>
          <select className="input xl:w-44" aria-label={t('partnerHub.list.th.country')} value={lp.country} onChange={(e) => lp.set({ country: e.target.value || undefined })}>
            <option value="">{t('partnerHub.list.country.all')}</option>
            {lp.country && !facets.countries.includes(lp.country) && <option value={lp.country}>{lp.country}</option>}
            {facets.countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select className="input xl:w-44" aria-label={t('partnerForm.f.tags')} value={lp.tag} onChange={(e) => lp.set({ tag: e.target.value || undefined })}>
            <option value="">{t('partnerHub.list.tag.all')}</option>
            {lp.tag && !facets.tags.includes(lp.tag) && <option value={lp.tag}>{lp.tag}</option>}
            {facets.tags.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select className="input xl:w-52" aria-label={t('partnerHub.list.th.contract')} value={lp.contract ?? ''} onChange={(e) => lp.set({ contract: e.target.value || undefined })}>
            <option value="">{t('partnerHub.list.contract.all')}</option>
            {CONTRACT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`partnerHub.list.contract.${s}`)}
              </option>
            ))}
          </select>
          {filtered && (
            <button
              type="button"
              className="btn-ghost btn-sm col-span-2 md:col-span-4 xl:col-span-1"
              onClick={() => {
                setSearchInput('');
                lp.set({ q: undefined, active: undefined, type: undefined, country: undefined, tag: undefined, contract: undefined });
              }}
            >
              <X className="size-3.5" aria-hidden /> {t('partnerHub.list.reset')}
            </button>
          )}
          {items && <span className="text-xs text-muted xl:ml-auto">{t('partnerHub.list.shown', { count: items.length })}</span>}
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error || !items ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={Handshake} title={filtered ? t('refPartners.notFound') : t('refPartners.emptyTitle')}>
            {!filtered && t('refPartners.emptyText')}
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Phones / small tablets: cards */}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {items.map((p) => (
              <li key={p.id} className={clsx('flex flex-col rounded-xl border border-line bg-card p-4', !p.active && 'opacity-70')}>
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/admin/partners/${p.id}`} className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-semibold text-ink hover:text-link">
                      {p.partnerType === 'COMPANY' ? <Building2 className="size-4 shrink-0 text-link" aria-hidden /> : <Handshake className="size-4 shrink-0 text-link" aria-hidden />}
                      <span className="truncate">{p.name}</span>
                    </p>
                  </Link>
                  <ContractBadge contract={p.contract} compact />
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
                <PartnerKeyInfo partner={p} className="mt-1" />
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {(
                    [
                      [t('partnerHub.list.th.clients'), p.counts.clients],
                      [t('partnerHub.list.th.activeCases'), p.counts.activeCases],
                      [t('partnerHub.list.th.pending'), p.commissionTotals ? money(p.commissionTotals.pendingCents + p.commissionTotals.approvedCents, p.currency ?? 'EUR') : '—'],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label} className="min-w-0 rounded-lg bg-sunken px-2 py-1.5">
                      <dd className="truncate text-sm font-bold text-ink tabular-nums">{v}</dd>
                      <dt className="truncate text-[10px] text-muted">{label}</dt>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-[11px] text-muted">
                  {t('partnerHub.list.th.lastActivity')}: {p.lastActivityAt ? fmtRelative(p.lastActivityAt) : '—'}
                </p>
              </li>
            ))}
          </ul>

          {/* Desktop: sortable table */}
          <div className="hidden overflow-x-auto rounded-xl border border-line bg-card lg:block">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <caption className="sr-only">{t('partnerHub.list.table')}</caption>
              <thead className="border-b border-line bg-surface/70 text-xs font-medium text-muted">
                <tr>
                  <SortHeader k="name" label={t('partnerHub.list.th.name')} {...sortProps} />
                  <th className="px-3 py-2.5">{t('partnerHub.list.th.contact')}</th>
                  <th className="px-3 py-2.5">{t('partnerHub.list.th.country')}</th>
                  <SortHeader k="clients" label={t('partnerHub.list.th.clients')} className="text-right" {...sortProps} />
                  <SortHeader k="activeCases" label={t('partnerHub.list.th.activeCases')} className="text-right" {...sortProps} />
                  <SortHeader k="commissions" label={t('partnerHub.list.th.commissions')} className="text-right" {...sortProps} />
                  <SortHeader k="pending" label={t('partnerHub.list.th.pending')} className="text-right" {...sortProps} />
                  <SortHeader k="contractEnd" label={t('partnerHub.list.th.contract')} {...sortProps} />
                  <SortHeader k="lastActivity" label={t('partnerHub.list.th.lastActivity')} {...sortProps} />
                  <th className="px-3 py-2.5 text-right">
                    <span className="sr-only">{t('partnerHub.list.th.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((p) => {
                  const cur = p.currency ?? 'EUR';
                  return (
                    <tr key={p.id} className={clsx('cursor-pointer transition hover:bg-primary/[0.04]', !p.active && 'opacity-70')} onClick={() => navigate(`/admin/partners/${p.id}`)}>
                      <td className="max-w-[16rem] px-3 py-2.5 align-top">
                        <Link to={`/admin/partners/${p.id}`} className="flex items-center gap-2 font-semibold text-ink hover:text-link" onClick={(e) => e.stopPropagation()}>
                          {p.partnerType === 'COMPANY' ? <Building2 className="size-4 shrink-0 text-link" aria-hidden /> : <Handshake className="size-4 shrink-0 text-link" aria-hidden />}
                          <span className="truncate">{p.name}</span>
                        </Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                          {p.companyName && p.companyName !== p.name && <span className="truncate">{p.companyName}</span>}
                          {p.code && <span className="code-id">{p.code}</span>}
                          {!p.active && <span className="badge bg-sunken text-muted">{t('refPartners.inactive')}</span>}
                          {(p.tags ?? []).slice(0, 2).map((tag) => (
                            <span key={tag} className="rounded bg-sunken px-1 text-ink/80">
                              {tag}
                            </span>
                          ))}
                        </p>
                      </td>
                      <td className="max-w-[13rem] px-3 py-2.5 align-top text-xs">
                        {p.phone && <p className="whitespace-nowrap text-ink/80">{p.phone}</p>}
                        {p.email && <p className="truncate text-muted">{p.email}</p>}
                      </td>
                      <td className="px-3 py-2.5 align-top text-xs text-ink/80">{[p.city, p.country].filter(Boolean).join(', ') || '—'}</td>
                      <td className="px-3 py-2.5 text-right align-top font-semibold tabular-nums">{p.counts.clients}</td>
                      <td className="px-3 py-2.5 text-right align-top text-link tabular-nums">{p.counts.activeCases}</td>
                      <td className="px-3 py-2.5 text-right align-top whitespace-nowrap tabular-nums">{p.commissionTotals?.totalCents ? money(p.commissionTotals.totalCents, cur) : '—'}</td>
                      <td className="px-3 py-2.5 text-right align-top whitespace-nowrap text-warning-fg tabular-nums">
                        {p.commissionTotals && p.commissionTotals.pendingCents + p.commissionTotals.approvedCents > 0 ? money(p.commissionTotals.pendingCents + p.commissionTotals.approvedCents, cur) : '—'}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <ContractBadge contract={p.contract} />
                      </td>
                      <td className="px-3 py-2.5 align-top text-xs whitespace-nowrap text-muted" title={p.lastActivityAt ? fmtDate(p.lastActivityAt) : undefined}>
                        {p.lastActivityAt ? fmtRelative(p.lastActivityAt) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right align-top whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <Link to={`/admin/partners/${p.id}`} className="btn-secondary btn-sm">
                          {t('partnerHub.list.profile')}
                        </Link>
                        {isAdmin && (
                          <button type="button" className="btn-ghost btn-sm ml-1" aria-label={t('refPartners.edit')} title={t('refPartners.edit')} onClick={() => setDialog({ open: true, partner: p })}>
                            <Pencil className="size-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <PartnerFormDialog open={dialog.open} partner={dialog.partner} onClose={() => setDialog({ open: false, partner: null })} onSaved={(r) => !dialog.partner && navigate(`/admin/partners/${r.partner.id}`)} />
      {isAdmin && <PartnerFieldsManager open={managingFields} onClose={() => setManagingFields(false)} />}
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
      <Route path=":id" element={<PartnerHub isAdmin={isAdmin} />} />
    </Routes>
  );
}
