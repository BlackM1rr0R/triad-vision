import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, FolderSearch, Mail, Phone, Search, UserCheck, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { CaseStatus } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { ALL_STATUSES, STATUS_LABEL, fmtDate, fmtRelative, fullName } from '@/components/admin/labels';
import type { AdminCasesResponse } from '@/components/admin/types';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';

const isStatus = (v: string | null): v is CaseStatus => !!v && (ALL_STATUSES as string[]).includes(v);

export default function CasesList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status');
  const status = isStatus(statusParam) ? statusParam : null;
  const search = params.get('search') ?? '';
  const mine = params.get('mine') === '1';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => setSearchInput(search), [search]);

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        if (!('page' in patch)) next.delete('page');
        return next;
      },
      { replace: true },
    );

  // Debounce search box → URL
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchInput.trim() !== search) update({ search: searchInput.trim() || null });
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-cases', { status, search, mine, page }],
    queryFn: async () =>
      (
        await api.get<AdminCasesResponse>('/admin/cases', {
          params: { status: status ?? undefined, search: search || undefined, mine: mine ? '1' : undefined, page },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const counts = data?.counts ?? {};
  const allCount = ALL_STATUSES.reduce((a, s) => a + (counts[s] ?? 0), 0);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHead
        title="Müraciətlər"
        subtitle={data ? `${data.total} nəticə` : undefined}
        actions={isFetching && !isLoading ? <Spinner className="size-4 text-brand-600" /> : undefined}
      />

      <div className="mb-6 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Axtarış</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              className="input pl-9"
              placeholder="Nömrə, ad, e-poçt və ya peşə üzrə axtar…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </label>
          <button
            type="button"
            aria-pressed={mine}
            onClick={() => update({ mine: mine ? null : '1' })}
            className={clsx(
              'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition',
              mine ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink/80 hover:border-brand-400',
            )}
          >
            <UserCheck className="size-4" /> Mənim müraciətlərim
          </button>
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          <Chip active={!status} onClick={() => update({ status: null })} count={allCount}>
            Hamısı
          </Chip>
          {ALL_STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => update({ status: status === s ? null : s })} count={counts[s] ?? 0}>
              {STATUS_LABEL[s]}
            </Chip>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : data.items.length === 0 ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={FolderSearch} title="Müraciət tapılmadı">
            Filtrləri dəyişin və ya axtarışı təmizləyin.
            {(status || search || mine) && (
              <div className="mt-3">
                <button type="button" className="btn-white btn-sm border border-line" onClick={() => setParams({}, { replace: true })}>
                  <X className="size-3.5" /> Filtrləri sıfırla
                </button>
              </div>
            )}
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-line bg-white xl:block">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-line bg-surface/70 text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5">Nömrə</th>
                  <th className="px-4 py-2.5">Müştəri</th>
                  <th className="px-4 py-2.5">Peşə / viza</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Məsul əməkdaş</th>
                  <th className="px-4 py-2.5 text-right">Yeniləndi</th>
                </tr>
              </thead>
              <tbody className={clsx('divide-y divide-line transition-opacity', isFetching && 'opacity-60')}>
                {data.items.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer transition hover:bg-brand-50/50"
                    onClick={() => navigate(`/admin/cases/${c.id}`)}
                  >
                    <td className="px-4 py-3 align-top">
                      <Link
                        to={`/admin/cases/${c.id}`}
                        className="font-mono text-xs font-semibold text-brand-700 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.number}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-muted">{fmtDate(c.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-semibold whitespace-nowrap text-navy-900">{fullName(c.client)}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Mail className="size-3" aria-hidden />
                          {c.client.email}
                        </span>
                        {c.client.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3" aria-hidden />
                            {c.client.phone}
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-ink">{c.profession}</p>
                      <p className="mt-0.5 text-xs text-muted">{c.visaCategory ? `${c.visaCategory.title.az} · ${c.visaCategory.visaLabel}` : '—'}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap text-ink/80">
                      {c.assignedStaff ? fullName(c.assignedStaff) : <span className="text-muted">Təyin edilməyib</span>}
                    </td>
                    <td className="px-4 py-3 text-right align-top text-xs whitespace-nowrap text-muted" title={fmtDate(c.updatedAt)}>
                      {fmtRelative(c.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards below xl (table needs ~880px next to the sidebar) */}
          <ul className={clsx('grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden', isFetching && 'opacity-60')}>
            {data.items.map((c) => (
              <li key={c.id}>
                <Link to={`/admin/cases/${c.id}`} className="block h-full rounded-xl border border-line bg-white p-4 transition hover:border-brand-400/60 active:bg-surface">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-brand-700">{c.number}</p>
                      <p className="mt-0.5 truncate font-semibold text-navy-900">{fullName(c.client)}</p>
                      <p className="truncate text-xs text-muted">{c.profession}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span className="truncate">{c.assignedStaff ? fullName(c.assignedStaff) : 'Təyin edilməyib'}</span>
                    <span className="shrink-0">{fmtRelative(c.updatedAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <nav className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Səhifələmə">
              <p className="text-xs text-muted">
                Səhifə {page} / {pages}
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="btn-white btn-sm border border-line"
                  disabled={page <= 1}
                  onClick={() => update({ page: page - 1 > 1 ? String(page - 1) : null })}
                >
                  <ChevronLeft className="size-3.5" /> Əvvəlki
                </button>
                <button
                  type="button"
                  className="btn-white btn-sm border border-line"
                  disabled={page >= pages}
                  onClick={() => update({ page: String(page + 1) })}
                >
                  Növbəti <ChevronRight className="size-3.5" />
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
