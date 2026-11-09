import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, Building2, ExternalLink, Pencil, UserPlus, UserRound, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPartnerHub } from '@/i18n/pagesPartnerHub';
import { Drawer } from '@/components/admin/Drawer';
import { ErrorBlock, LoadingBlock } from '@/components/admin/ui';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { fmtDate, fmtRelative, fullName } from '@/components/admin/labels';
import { money } from '@/components/agents/format';
import { PARTNERS_KEY, type Partner, type PartnerCase } from './api';
import type { OwnedClient, PartnerOwnershipFields } from './Ownership';
import { PartnerFormDialog } from './PartnerForm';
import { AddClientsDialog } from './AddClientsDialog';
import { QuotaMeter } from './QuotaMeter';
import { ContractBadge } from './hub/parts';
import { InfoTab } from './hub/InfoTab';
import { PARTNER_STATS_KEY, type PartnerStats } from './hub/types';

registerCopy(pagesPartnerHub);

type Detail = { partner: Partner & PartnerOwnershipFields; cases: PartnerCase[]; ownedClients?: OwnedClient[] };

const RECENT = 8;

const Stat = ({ label, value, tone }: { label: string; value: ReactNode; tone?: 'warning' | 'success' | 'danger' }) => (
  <div className="min-w-0 rounded-lg bg-sunken px-3 py-2">
    <dt className="truncate text-[11px] font-medium text-muted">{label}</dt>
    <dd className={clsx('mt-0.5 truncate text-sm font-semibold tabular-nums', tone === 'warning' ? 'text-warning-fg' : tone === 'success' ? 'text-success-fg' : tone === 'danger' ? 'text-danger-fg' : 'text-ink')}>{value}</dd>
  </div>
);

/**
 * The "ⓘ" panel of the partner list: everything about one partner without leaving the list — quota
 * progress, key figures, latest clients, contract, and every profile field (the profile page's InfoTab),
 * with links to the full profile, editing and "add clients". Data: GET /admin/partners/:id and /:id/stats
 * (the same queries as the profile page, so both stay in sync).
 */
export const PartnerInfoDrawer = ({ partnerId, onClose, isAdmin }: { partnerId: string | null; onClose: () => void; isAdmin: boolean }) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const id = partnerId ?? '';
  const detail = useQuery({
    queryKey: [...PARTNERS_KEY, 'one', id],
    queryFn: async () => (await api.get<Detail>(`/admin/partners/${id}`)).data,
    enabled: !!partnerId,
  });
  const statsQ = useQuery({
    queryKey: PARTNER_STATS_KEY(id),
    queryFn: async () => (await api.get<{ stats: PartnerStats }>(`/admin/partners/${id}/stats`)).data.stats,
    enabled: !!partnerId,
  });
  const partner = detail.data?.partner;
  const stats = statsQ.data;
  const cases = detail.data?.cases ?? [];
  const owned = detail.data?.ownedClients ?? [];
  const cur = stats?.commissions.currency ?? partner?.currency ?? 'EUR';
  const company = partner?.partnerType === 'COMPANY';
  // Latest clients: newest case per client, then owned clients without a case.
  const seen = new Set<string>();
  const recent: { id: string; name: string; to: string | null; caseNumber: string | null; status: PartnerCase['status'] | null; at: string }[] = [];
  for (const c of cases) {
    if (seen.has(c.client.id)) continue;
    seen.add(c.client.id);
    recent.push({ id: c.client.id, name: fullName(c.client), to: `/admin/cases/${c.id}`, caseNumber: c.number, status: c.status, at: c.createdAt });
  }
  for (const u of owned) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    recent.push({ id: u.id, name: fullName(u), to: `/admin/users?search=${encodeURIComponent(u.email)}`, caseNumber: null, status: null, at: u.ownerPartnerAt ?? u.createdAt });
  }
  recent.sort((a, b) => b.at.localeCompare(a.at));
  const quota = stats?.quota ?? partner?.quota;
  const totalClients = stats?.clients.total ?? seen.size;

  return (
    <>
      <Drawer
        open={!!partnerId}
        onClose={onClose}
        width="xl"
        title={
          <span className="inline-flex min-w-0 items-center gap-2">
            {company ? <Building2 className="size-4 shrink-0 text-link" aria-hidden /> : <UserRound className="size-4 shrink-0 text-link" aria-hidden />}
            <span className="truncate">{partner?.name ?? t('partnerQuota.info.button')}</span>
          </span>
        }
        description={partner && [company && partner.companyName !== partner.name ? partner.companyName : null, partner.code, [partner.city, partner.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
        footer={
          partner && (
            <>
              {isAdmin && (
                <button type="button" className="btn-secondary btn-sm mr-auto" onClick={() => setEditing(true)}>
                  <Pencil className="size-3.5" aria-hidden /> {t('partnerQuota.info.edit')}
                </button>
              )}
              <Link to={`/admin/partners/${partner.id}`} className="btn-primary btn-sm" onClick={onClose}>
                <ExternalLink className="size-3.5" aria-hidden /> {t('partnerQuota.info.openProfile')}
              </Link>
            </>
          )
        }
        bodyClassName="space-y-4"
      >
        {detail.isLoading ? (
          <LoadingBlock />
        ) : detail.error || !partner ? (
          <ErrorBlock error={detail.error} onRetry={() => detail.refetch()} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="badge bg-sunken text-ink/80">{t(`partnerHub.list.type.${partner.partnerType ?? 'INDIVIDUAL'}`)}</span>
              {partner.active ? <span className="badge bg-success-bg text-success-fg">{t('refPartners.filter.active')}</span> : <span className="badge bg-sunken text-muted">{t('partnerHub.header.inactive')}</span>}
              <ContractBadge contract={stats?.contract ?? partner.contract} />
            </div>

            <section className="rounded-xl border border-line bg-card p-4" aria-labelledby={`pq-overview-${partner.id}`}>
              <h3 id={`pq-overview-${partner.id}`} className="mb-3 text-sm font-semibold text-ink">
                {t('partnerQuota.info.overview')}
              </h3>
              {quota?.needed != null ? <QuotaMeter quota={quota} className="mb-3" /> : <p className="mb-3 text-xs text-muted">{t('partnerQuota.title')}: {t('partnerQuota.noTarget')}</p>}
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label={t('partnerQuota.info.clients')} value={stats?.clients.total ?? '…'} />
                <Stat label={t('partnerQuota.info.activeCases')} value={stats?.cases.active ?? partner.counts.activeCases} />
                <Stat label={t('partnerQuota.info.visas')} value={stats?.cases.approved ?? partner.counts.approved} tone={stats && stats.cases.approved > 0 ? 'success' : undefined} />
                <Stat label={t('partnerQuota.info.refusals')} value={stats?.cases.refused ?? partner.counts.rejected ?? 0} tone={stats && stats.cases.refused > 0 ? 'danger' : undefined} />
                <Stat label={t('partnerQuota.info.earned')} value={stats ? money(stats.commissions.earnedCents, cur) : '…'} />
                <Stat label={t('partnerQuota.info.pending')} value={stats ? money(stats.commissions.pendingCents, cur) : '…'} tone={stats && stats.commissions.pendingCents > 0 ? 'warning' : undefined} />
                <Stat label={t('partnerQuota.info.paid')} value={stats ? money(stats.commissions.paidCents, cur) : '…'} tone={stats && stats.commissions.paidCents > 0 ? 'success' : undefined} />
                <Stat label={t('partnerQuota.info.lastActivity')} value={stats?.lastActivityAt ? <span title={fmtDate(stats.lastActivityAt)}>{fmtRelative(stats.lastActivityAt)}</span> : '—'} />
              </dl>
            </section>

            <section className="rounded-xl border border-line bg-card" aria-labelledby={`pq-clients-${partner.id}`}>
              <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                <Users className="size-4 text-link" aria-hidden />
                <h3 id={`pq-clients-${partner.id}`} className="text-sm font-semibold text-ink">
                  {t('partnerQuota.info.recentClients')}
                </h3>
                <button type="button" className="btn-secondary btn-sm ml-auto" onClick={() => setAdding(true)}>
                  <UserPlus className="size-3.5" aria-hidden /> {t('partnerQuota.info.addClients')}
                </button>
              </header>
              {recent.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">{t('partnerQuota.info.noClients')}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {recent.slice(0, RECENT).map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                      {r.to ? (
                        <Link to={r.to} className="min-w-0 flex-1 truncate font-medium text-ink hover:text-link" onClick={onClose}>
                          {r.name}
                        </Link>
                      ) : (
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.name}</span>
                      )}
                      {r.caseNumber && <span className="code-id hidden text-xs text-muted sm:inline">{r.caseNumber}</span>}
                      {r.status ? <StatusBadge status={r.status} /> : <span className="badge bg-sunken text-muted">{t('partnerHub.clients.noCase')}</span>}
                      <span className="hidden w-20 text-right text-xs whitespace-nowrap text-muted sm:inline">{fmtDate(r.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {totalClients > 0 && (
                <div className="border-t border-line px-4 py-2.5">
                  <Link to={`/admin/partners/${partner.id}?tab=clients`} className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline" onClick={onClose}>
                    {t('partnerQuota.info.allClients', { count: totalClients })} <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
              )}
            </section>

            {/* Every profile field: the same cards as the profile page's "Məlumat" tab. */}
            <InfoTab partner={partner} canEdit={isAdmin} onEdit={() => setEditing(true)} />
          </>
        )}
      </Drawer>
      {partner && <PartnerFormDialog open={editing} partner={partner} onClose={() => setEditing(false)} />}
      <AddClientsDialog partner={adding && partner ? partner : null} onClose={() => setAdding(false)} />
    </>
  );
};
