import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Ban, Download, FileSpreadsheet, FolderOpen, FolderPlus, Info, KeyRound, Receipt } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBlock, LoadingBlock, OnlineDot } from '@/components/admin/ui';
import { fmtDate } from '@/components/admin/labels';
import { money } from '@/components/agents/format';
import { CommissionsPanel } from '../Commissions';
import { RefusalReport } from '../RefusalReport';
import { PortalLoginPanel } from '../PortalLogin';
import { OwnershipPanel, type OwnedClient, type PartnerOwnershipFields } from '../Ownership';
import { invalidatePartnerViews } from '../DeletePartnerDialog';
import { PARTNERS_KEY, partnerError, type Partner, type PartnerCase } from '../api';
import { useVisaKinds } from './ClientsTab';
import type { PartnerStats } from './types';

type Bag = Partial<Record<string, number>>;
interface SettlementRow {
  id: string;
  project: string;
  clientName: string;
  case: { id: string; number: string } | null;
  stage: 'NEW' | 'IN_PROGRESS' | 'VISA' | 'REFUSED' | 'CANCELLED';
  amountCents: number | null;
  currency: string;
  paidCents: number;
  partnerShareCents: number | null;
  partnerShareCurrency: string;
  partnerPaid: boolean;
  month: string;
}
interface SettlementResponse {
  rows: SettlementRow[];
  totals: { count: number; partner: { total: Bag; pending: Bag; paid: Bag } };
}

const bag = (b: Bag) =>
  Object.entries(b)
    .filter(([, v]) => !!v)
    .map(([cur, v]) => money(v!, cur))
    .join(' + ') || '0';

/** "Komissiyalar": the partner's commissions (shared panel) and the partner's rows of the settlement ledger. */
export const CommissionsTab = ({ partner, isAdmin }: { partner: Partner; isAdmin: boolean }) => {
  const { t } = useTranslation();
  const settlements = useQuery({
    queryKey: [...PARTNERS_KEY, 'settlements', partner.id],
    queryFn: async () => (await api.get<SettlementResponse>(`/admin/partners/${partner.id}/settlements`)).data,
  });
  const s = settlements.data;
  return (
    <div className="space-y-4">
      <CommissionsPanel partnerId={partner.id} isAdmin={isAdmin} />
      <section className="rounded-xl border border-line bg-card">
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <Receipt className="size-4 text-link" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink">
              {t('partnerHub.commissions.settlements')} {s && <span className="code-id text-xs font-medium text-muted">{s.totals.count}</span>}
            </h2>
            <p className="text-xs text-muted">{t('partnerHub.commissions.settlementsHint')}</p>
          </div>
          <Link to="/admin/settlements" className="btn-secondary btn-sm">
            {t('partnerHub.commissions.openLedger')}
          </Link>
        </header>
        {settlements.isLoading ? (
          <LoadingBlock />
        ) : settlements.error || !s ? (
          <ErrorBlock error={settlements.error} onRetry={() => settlements.refetch()} />
        ) : s.rows.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted">{t('partnerHub.commissions.none')}</p>
        ) : (
          <>
            <p className="border-b border-line px-4 py-2 text-xs text-muted sm:px-5">
              {t('partnerHub.commissions.totals', { total: bag(s.totals.partner.total), pending: bag(s.totals.partner.pending), paid: bag(s.totals.partner.paid) })}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-line bg-surface/70 text-xs font-medium whitespace-nowrap text-muted">
                  <tr>
                    <th className="px-4 py-2">{t('partnerHub.commissions.th.client')}</th>
                    <th className="px-4 py-2">{t('partnerHub.commissions.th.project')}</th>
                    <th className="px-4 py-2">{t('partnerHub.commissions.th.stage')}</th>
                    <th className="px-4 py-2 text-right">{t('partnerHub.commissions.th.amount')}</th>
                    <th className="px-4 py-2 text-right">{t('partnerHub.commissions.th.paid')}</th>
                    <th className="px-4 py-2 text-right">{t('partnerHub.commissions.th.share')}</th>
                    <th className="px-4 py-2">{t('partnerHub.commissions.th.shareStatus')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {s.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-ink">{r.clientName}</p>
                        {r.case && (
                          <Link to={`/admin/cases/${r.case.id}`} className="code-id text-xs text-link hover:underline">
                            {r.case.number}
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted">{r.project}</td>
                      <td className="px-4 py-2.5 text-xs">{t(`partnerHub.commissions.stages.${r.stage}`)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.amountCents != null ? money(r.amountCents, r.currency) : '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(r.paidCents, r.currency)}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{r.partnerShareCents != null ? money(r.partnerShareCents, r.partnerShareCurrency) : '—'}</td>
                      <td className="px-4 py-2.5">
                        {r.partnerShareCents ? (
                          <span className={clsx('badge', r.partnerPaid ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg')}>
                            {r.partnerPaid ? t('partnerHub.commissions.sharePaid') : t('partnerHub.commissions.sharePending')}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

/** "Viza növləri": the partner's cases by visa kind with active / approved / refused and the refusal rate. */
export const VisasTab = ({ partner, cases }: { partner: Partner; cases: PartnerCase[] }) => {
  const { t } = useTranslation();
  const kinds = useVisaKinds(cases);
  return (
    <div className="space-y-4">
    <section className="rounded-xl border border-line bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">{t('partnerHub.visas.title')}</h2>
          <p className="text-xs text-muted">{t('partnerHub.visas.hint')}</p>
        </div>
        <Link to="/admin/partners/refusals" className="btn-secondary btn-sm">
          <Ban className="size-3.5" aria-hidden /> {t('partnerHub.visas.openRefusals')}
        </Link>
      </header>
      {kinds.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted">{t('partnerHub.visas.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="border-b border-line bg-surface/70 text-xs font-medium whitespace-nowrap text-muted">
              <tr>
                <th className="px-4 py-2">{t('partnerHub.visas.th.kind')}</th>
                <th className="px-4 py-2 text-right">{t('partnerHub.visas.th.cases')}</th>
                <th className="px-4 py-2 text-right">{t('partnerHub.visas.th.active')}</th>
                <th className="px-4 py-2 text-right">{t('partnerHub.visas.th.approved')}</th>
                <th className="px-4 py-2 text-right">{t('partnerHub.visas.th.refused')}</th>
                <th className="px-4 py-2">{t('partnerHub.visas.th.rate')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {kinds.map((k) => {
                const decided = k.approved + k.refused;
                const rate = decided ? Math.round((k.refused / decided) * 100) : null;
                return (
                  <tr key={k.key}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-ink">{k.label}</p>
                      {k.sub && <p className="text-xs text-muted">{k.sub}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{k.count}</td>
                    <td className="px-4 py-2.5 text-right text-link tabular-nums">{k.active}</td>
                    <td className="px-4 py-2.5 text-right text-success-fg tabular-nums">{k.approved}</td>
                    <td className="px-4 py-2.5 text-right text-danger-fg tabular-nums">{k.refused}</td>
                    <td className="px-4 py-2.5">
                      {rate == null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-sunken" aria-hidden>
                            <span className="block h-full rounded-full bg-danger" style={{ width: `${rate}%` }} />
                          </span>
                          <span className="text-xs tabular-nums">{rate}%</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
      {/* Refusals of the partner's clients by employer company (the former "rədd" tab). */}
      <div className="space-y-2">
        <p className="text-sm text-muted">{t('refPartners.refusals.companiesOfPartner')}</p>
        <RefusalReport partnerId={partner.id} />
      </div>
    </div>
  );
};

/** "Sənədlər": the partner's drive folder (open / create / restore) and the Excel client list. */
export const DocumentsTab = ({ partner }: { partner: Partner }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const openFolder = useMutation({
    mutationFn: async () => (await api.post<{ folderId: string; restored: boolean; created: boolean }>(`/admin/partners/${partner.id}/folder`)).data,
    onSuccess: (r) => {
      if (r.restored) toast.success(t('refPartners.folderRestored'));
      else if (r.created) toast.success(t('refPartners.folderCreated'));
      void invalidatePartnerViews(qc);
      navigate(`/workspace/drive/f/${encodeURIComponent(r.folderId)}`);
    },
    onError: partnerError,
  });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-xl border border-line bg-card p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <FolderOpen className="size-4 text-link" aria-hidden /> {t('partnerHub.documents.folder')}
        </h3>
        <p className="mt-1 text-xs text-muted">{t('partnerHub.documents.folderHint', { name: partner.name })}</p>
        <button type="button" className="btn-primary btn-sm mt-3" onClick={() => openFolder.mutate()} disabled={openFolder.isPending}>
          {openFolder.isPending ? <Spinner className="size-3.5" /> : partner.folderId === null ? <FolderPlus className="size-3.5" /> : <FolderOpen className="size-3.5" />}{' '}
          {partner.folderId === null ? t('partnerHub.documents.create') : t('partnerHub.documents.open')}
        </button>
      </section>
      <section className="rounded-xl border border-line bg-card p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <FileSpreadsheet className="size-4 text-link" aria-hidden /> {t('partnerHub.documents.excel')}
        </h3>
        <p className="mt-1 text-xs text-muted">{t('partnerHub.documents.excelHint')}</p>
        <a href={`/api/admin/partners/${partner.id}/export.xlsx`} className="btn-secondary btn-sm mt-3" download>
          <Download className="size-3.5" aria-hidden /> {t('partnerHub.documents.download')}
        </a>
      </section>
      <p className="flex items-center gap-1.5 text-xs text-muted md:col-span-2">
        <Info className="size-3.5 shrink-0" aria-hidden /> {t('partnerHub.documents.contractsHint')}
      </p>
    </div>
  );
};

/** "Portal": login status and invite / reset (PortalLoginPanel), sign-up code, rules, visibility and own clients. */
export const PortalTab = ({ partner, ownedClients, isAdmin, stats }: { partner: Partner & PartnerOwnershipFields; ownedClients: OwnedClient[]; isAdmin: boolean; stats?: PartnerStats }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <section className="rounded-xl border border-line bg-card p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <KeyRound className="size-4 text-link" aria-hidden /> {t('partnerHub.portal.access')}
          </h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-medium text-muted">{t('partnerHub.portal.lastSeen')}</dt>
              <dd className="mt-0.5 text-sm">
                {stats?.portal.hasLogin ? <OnlineDot online={false} lastSeenAt={stats.portal.lastSeenAt} /> : <span className="text-muted">{t('partnerHub.portal.noLogin')}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-muted">{t('partnerHub.portal.visibility')}</dt>
              <dd className="mt-0.5 text-sm text-ink">{partner.visibility ? t(`partnerHub.portal.visibilities.${partner.visibility}`) : '—'}</dd>
            </div>
            {partner.login?.createdAt && (
              <div>
                <dt className="text-[11px] font-medium text-muted">{t('partnerHub.info.created')}</dt>
                <dd className="mt-0.5 text-sm text-ink">{fmtDate(partner.login.createdAt)}</dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs text-muted">{t('partnerHub.portal.settingsHint')}</p>
        </section>
        <PortalLoginPanel partner={partner} isAdmin={isAdmin} />
      </div>
      <OwnershipPanel partner={partner} ownedClients={ownedClients} isAdmin={isAdmin} />
    </div>
  );
};
