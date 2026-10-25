import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { FileSignature, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesQuotes } from '@/i18n/pagesQuotes';
import { Panel } from '@/components/admin/ui';
import { fmtDate } from '@/components/admin/labels';
import { QUOTE_STATUS_TONE, fmtEur, type QuoteStatus } from './QuoteDocument';

registerCopy(pagesQuotes);

interface Row {
  id: string;
  number: string | null;
  status: QuoteStatus;
  title: string;
  grossCents: number;
  validUntil: string;
}

/** "Angebote" panel in Admin → Companies (admins only, like the quotes API): latest quotes + new quote. */
export const CompanyQuotesPanel = ({ companyId }: { companyId: string }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const admin = hasMinRole(user?.role, 'ADMIN');
  const q = useQuery({
    queryKey: ['admin-quotes', { companyId }],
    queryFn: async () => (await api.get<{ quotes: Row[] }>('/admin/quotes', { params: { companyId } })).data.quotes,
    enabled: admin,
  });
  if (!admin) return null;
  return (
    <Panel
      title={t('admin.nav.quotes')}
      icon={FileSignature}
      actions={
        <Link to={`/admin/quotes?new=1&companyId=${companyId}`} className="btn-primary btn-sm">
          <Plus className="size-3.5" aria-hidden /> {t('adminQuotes.actions.newForCompany')}
        </Link>
      }
    >
      {!q.data?.length ? (
        <p className="text-sm text-muted">—</p>
      ) : (
        <ul className="divide-y divide-line">
          {q.data.slice(0, 10).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <Link to={`/admin/quotes?id=${r.id}`} className="min-w-0 truncate font-semibold text-link hover:underline">
                {r.number ?? t('adminQuotes.draftNo')} · {r.title}
              </Link>
              <span className="flex items-center gap-2 text-xs text-muted">
                <span className="tabular-nums">{fmtEur(r.grossCents)}</span>
                {fmtDate(r.validUntil)}
                <span className={clsx('badge', QUOTE_STATUS_TONE[r.status])}>{t(`adminQuotes.status.${r.status}`)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};
