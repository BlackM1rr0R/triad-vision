import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Building2, FileText, Info, Mail, MessageCircle, Pencil, Phone, ShieldX, UserRound, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { CallButton } from '@/components/calls/CallButton';
import { CasePartnerSelect } from '@/components/partners/CasePartnerSelect';
import { ViewAsClientButton } from '@/components/privacyTools/ViewAsClientButton';
import { actorSideLabel, eventLabel, fmtDate, fmtDateTime, fmtRelative, fullName, toastError, waLink } from '../labels';
import type { CaseStats, StaffMember } from '../types';
import { DefRow } from '../ui';
import { useCaseRefresh } from './shared';
import { useCompanyOptions, useJobsCopy, useVacancyOptions, type CaseLink } from './caseLinks';

const linkChip =
  'inline-flex min-h-8 max-w-full min-w-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-ink/80 transition hover:border-line-strong hover:text-link';

/** Right column (stacked under the tabs below 1280 px): client contact, team, key facts. */
export const CaseSummaryAside = ({ c, stats, onEdit, onTemplate }: { c: CaseDetail; stats: CaseStats; onEdit: () => void; onTemplate: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const refresh = useCaseRefresh(c.id);
  const client = c.client;
  const link = c as CaseDetail & CaseLink;
  const [assigning, setAssigning] = useState(false);
  const { data: staff } = useQuery({
    queryKey: ['admin-staff'],
    queryFn: async () => (await api.get<{ staff: StaffMember[] }>('/admin/users/staff')).data.staff,
    staleTime: 5 * 60 * 1000,
  });
  useJobsCopy(!!link.companyId);
  const { data: companies } = useCompanyOptions(!!link.companyId);
  const { data: vacancies } = useVacancyOptions(!!link.vacancyId);
  const companyName = companies?.find((x) => x.id === link.companyId)?.name;
  const vacancyTitle = vacancies?.find((x) => x.id === link.vacancyId)?.title;
  const d = stats.documents;

  const assign = async (assignedStaffId: string) => {
    setAssigning(true);
    try {
      await api.patch(`/admin/cases/${c.id}`, { assignedStaffId: assignedStaffId || null });
      await refresh();
      toast.success(assignedStaffId ? t('admin.case.header.assigned') : t('admin.case.header.unassigned'));
    } catch (err) {
      toastError(err);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1">
      <Card title={t('caseLayout.aside.client')} icon={UserRound} padding="sm" as="h2">
        <p className="font-semibold break-words text-ink">{fullName(client)}</p>
        <p className="mt-0.5 text-xs text-muted uppercase">{t('admin.case.header.language', { value: client.locale })}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`mailto:${client.email}`} className={linkChip}>
            <Mail className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{client.email}</span>
          </a>
          {client.phone && (
            <>
              <a href={`tel:${client.phone}`} className={`${linkChip} whitespace-nowrap`}>
                <Phone className="size-3.5" aria-hidden /> {client.phone}
              </a>
              <CallButton target={{ caseId: c.id }} phone={client.phone} name={fullName(client)} />
              <a href={waLink(client.phone)} target="_blank" rel="noreferrer" className={`${linkChip} border-success-border bg-success-bg font-medium text-success-fg`}>
                <MessageCircle className="size-3.5" aria-hidden /> {t('admin.common.whatsapp')}
              </a>
            </>
          )}
          <ViewAsClientButton user={{ ...client, role: 'CLIENT' }} compact />
        </div>
      </Card>

      <Card title={t('caseLayout.aside.team')} icon={Users} padding="sm" as="h2">
        <label htmlFor="assign" className="label">
          {t('admin.case.header.staff')}
        </label>
        <div className="relative">
          <select id="assign" className="input pr-8" value={c.assignedStaff?.id ?? ''} disabled={assigning} onChange={(e) => void assign(e.target.value)}>
            <option value="">{t('admin.case.header.notAssigned')}</option>
            {c.assignedStaff && !staff?.some((s) => s.id === c.assignedStaff?.id) && <option value={c.assignedStaff.id}>{fullName(c.assignedStaff)}</option>}
            {staff?.map((s) => (
              <option key={s.id} value={s.id}>
                {fullName(s)}
              </option>
            ))}
          </select>
          {assigning && <Spinner className="absolute top-1/2 right-8 size-3.5 -translate-y-1/2 text-link" />}
        </div>
        <dl className="mt-3">
          <CasePartnerSelect c={c} />
        </dl>
      </Card>

      <Card
        title={t('caseLayout.aside.facts')}
        icon={Info}
        padding="sm"
        as="h2"
        className="sm:col-span-2 xl:col-span-1"
        actions={
          <button type="button" className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-link hover:bg-primary/[0.06]" onClick={onEdit}>
            <Pencil className="size-3.5" aria-hidden /> {t('admin.common.edit')}
          </button>
        }
      >
        <dl className="divide-y divide-line">
          <DefRow label={t('admin.case.header.profession')}>{c.profession}</DefRow>
          <DefRow label={t('admin.case.header.visa')}>{c.visaCategory ? `${tr(c.visaCategory.title)} · ${c.visaCategory.visaLabel}` : '—'}</DefRow>
          {link.companyId && (
            <DefRow label={t('jobsArea.admin.caseLink.employer')}>
              <span className="inline-flex max-w-full min-w-0 flex-wrap items-center justify-end gap-x-1">
                <Building2 className="size-3.5 shrink-0 text-link" aria-hidden />
                <Link to={`/admin/companies?id=${link.companyId}`} className="truncate hover:text-link hover:underline">
                  {companyName ?? '…'}
                </Link>
                {link.vacancyId && (
                  <Link to={`/admin/vacancies?id=${link.vacancyId}`} className="truncate text-muted hover:text-link hover:underline">
                    · {vacancyTitle ? tr(vacancyTitle) : '…'}
                  </Link>
                )}
              </span>
            </DefRow>
          )}
          <DefRow label={t('admin.case.header.createdAt')}>{fmtDate(c.createdAt)}</DefRow>
          {c.appointmentAt && (
            <DefRow label={t('admin.case.header.appointment')}>
              <span className="text-accent-fg">
                {fmtDateTime(c.appointmentAt)}
                {c.appointmentPlace && <span className="block text-xs font-normal text-muted">{c.appointmentPlace}</span>}
              </span>
            </DefRow>
          )}
          {c.status === 'APPROVED' && (
            <DefRow label={t('admin.case.header.visaValid')}>
              <span className="text-success-fg">
                {fmtDate(c.visaValidFrom)} – {fmtDate(c.visaValidTo)}
              </span>
            </DefRow>
          )}
          <DefRow label={t('admin.case.stats.inStatus')}>
            <span className={stats.daysInStatus >= 7 ? 'text-danger-fg' : stats.daysInStatus >= 3 ? 'text-warning-fg' : undefined}>{stats.daysInStatus}</span>
          </DefRow>
          <DefRow label={t('caseLayout.aside.docs')}>
            {d.requiredAccepted}/{d.requiredTotal}
            {d.pending > 0 && <span className="ml-1 text-warning-fg">· {d.pending}</span>}
          </DefRow>
          <DefRow label={t('caseLayout.aside.lastActivity')}>
            {stats.lastActivity ? (
              <span title={`${eventLabel(stats.lastActivity.type)} · ${actorSideLabel(stats.lastActivity.byRole)} · ${fmtDateTime(stats.lastActivity.at)}`}>{fmtRelative(stats.lastActivity.at)}</span>
            ) : (
              '—'
            )}
          </DefRow>
        </dl>
        {(c.status === 'REJECTED' || c.status === 'CANCELLED') && (c.decisionReason || c.cancelReason) && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger-fg">
            <ShieldX className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">{c.status === 'REJECTED' ? t('admin.case.header.rejectReason') : t('admin.case.header.cancelReason')}:</span>{' '}
              {c.status === 'REJECTED' ? c.decisionReason : c.cancelReason}
            </span>
          </p>
        )}
        <button type="button" className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-link hover:text-link" onClick={onTemplate}>
          <FileText className="size-3.5" aria-hidden /> {t('caseLayout.menu.fromTemplate')}
        </button>
      </Card>
    </div>
  );
};
