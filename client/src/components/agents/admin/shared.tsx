import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { errorCode } from '@/lib/api';
import { agentError } from '../types';

/** Toast for an API error: zod issue codes (INVALID_IBAN, INVALID_CODE…) first, then the error code. */
export const useAgentToastError = () => {
  const { t } = useTranslation();
  return (err: unknown) => {
    const issue = (err as { response?: { data?: { issues?: { message?: string }[] } } }).response?.data?.issues?.[0]?.message;
    toast.error(agentError(t, issue && /^[A-Z_]+$/.test(issue) ? issue : errorCode(err)));
  };
};

/** Agents | Commissions tab strip at the top of /admin/agents/*. */
export const AgentsTabs = () => {
  const { t } = useTranslation();
  const cls = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'inline-flex min-h-10 items-center rounded-lg px-3.5 text-sm font-semibold transition',
      isActive ? 'bg-navy-900 text-white' : 'text-ink/75 hover:bg-surface hover:text-ink',
    );
  return (
    <nav className="mb-5 flex gap-1 rounded-xl border border-line bg-card p-1" aria-label={t('agents.admin.title')}>
      <NavLink to="/admin/agents" end className={cls}>
        {t('agents.admin.tabs.agents')}
      </NavLink>
      <NavLink to="/admin/agents/commissions" className={cls}>
        {t('agents.admin.tabs.commissions')}
      </NavLink>
    </nav>
  );
};

/** cents ↔ "150.00" and bps ↔ "12.5" for the terms inputs. */
export const toUnits = (v: number) => String(Math.round(v) / 100);
export const fromUnits = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
