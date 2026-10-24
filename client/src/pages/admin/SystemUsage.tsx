import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Activity, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { adminNavCopy } from '@/i18n/adminNav';
import { ErrorBlock, PageHead, Panel } from '@/components/admin/ui';
import { fmtDate } from '@/components/admin/labels';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { Table, type SortState } from '@/components/ui/Table';
import { STAFF_NAV, hubOf, moduleOn, type StaffNavItem } from '@/components/command/navRegistry';
import { useStaffNav } from '@/components/command/navPrefs';
import { useSaveModules } from '@/components/admin/nav/useSaveModules';

registerCopy(adminNavCopy);

interface UsageResponse {
  days: number;
  since: string;
  items: { navId: string; opens: number; users: number; lastDay: string | null }[];
}

type Row = { item: StaffNavItem; label: string; hub: string; opens: number; users: number; lastDay: string | null };

const PERIODS = ['7', '30', '90'] as const;

/**
 * System → Usage (SUPER_ADMIN): page opens per menu entry (AdminPageVisit, counted once per page view),
 * least used first, with "switch module off" next to pages that belong to an optional module.
 */
export default function SystemUsage() {
  const { t } = useTranslation();
  usePageTitle(t('anav.usagePage.title'));
  const [days, setDays] = useTabParam('days', PERIODS, '30');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'opens', dir: 'asc' });
  const { modules } = useStaffNav();
  const save = useSaveModules();

  const usage = useQuery({
    queryKey: ['admin-nav-usage', days],
    queryFn: async () => (await api.get<UsageResponse>('/admin/nav/usage', { params: { days } })).data,
    placeholderData: keepPreviousData,
  });

  const rows = useMemo<Row[]>(() => {
    const by = new Map((usage.data?.items ?? []).map((i) => [i.navId, i]));
    const needle = q.trim().toLocaleLowerCase();
    const list = STAFF_NAV.map((item) => {
      const u = by.get(item.id);
      const hub = hubOf(item.id);
      return {
        item,
        label: t(item.labelKey),
        hub: hub ? t(`anav.hubs.${hub}`) : item.area === 'workspace' ? 'Workspace' : '—',
        opens: u?.opens ?? 0,
        users: u?.users ?? 0,
        lastDay: u?.lastDay ?? null,
      };
    }).filter((r) => !needle || `${r.label} ${r.hub}`.toLocaleLowerCase().includes(needle));
    const dir = sort?.dir === 'desc' ? -1 : 1;
    const key = sort?.key ?? 'opens';
    const val = (r: Row): string | number => (key === 'page' ? r.label : key === 'hub' ? r.hub : key === 'users' ? r.users : key === 'last' ? (r.lastDay ?? '') : r.opens);
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir || a.label.localeCompare(b.label);
    });
  }, [usage.data, q, sort, t]);

  const unused = rows.filter((r) => r.opens === 0).length;

  return (
    <div className="stack-page">
      <PageHead title={t('anav.usagePage.title')} subtitle={t('anav.usagePage.intro')} />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          label={t('anav.usagePage.period')}
          variant="pills"
          size="sm"
          items={PERIODS.map((p) => ({ key: p, label: t('anav.usagePage.days', { count: Number(p) }) }))}
          value={days}
          onChange={setDays}
        />
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">{t('anav.usagePage.search')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('anav.usagePage.search')} className="input !pl-9" />
        </label>
      </div>
      {usage.error ? (
        <ErrorBlock error={usage.error} onRetry={() => usage.refetch()} />
      ) : (
        <Panel title={t('anav.usagePage.summary', { pages: rows.length, unused })} icon={Activity} bodyClassName="p-0 sm:p-0">
          <Table<Row>
            caption={t('anav.usagePage.tableLabel')}
            rows={usage.data ? rows : undefined}
            loading={usage.isLoading}
            rowKey={(r) => r.item.id}
            sort={sort}
            onSortChange={setSort}
            stackOnMobile
            dense
            columns={[
              {
                key: 'page',
                header: t('anav.usagePage.cols.page'),
                sortable: true,
                primary: true,
                cell: (r) => (
                  <span className="inline-flex items-center gap-2 font-medium text-ink">
                    <r.item.icon className="size-4 shrink-0 text-muted" aria-hidden />
                    {r.label}
                  </span>
                ),
              },
              { key: 'hub', header: t('anav.usagePage.cols.hub'), sortable: true, hideBelow: 'md', cell: (r) => r.hub },
              { key: 'opens', header: t('anav.usagePage.cols.opens'), sortable: true, align: 'right', cell: (r) => <span className={clsx('tabular-nums', r.opens === 0 && 'text-muted')}>{r.opens}</span> },
              { key: 'users', header: t('anav.usagePage.cols.users'), sortable: true, align: 'right', cell: (r) => <span className="tabular-nums">{r.users}</span> },
              { key: 'last', header: t('anav.usagePage.cols.last'), sortable: true, hideBelow: 'sm', cell: (r) => (r.lastDay ? fmtDate(r.lastDay) : <span className="text-muted">{t('anav.usagePage.never')}</span>) },
              {
                key: 'action',
                header: t('anav.usagePage.cols.action'),
                align: 'right',
                cell: (r) => {
                  const m = r.item.module;
                  if (!m) return null;
                  const on = moduleOn(modules, m);
                  return (
                    <button
                      type="button"
                      disabled={save.isPending}
                      onClick={() => save.mutate({ [m]: !on })}
                      className={clsx('btn-sm whitespace-nowrap', on ? 'btn-secondary' : 'btn-primary')}
                      title={t(`anav.modules.${m}.title`)}
                    >
                      {on ? t('anav.usagePage.disable') : t('anav.usagePage.enable')}
                    </button>
                  );
                },
              },
            ]}
          />
        </Panel>
      )}
    </div>
  );
}
