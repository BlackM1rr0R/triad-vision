import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BellRing } from 'lucide-react';
import { api } from '@/lib/api';
import type { CaseStatus } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesPermits } from '@/i18n/pagesPermits';
import { Panel } from '@/components/admin/ui';
import { fmtDate, toastError } from '@/components/admin/labels';
import { TONE_CLASS, type ExpiryTone } from '@/components/expiry/Expiry';

registerCopy(pagesPermits);

// GET /api/admin/permits/cases/:id (server lib/permits/service.ts casePermits)
export type PermitItem = 'residence' | 'blueCard' | 'passport' | 'insurance';
type TitleKind = 'RESIDENCE_PERMIT' | 'EU_BLUE_CARD';
interface ItemView {
  item: PermitItem;
  expiresAt: string;
  daysLeft: number;
  tone: ExpiryTone;
  remindedWindows: number[];
  nextReminderAt: string | null;
}
interface Permits {
  caseId: string;
  status: CaseStatus;
  active: boolean;
  residenceTitleKind: TitleKind | null;
  residenceTitleExpiresAt: string | null;
  healthInsuranceExpiresAt: string | null;
  passportExpiry: string | null;
  passportByCaseReminders: boolean;
  items: ItemView[];
  settings: { enabled: boolean; windows: Record<PermitItem, number[]> };
}

/** Also invalidated by RenewalPanel when the title date changes. */
export const permitsKey = (caseId: string) => ['case-permits', caseId] as const;
const day = (iso: string | null) => iso?.slice(0, 10) ?? '';

/** Days-left chip shared with the portal card. */
export const PermitChip = ({ tone, days }: { tone: ExpiryTone; days: number }) => {
  const { t } = useTranslation();
  return (
    <span className={clsx('badge whitespace-nowrap tabular-nums', TONE_CLASS[tone])}>{tone === 'expired' ? t('permits.tone.expired') : tone === 'ok' ? t('permits.tone.ok') : t('permits.daysLeft', { count: days })}</span>
  );
};

/**
 * Admin case page (Gəlişdən sonra): which residence title the worker holds (Blue Card or ordinary permit),
 * the health insurance and passport end dates, and per item which reminders were sent and when the next
 * one goes out. The title date itself is edited in RenewalPanel (it also drives the renewal case).
 */
export const PermitPanel = ({ caseId, status }: { caseId: string; status: CaseStatus }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: permitsKey(caseId), queryFn: async () => (await api.get<{ permits: Permits }>(`/admin/permits/cases/${caseId}`)).data.permits });
  const [kind, setKind] = useState<TitleKind>('RESIDENCE_PERMIT');
  const [insurance, setInsurance] = useState('');
  const [passport, setPassport] = useState('');
  const p = q.data;
  useEffect(() => {
    if (!p) return;
    setKind(p.residenceTitleKind ?? 'RESIDENCE_PERMIT');
    setInsurance(day(p.healthInsuranceExpiresAt));
    setPassport(day(p.passportExpiry));
  }, [p]);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch<{ permits: Permits }>(`/admin/permits/cases/${caseId}`, {
          residenceTitleKind: kind,
          healthInsuranceExpiresAt: insurance || null,
          passportExpiry: passport || null,
        })
      ).data.permits,
    onSuccess: (permits) => (qc.setQueryData(permitsKey(caseId), permits), toast.success(t('permits.admin.saved'))),
    onError: (e) => toastError(e),
  });

  if (!p) return null;
  if (status !== 'APPROVED' && !p.healthInsuranceExpiresAt && !p.residenceTitleExpiresAt) return null;
  const dirty = kind !== (p.residenceTitleKind ?? 'RESIDENCE_PERMIT') || insurance !== day(p.healthInsuranceExpiresAt) || passport !== day(p.passportExpiry);
  const sentLabel = (w: number) => (w === 0 ? t('permits.admin.expiredNotice') : `${w}`);

  return (
    <Panel title={t('permits.admin.title')} icon={BellRing} id="case-permits" bodyClassName="p-4 sm:p-5 space-y-4">
      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="block min-w-0">
          <span className="label">{t('permits.admin.kind')}</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as TitleKind)}>
            {(['RESIDENCE_PERMIT', 'EU_BLUE_CARD'] as const).map((k) => (
              <option key={k} value={k}>
                {t(`permits.admin.kinds.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="label">{t('permits.admin.insurance')}</span>
          <input type="date" className="input" value={insurance} onChange={(e) => setInsurance(e.target.value)} />
        </label>
        <label className="block min-w-0">
          <span className="label">{t('permits.admin.passport')}</span>
          <input type="date" className="input" value={passport} onChange={(e) => setPassport(e.target.value)} />
        </label>
        <div className="sm:col-span-3">
          <button type="submit" className="btn-primary btn-sm" disabled={save.isPending || !dirty}>
            {t('permits.admin.save')}
          </button>
        </div>
      </form>
      <p className="text-[11px] text-muted">{t('permits.admin.titleDateHint')}</p>
      {!p.settings.enabled ? (
        <p className="text-xs text-muted">{t('permits.admin.off')}</p>
      ) : (
        !p.active && <p className="text-xs text-muted">{t('permits.admin.inactive')}</p>
      )}
      {p.passportByCaseReminders && p.passportExpiry && <p className="text-xs text-muted">{t('permits.admin.passportByCase')}</p>}
      {p.items.length === 0 ? (
        p.active && <p className="text-sm text-muted">{t('permits.admin.none')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {p.items.map((i) => (
            <li key={i.item} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 font-medium text-ink">
                {t(`permits.items.${i.item}`)} <span className="font-normal text-muted">· {fmtDate(i.expiresAt)}</span>
              </span>
              <PermitChip tone={i.tone} days={i.daysLeft} />
              <span className="w-full text-[11px] text-muted">
                {t('permits.admin.windows', { list: p.settings.windows[i.item].join(' / ') })} ·{' '}
                {i.remindedWindows.length ? t('permits.admin.reminded', { list: i.remindedWindows.map(sentLabel).join(', ') }) : t('permits.admin.remindedNone')}
                {i.nextReminderAt && ` · ${t('permits.admin.next', { date: fmtDate(i.nextReminderAt) })}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};

export default PermitPanel;
