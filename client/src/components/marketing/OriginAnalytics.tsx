import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MapPinned } from 'lucide-react';
import { LoadingBlock, Panel } from '@/components/admin/ui';
import { statusLabel } from '@/components/admin/labels';
import { api } from '@/lib/api';
import { OriginFlowMap } from '@/components/growth/OriginFlowMap';
import type { AdminOrigins } from './api';

const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;
const STATUSES = [
  'DOCUMENTS_PENDING',
  'DOCUMENTS_REVIEW',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'EMBASSY_DOCUMENTS',
  'EMBASSY_REVIEW',
  'APPOINTMENT_SCHEDULED',
  'DECISION_PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;

/**
 * Admin → Sayt alətləri → Haradan: exact origin counts (no privacy threshold — staff only) of main
 * applicants by home city / country, with period, visa type and status filters, plus the routes.
 */
export const OriginAnalytics = () => {
  const { t } = useTranslation();
  const [f, setF] = useState({ from: '', to: '', visaType: '', status: '', placed: false });
  const query = new URLSearchParams(Object.entries({ ...f, placed: f.placed ? '1' : '' }).filter(([, v]) => v) as [string, string][]).toString();
  const { data, isFetching } = useQuery({
    queryKey: ['admin', 'origins', query],
    queryFn: async () => (await api.get<AdminOrigins>(`/admin/marketing/origins${query ? `?${query}` : ''}`)).data,
    placeholderData: (prev) => prev,
  });
  const originName = (o: AdminOrigins['origins'][number]) => o.city ?? t('mk.origins.countryOnly', { country: t(`mk.origins.countries.${o.country}`) });
  const nameOf = (key: string) => {
    const o = data?.origins.find((x) => x.key === key);
    return o ? originName(o) : key;
  };

  return (
    <div className="space-y-5">
      <Panel title={t('mk.origins.admin.tab')} icon={MapPinned}>
        <p className="mb-4 text-sm text-muted">{t('mk.origins.admin.intro')}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="label">{t('mk.origins.admin.from')}</span>
            <input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">{t('mk.origins.admin.to')}</span>
            <input type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">{t('mk.origins.admin.visaType')}</span>
            <select className="input" value={f.visaType} onChange={(e) => setF({ ...f, visaType: e.target.value })}>
              <option value="">{t('mk.origins.admin.all')}</option>
              {VISA_TYPES.map((v) => (
                <option key={v} value={v}>
                  {t(`mk.origins.admin.visaTypes.${v}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('mk.origins.admin.status')}</span>
            <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="">{t('mk.origins.admin.all')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2.5 text-sm text-ink">
            <input type="checkbox" className="size-4 accent-primary" checked={f.placed} onChange={(e) => setF({ ...f, placed: e.target.checked })} />
            {t('mk.origins.admin.placed')}
          </label>
        </div>
      </Panel>

      {!data ? (
        <LoadingBlock />
      ) : (
        <div className={isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(['AZ', 'TR', 'UA'] as const).map((c) => (
              <div key={c} className="rounded-xl border border-line bg-card p-3">
                <p className="text-xs text-muted">{t(`mk.origins.countries.${c}`)}</p>
                <p className="font-display text-2xl font-semibold text-ink tabular-nums">{data.countries[c]}</p>
              </div>
            ))}
            <div className="rounded-xl border border-line bg-card p-3">
              <p className="text-xs text-muted">{t('mk.origins.admin.unknown')}</p>
              <p className="font-display text-2xl font-semibold text-muted tabular-nums">{data.unknown}</p>
            </div>
            <div className="rounded-xl border border-line bg-card p-3">
              <p className="text-xs text-muted">{t('mk.origins.admin.clients')}</p>
              <p className="font-display text-2xl font-semibold text-ink tabular-nums">{data.clients}</p>
            </div>
          </div>
          {data.origins.length === 0 ? (
            <p className="rounded-xl border border-line bg-card p-6 text-center text-sm text-muted">{t('mk.origins.admin.noData')}</p>
          ) : (
            <div className="space-y-5">
              <Panel>
                <OriginFlowMap
                  data={{ enabled: true, minPerPoint: 1, countries: data.countries, origins: data.origins, flows: data.flows.map((x) => ({ from: x.from, to: x.toCity, count: x.count })) }}
                />
              </Panel>
              <div className="grid gap-5 lg:grid-cols-2">
                <Panel title={t('mk.origins.admin.origin')} bodyClassName="p-0 sm:p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-sunken text-left text-xs text-muted">
                      <tr>
                        <th className="px-4 py-2 font-semibold">{t('mk.origins.admin.origin')}</th>
                        <th className="px-4 py-2 font-semibold">{t('mk.origins.admin.country')}</th>
                        <th className="px-4 py-2 text-right font-semibold">{t('mk.origins.admin.count')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.origins.map((o) => (
                        <tr key={o.key}>
                          <td className="px-4 py-2 text-ink">{originName(o)}</td>
                          <td className="px-4 py-2 text-muted">{t(`mk.origins.countries.${o.country}`)}</td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums">{o.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
                <Panel title={t('mk.origins.admin.flows')} bodyClassName="p-0 sm:p-0">
                  {data.flows.length === 0 ? (
                    <p className="p-5 text-sm text-muted">{t('mk.origins.admin.noData')}</p>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-line">
                        {data.flows.map((x) => (
                          <tr key={`${x.from}-${x.to}`}>
                            <td className="px-4 py-2 text-ink">
                              {nameOf(x.from)} → {x.toCity}
                            </td>
                            <td className="px-4 py-2 text-right font-semibold tabular-nums">{x.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Panel>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
