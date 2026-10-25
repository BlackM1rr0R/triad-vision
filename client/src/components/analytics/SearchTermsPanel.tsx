import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, SearchX } from 'lucide-react';
import { api } from '@/lib/api';
import { Panel } from '@/components/admin/ui';
import { registerCopy } from '@/i18n';
import { pagesDiscoverAdmin } from '@/i18n/pagesDiscoverAdmin';

registerCopy(pagesDiscoverAdmin);

interface SearchStats {
  top: { term: string; count: number }[];
  zeroResults: { term: string; count: number }[];
  total: number;
  zeroTotal: number;
}

const TermTable = ({ rows, label }: { rows: { term: string; count: number }[]; label: string }) => {
  const { t } = useTranslation();
  if (!rows.length) return <p className="text-sm text-muted">{t('discoverAdmin.search.empty')}</p>;
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{label}</caption>
      <thead>
        <tr className="text-left text-xs text-muted">
          <th scope="col" className="py-1.5 font-semibold">{t('discoverAdmin.search.term')}</th>
          <th scope="col" className="py-1.5 text-right font-semibold">{t('discoverAdmin.search.count')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.term} className="border-t border-line">
            <td className="py-1.5 pr-3 break-all text-ink">{r.term}</td>
            <td className="py-1.5 text-right font-semibold tabular-nums">{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

/** Admin Analytics: top site searches and searches without results in the selected range (anonymous daily counts). */
export const SearchTermsPanel = ({ from, to }: { from: string; to: string }) => {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['admin-search-stats', from, to],
    queryFn: async () => (await api.get<SearchStats>('/admin/site-features/search-stats', { params: { from, to } })).data,
  });
  return (
    <Panel title={t('discoverAdmin.search.title')} icon={Search}>
      <p className="text-sm text-muted">{t('discoverAdmin.search.subtitle')}</p>
      {data && (
        <p className="mt-2 text-xs font-semibold text-ink">
          {t('discoverAdmin.search.total', { count: data.total })} · {t('discoverAdmin.search.zeroTotal', { count: data.zeroTotal })}
        </p>
      )}
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
            <Search className="size-4 text-link" aria-hidden /> {t('discoverAdmin.search.top')}
          </h3>
          <TermTable rows={data?.top ?? []} label={t('discoverAdmin.search.top')} />
        </div>
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
            <SearchX className="size-4 text-warning-fg" aria-hidden /> {t('discoverAdmin.search.zero')}
          </h3>
          <TermTable rows={data?.zeroResults ?? []} label={t('discoverAdmin.search.zero')} />
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">{t('discoverAdmin.search.privacy')}</p>
    </Panel>
  );
};
