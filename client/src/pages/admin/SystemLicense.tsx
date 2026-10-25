import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyRound, Puzzle, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesWhitelabel } from '@/i18n/pagesWhitelabel';
import { adminNavCopy } from '@/i18n/adminNav';
import { DefRow, ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { fmtDate } from '@/components/admin/labels';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { MODULE_KEYS } from '@/components/command/navRegistry';
import type { BadgeTone } from '@/components/ui/status';

registerCopy(pagesWhitelabel);
registerCopy(adminNavCopy);

type Status = 'owner' | 'valid' | 'grace' | 'expired' | 'invalid' | 'missing';
interface LicenseView {
  role: 'owner' | 'customer';
  status: Status;
  mode: 'normal' | 'readonly';
  reason: 'format' | 'signature' | 'payload' | 'domain' | null;
  domain: string;
  customer: string | null;
  licensedDomain: string | null;
  plan: string | null;
  licenseId: string | null;
  modules: string[] | null;
  staffLimit: number | null;
  issuedAt: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  graceEndsAt: string | null;
  graceDays: number;
  staffSeatsUsed: number;
}

const TONE: Record<Status, BadgeTone> = { owner: 'brand', valid: 'success', grace: 'warning', expired: 'danger', invalid: 'danger', missing: 'danger' };

/** System → License (SUPER_ADMIN): the white-label licence of this instance (server lib/license). */
export default function SystemLicense() {
  const { t } = useTranslation();
  usePageTitle(t('wl.license.title'));
  const q = useQuery({ queryKey: ['admin-license'], queryFn: async () => (await api.get<LicenseView>('/admin/license')).data });
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <LoadingBlock />;
  const l = q.data;
  const date = (v: string | null) => (v ? fmtDate(v) : '—');

  return (
    <div className="stack-page">
      <PageHead title={t('wl.license.title')} subtitle={t('wl.license.intro')} />
      <Card title={t('wl.license.status')} icon={KeyRound}>
        <div className="grid gap-3">
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[l.status]} dot>
              {t(`wl.license.statuses.${l.status}`)}
            </Badge>
            {l.reason && <span className="text-sm text-danger-fg">{t(`wl.license.reasons.${l.reason}`)}</span>}
          </p>
          {l.role === 'owner' ? (
            <p className="text-sm text-muted">{t('wl.license.ownerText')}</p>
          ) : (
            <dl className="grid gap-x-6 sm:grid-cols-2">
              <DefRow label={t('wl.license.customer')}>{l.customer ?? '—'}</DefRow>
              <DefRow label={t('wl.license.plan')}>{l.plan ?? '—'}</DefRow>
              <DefRow label={t('wl.license.domain')}>{l.domain}</DefRow>
              <DefRow label={t('wl.license.licensedDomain')}>{l.licensedDomain ?? '—'}</DefRow>
              <DefRow label={t('wl.license.issuedAt')}>{date(l.issuedAt)}</DefRow>
              <DefRow label={t('wl.license.expiresAt')}>{date(l.expiresAt)}</DefRow>
              <DefRow label={t('wl.license.daysLeft')}>{l.daysLeft ?? '—'}</DefRow>
              <DefRow label={t('wl.license.graceEndsAt')}>{date(l.graceEndsAt)}</DefRow>
              <DefRow label={t('wl.license.licenseId')}>{l.licenseId ?? '—'}</DefRow>
            </dl>
          )}
          <p className="text-sm text-muted">{t('wl.license.readonlyRule', { days: l.graceDays })}</p>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t('wl.license.seats')} icon={Users}>
          <p className="text-2xl font-bold text-ink tabular-nums">
            {t('wl.license.seatsValue', { used: l.staffSeatsUsed, limit: l.staffLimit ?? t('wl.license.unlimited') })}
          </p>
        </Card>
        <Card title={t('wl.license.modules')} icon={Puzzle}>
          {l.modules === null ? (
            <p className="text-sm text-muted">{t('wl.license.allModules')}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {MODULE_KEYS.map((k) => (
                <li key={k}>
                  <Badge tone={l.modules!.includes(k) ? 'success' : 'neutral'}>
                    {t(`anav.modules.${k}.title`)}
                    {!l.modules!.includes(k) && ` · ${t('wl.license.notInPlan')}`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {l.role !== 'owner' && (
        <Card title={t('wl.license.howTo')} icon={KeyRound}>
          <p className="text-sm text-muted">{t('wl.license.howToText')}</p>
        </Card>
      )}
    </div>
  );
}
