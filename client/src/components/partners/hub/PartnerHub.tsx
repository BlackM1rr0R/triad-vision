import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  ArrowLeft,
  Ban,
  BadgeCheck,
  Building2,
  Check,
  Clock3,
  Coins,
  Copy,
  Download,
  FileSignature,
  FolderOpen,
  History,
  Info,
  KeyRound,
  Pencil,
  Plane,
  Trash2,
  UserRound,
  Users,
  Contact,
} from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPartnerHub } from '@/i18n/pagesPartnerHub';
import { usePageTitle } from '@/lib/usePageTitle';
import { ErrorBlock, KpiCell, KpiStrip, LoadingBlock, SegmentBar } from '@/components/admin/ui';
import { Tabs, TabPanel, useTabParam } from '@/components/ui/Tabs';
import { fmtDate, fmtRelative } from '@/components/admin/labels';
import { money } from '@/components/agents/format';
import { PROCESSING_STAGES, stageLabel } from '@/components/caseProcessing/api';
import { PARTNERS_KEY, type Partner, type PartnerCase } from '../api';
import { PartnerFormDialog } from '../PartnerForm';
import { DeletePartnerDialog } from '../DeletePartnerDialog';
import type { OwnedClient, PartnerOwnershipFields } from '../Ownership';
import { ContractBadge, ReadinessMeter } from './parts';
import { InfoTab } from './InfoTab';
import { ClientsTab } from './ClientsTab';
import { CommissionsTab, DocumentsTab, PortalTab, VisasTab } from './OtherTabs';
import { ContactsTab, ContractsTab, HistoryTab } from './RecordsTabs';
import { PARTNER_STATS_KEY, type PartnerStats } from './types';

registerCopy(pagesPartnerHub);

const TABS = ['info', 'contracts', 'clients', 'commissions', 'visas', 'documents', 'contacts', 'history', 'portal'] as const;
type TabKey = (typeof TABS)[number];
const TAB_ICON = { info: Info, contracts: FileSignature, clients: Users, commissions: Coins, visas: Plane, documents: FolderOpen, contacts: Contact, history: History, portal: KeyRound } as const;
const STAGE_TONE: Record<string, string> = { IN_PROGRESS: 'bg-info', WRITTEN: 'bg-warning', DONE: 'bg-success', REFUSED: 'bg-danger' };

type Detail = { partner: Partner & PartnerOwnershipFields; cases: PartnerCase[]; ownedClients?: OwnedClient[] };

const CopyLink = ({ value }: { value: string }) => {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost btn-sm !px-1.5"
      title={t('partnerHub.header.copyLink')}
      aria-label={t('partnerHub.header.copyLink')}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked: the link stays visible in the Portal tab */
        }
      }}
    >
      {done ? <Check className="size-3.5 text-success-fg" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      <span className="sr-only" aria-live="polite">
        {done ? t('partnerHub.header.copied') : ''}
      </span>
    </button>
  );
};

/**
 * /admin/partners/:id — the full profile of a referral partner: header with key figures and contract
 * status, and tabs (?tab=…) for data, contracts, clients, commissions, visa kinds, documents, contact
 * persons, history and the partner portal.
 */
export const PartnerHub = ({ isAdmin }: { isAdmin: boolean }) => {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam<TabKey>('tab', TABS, 'info');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const detail = useQuery({
    queryKey: [...PARTNERS_KEY, 'one', id],
    queryFn: async () => (await api.get<Detail>(`/admin/partners/${id}`)).data,
  });
  const statsQ = useQuery({
    queryKey: PARTNER_STATS_KEY(id),
    queryFn: async () => (await api.get<{ stats: PartnerStats }>(`/admin/partners/${id}/stats`)).data.stats,
  });
  usePageTitle(detail.data?.partner.name ?? t('refPartners.title'));

  if (detail.isLoading) return <LoadingBlock />;
  if (detail.error || !detail.data) return <ErrorBlock error={detail.error} onRetry={() => detail.refetch()} />;
  const { partner, cases } = detail.data;
  const owned = detail.data.ownedClients ?? [];
  const stats = statsQ.data;
  const cur = stats?.commissions.currency ?? partner.currency ?? 'EUR';
  const company = partner.partnerType === 'COMPANY';
  const title = company && partner.companyName && partner.companyName !== partner.name ? partner.companyName : partner.name;

  const counts: Partial<Record<TabKey, number>> = {
    clients: cases.length,
    contacts: stats?.counts.contacts,
    contracts: stats?.contract.count,
    history: stats?.counts.activities,
  };

  return (
    <div className="min-w-0">
      <Link to="/admin/partners" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-link">
        <ArrowLeft className="size-3.5" aria-hidden /> {t('partnerHub.header.back')}
      </Link>

      {/* Header */}
      <header className="mb-4 rounded-xl border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/[0.08] text-link" aria-hidden>
                {company ? <Building2 className="size-5" /> : <UserRound className="size-5" />}
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold tracking-tight text-ink">{title}</h1>
                {title !== partner.name && <p className="truncate text-sm text-muted">{partner.name}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="badge bg-sunken text-ink/80">{t(`partnerHub.list.type.${partner.partnerType ?? 'INDIVIDUAL'}`)}</span>
                  {partner.active ? (
                    <span className="badge bg-success-bg text-success-fg">{t('refPartners.filter.active')}</span>
                  ) : (
                    <span className="badge bg-sunken text-muted">{t('partnerHub.header.inactive')}</span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5">
                    <span className="text-muted">{t('partnerHub.header.code')}:</span>
                    <span className="code-id font-semibold text-ink">{partner.code ?? t('partnerHub.header.noCode')}</span>
                    {partner.shareLink && <CopyLink value={partner.shareLink} />}
                  </span>
                  <ContractBadge contract={stats?.contract ?? partner.contract} compact />
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <a href={`/api/admin/partners/${partner.id}/export.xlsx`} className="btn-secondary btn-sm" download>
              <Download className="size-3.5" aria-hidden /> {t('refPartners.download')}
            </a>
            {isAdmin && (
              <>
                <button type="button" className="btn-primary btn-sm" onClick={() => setEditing(true)}>
                  <Pencil className="size-3.5" aria-hidden /> {t('refPartners.edit')}
                </button>
                <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-3.5" aria-hidden /> {t('refPartners.delete')}
                </button>
              </>
            )}
          </div>
        </div>
        <ReadinessMeter readiness={stats?.readiness ?? partner.readiness} className="mt-4 max-w-xl" onFill={isAdmin ? () => setEditing(true) : undefined} />
      </header>

      {/* Key figures */}
      <KpiStrip cols={4} className="mb-5">
        <KpiCell label={t('partnerHub.header.clients')} icon={Users} value={stats?.clients.total ?? '…'} hint={stats && t('partnerHub.header.clientsHint', { active: stats.clients.active })} />
        <KpiCell label={t('partnerHub.header.cases')} icon={FileSignature} value={stats?.cases.total ?? cases.length}>
          {stats && stats.cases.total > 0 && (
            <SegmentBar
              label={PROCESSING_STAGES.map((s) => `${stageLabel(s)}: ${stats.cases.stages[s] ?? 0}`).join(', ')}
              parts={PROCESSING_STAGES.map((s) => ({ key: s, value: stats.cases.stages[s] ?? 0, className: STAGE_TONE[s] ?? 'bg-line-strong', title: `${stageLabel(s)}: ${stats.cases.stages[s] ?? 0}` }))}
            />
          )}
        </KpiCell>
        <KpiCell label={t('partnerHub.header.visas')} icon={BadgeCheck} value={stats?.cases.approved ?? '…'} />
        <KpiCell
          label={t('partnerHub.header.refusals')}
          icon={Ban}
          value={stats?.cases.refused ?? '…'}
          tone={stats && stats.cases.refused > 0 ? 'danger' : undefined}
          hint={t('partnerHub.header.refusalsHint')}
          to="/admin/partners/refusals"
        />
        <KpiCell label={t('partnerHub.header.earned')} icon={Coins} value={stats ? money(stats.commissions.earnedCents, cur) : '…'} />
        <KpiCell label={t('partnerHub.header.pending')} value={stats ? money(stats.commissions.pendingCents, cur) : '…'} tone={stats && stats.commissions.pendingCents > 0 ? 'warning' : undefined} />
        <KpiCell label={t('partnerHub.header.paid')} value={stats ? money(stats.commissions.paidCents, cur) : '…'} tone={stats && stats.commissions.paidCents > 0 ? 'success' : undefined} />
        <KpiCell
          label={t('partnerHub.header.lastActivity')}
          icon={Clock3}
          value={<span className="text-base">{stats?.lastActivityAt ? fmtRelative(stats.lastActivityAt) : '—'}</span>}
          hint={stats?.lastActivityAt ? fmtDate(stats.lastActivityAt) : undefined}
        />
      </KpiStrip>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-medium">{t('partnerHub.header.contract')}:</span>
        <ContractBadge contract={stats?.contract ?? partner.contract} className="!flex-row items-center gap-2" />
      </div>

      <Tabs
        className="mb-4"
        label={partner.name}
        idPrefix="partner-hub"
        items={TABS.map((k) => ({ key: k, label: t(`partnerHub.tabs.${k}`), icon: TAB_ICON[k], count: counts[k] }))}
        value={tab}
        onChange={setTab}
      />
      <TabPanel idPrefix="partner-hub" tabKey={tab} className={clsx('min-w-0')}>
        {tab === 'info' && <InfoTab partner={partner} canEdit={isAdmin} onEdit={() => setEditing(true)} />}
        {tab === 'contracts' && <ContractsTab partnerId={partner.id} legacy={stats?.legacyContract ?? null} onFillData={isAdmin ? () => setEditing(true) : () => setTab('info')} />}
        {tab === 'clients' && <ClientsTab cases={cases} ownedClients={owned} />}
        {tab === 'commissions' && <CommissionsTab partner={partner} isAdmin={isAdmin} />}
        {tab === 'visas' && <VisasTab partner={partner} cases={cases} />}
        {tab === 'documents' && <DocumentsTab partner={partner} />}
        {tab === 'contacts' && <ContactsTab partnerId={partner.id} />}
        {tab === 'history' && <HistoryTab partnerId={partner.id} />}
        {tab === 'portal' && <PortalTab partner={partner} ownedClients={owned} isAdmin={isAdmin} stats={stats} />}
      </TabPanel>

      <PartnerFormDialog open={editing} partner={partner} onClose={() => setEditing(false)} />
      <DeletePartnerDialog partner={confirmDelete ? partner : null} onClose={() => setConfirmDelete(false)} onDeleted={() => navigate('/admin/partners')} />
    </div>
  );
};
