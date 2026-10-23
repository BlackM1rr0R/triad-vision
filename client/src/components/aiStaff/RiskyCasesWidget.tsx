import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ShieldAlert, Lightbulb } from 'lucide-react';
import { api } from '@/lib/api';
import { Panel } from '@/components/admin/ui';
import { Spinner } from '@/components/ui/Spinner';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { uiLocale } from './shared';
import { BriefingToggle } from './BriefingSettings';

type Severity = 'high' | 'medium' | 'low';
interface RiskyCase {
  caseId: string;
  number: string;
  clientName: string;
  staff: { id: string; name: string } | null;
  severity: Severity;
  risks: { code: string; severity: Severity; title: string; suggestion: string }[];
}
interface RisksResponse {
  items: RiskyCase[];
  staff: { id: string; name: string }[];
}

const TONE: Record<Severity, string> = toneClasses(STATUS_TONES.severity);
const SHOWN = 6;

/** "Diqqət tələb edən müraciətlər" on the admin dashboard: deterministic risk rules, own cases by default. */
export const RiskyCasesWidget = ({ showBriefing = false }: { showBriefing?: boolean }) => {
  const { t } = useTranslation();
  const [staffId, setStaffId] = useState<string>('me');
  const [expanded, setExpanded] = useState(false);
  const locale = uiLocale();
  const { data, isLoading } = useQuery({
    queryKey: ['ai-staff', 'risks', staffId, locale],
    queryFn: async () => (await api.get<RisksResponse>('/admin/ai-staff/risks', { params: { ...(staffId === 'me' ? {} : { staffId }), locale } })).data,
    refetchInterval: 5 * 60_000,
  });
  const items = data?.items ?? [];
  const shown = expanded ? items : items.slice(0, SHOWN);

  return (
    <Panel
      title={t('aiStaff.risks.title')}
      icon={ShieldAlert}
      bodyClassName="p-0"
      actions={
        <>
          {items.length > 0 && <span className="text-xs text-muted tabular-nums">{t('aiStaff.risks.count', { count: items.length })}</span>}
          <label className="sr-only" htmlFor="risk-staff">
            {t('aiStaff.risks.staff')}
          </label>
          <select id="risk-staff" className="input h-8 w-auto py-0 text-xs" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="me">{t('aiStaff.risks.mine')}</option>
            <option value="all">{t('aiStaff.risks.all')}</option>
            <option value="none">{t('aiStaff.risks.unassigned')}</option>
            {(data?.staff ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </>
      }
    >
      {isLoading ? (
        <div className="grid place-items-center py-8 text-brand-600">
          <Spinner className="size-5" />
        </div>
      ) : items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted sm:px-6">{t('aiStaff.risks.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((c) => (
            <li key={c.caseId} className="px-5 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={clsx('badge text-[10px]', TONE[c.severity])}>{t(`aiStaff.risks.severity.${c.severity}`)}</span>
                <Link to={`/admin/cases/${c.caseId}`} className="text-sm font-semibold text-navy-900 hover:text-brand-700 hover:underline">
                  {c.number}
                </Link>
                <span className="truncate text-sm text-ink">{c.clientName}</span>
                {c.staff && <span className="text-xs text-muted">· {c.staff.name}</span>}
              </div>
              <ul className="mt-1.5 space-y-1">
                {c.risks.slice(0, 2).map((r, i) => (
                  <li key={`${r.code}-${i}`} className="text-xs">
                    <p className={clsx('font-medium', r.severity === 'high' ? 'text-red-700' : 'text-ink')}>{r.title}</p>
                    <p className="flex items-start gap-1 text-muted">
                      <Lightbulb className="mt-px size-3 shrink-0" aria-hidden /> {r.suggestion}
                    </p>
                  </li>
                ))}
                {c.risks.length > 2 && <li className="text-[11px] text-muted">+ {t('aiStaff.risks.more', { count: c.risks.length - 2 })}</li>}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {(items.length > SHOWN || showBriefing) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-2.5 sm:px-6">
          {items.length > SHOWN ? (
            <button type="button" className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => setExpanded((v) => !v)}>
              {expanded ? t('aiStaff.risks.showLess') : t('aiStaff.risks.showAll', { count: items.length })}
            </button>
          ) : (
            <span />
          )}
          {showBriefing && <BriefingToggle compact />}
        </div>
      )}
    </Panel>
  );
};
