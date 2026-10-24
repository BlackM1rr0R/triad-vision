import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Receipt, Scale, Timer, TrendingUp, Wallet } from 'lucide-react';
import CaseProfitCard from '@/components/reports/CaseProfitCard';
import CaseTimePanel from '@/components/timeCare/CaseTimePanel';
import { Card } from '@/components/ui/Card';
import { useStaffNav } from '@/components/command/navPrefs';
import type { CaseTabProps } from './types';

// Client invoices, payments and payment plan of the case (lib/billing).
const CaseBillingPanel = lazy(() => import('@/components/billing/CaseBillingPanel'));

/** Maliyyə: profitability of the case (ADMIN+, revenue lines come from its invoices / settlements), staff time, finance pages. */
export default function FinanceTab({ c, isAdmin }: CaseTabProps) {
  const { t } = useTranslation();
  const { isModuleOn } = useStaffNav(); // switched-off modules (settlements, time tracking) get no link
  const links = [
    ...(isAdmin
      ? [
          { to: '/admin/invoices', label: t('caseLayout.finance.invoices'), icon: Receipt },
          { to: '/admin/client-invoices', label: t('admin.nav.clientInvoices'), icon: Receipt },
          ...(isModuleOn('settlements') ? [{ to: '/admin/settlements', label: t('caseLayout.finance.settlements'), icon: Scale }] : []),
          { to: '/admin/profitability', label: t('caseLayout.finance.profitability'), icon: TrendingUp },
        ]
      : []),
    ...(isModuleOn('timeTracking') ? [{ to: `/admin/time?caseId=${c.id}`, label: t('caseLayout.finance.time'), icon: Timer }] : []),
  ];
  return (
    <div className="stack-page">
      <Suspense fallback={null}>
        <CaseBillingPanel caseId={c.id} isAdmin={isAdmin} />
      </Suspense>
      <div className="grid items-start gap-6 2xl:grid-cols-2">
        {isAdmin && (
          <div id="case-profit" className="empty:hidden">
            <CaseProfitCard caseId={c.id} />
          </div>
        )}
        <div id="case-time">
          <CaseTimePanel caseId={c.id} />
        </div>
      </div>
      <Card id="case-finance-links" title={t('caseLayout.finance.links')} icon={Wallet} padding="sm">
        <p className="type-small mb-3">{t('caseLayout.finance.linksDesc')}</p>
        <ul className="flex flex-wrap gap-2">
          {links.map(({ to, label, icon: I }) => (
            <li key={to}>
              <Link to={to} className="btn-secondary btn-sm">
                <I className="size-3.5" aria-hidden /> {label} <ArrowUpRight className="size-3 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
