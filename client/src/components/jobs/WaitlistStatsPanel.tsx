import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BellPlus, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { Panel } from '@/components/admin/ui';
import { registerCopy } from '@/i18n';
import { pagesWaitlist } from '@/i18n/pagesWaitlist';

registerCopy(pagesWaitlist);

interface WaitlistStats {
  active: number;
  pending: number;
  accounts: number;
  noticesLast30: number;
  professions: { key: string; labels: Record<string, string> | null; active: number; pending: number; accounts: number; last30: number; cities: { city: string; count: number }[] }[];
}

/**
 * Admin Vacancies: the vacancy waitlist per profession ("Uyğun vakansiya açılanda xəbər ver" — demand for new
 * vacancies; server lib/jobAlerts/waitlist.ts) with a CSV export (contacts masked without "clients › export").
 */
export const WaitlistStatsPanel = ({ className }: { className?: string }) => {
  const { t, i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const { data } = useQuery({ queryKey: ['admin-vacancy-waitlist'], queryFn: async () => (await api.get<WaitlistStats>('/admin/vacancies/waitlist')).data });
  if (!data) return null;
  const max = Math.max(1, ...data.professions.map((p) => p.active + p.pending));
  return (
    <Panel title={t('waitlist.admin.title')} icon={BellPlus} className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{t('waitlist.admin.text')}</p>
          <p className="mt-2 text-xs font-semibold text-ink">{t('waitlist.admin.totals', { active: data.active, pending: data.pending, notices: data.noticesLast30 })}</p>
        </div>
        <a href="/api/admin/vacancies/waitlist/export.csv" className="btn-secondary btn-sm shrink-0" download data-testid="waitlist-export">
          <Download className="size-3.5" aria-hidden /> {t('waitlist.admin.export')}
        </a>
      </div>
      {data.professions.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t('waitlist.admin.empty')}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-semibold">{t('waitlist.admin.profession')}</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-semibold">{t('waitlist.admin.active')}</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-semibold">{t('waitlist.admin.pending')}</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-semibold">{t('waitlist.admin.accounts')}</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-semibold">{t('waitlist.admin.last30')}</th>
                <th scope="col" className="py-1.5 font-semibold">{t('waitlist.admin.places')}</th>
              </tr>
            </thead>
            <tbody>
              {data.professions.map((p) => (
                <tr key={p.key} className="border-t border-line">
                  <th scope="row" className="py-2 pr-3 font-medium text-ink">
                    {p.labels?.[lng] ?? p.labels?.en ?? p.key}
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${((p.active + p.pending) / max) * 100}%` }} />
                    </div>
                  </th>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums text-ink">{p.active}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted">{p.pending}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted">{p.accounts}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted">{p.last30}</td>
                  <td className="py-2 text-muted">{p.cities.map((c) => `${c.city} (${c.count})`).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">{t('waitlist.admin.maskedNote')}</p>
    </Panel>
  );
};
