import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ExternalLink, FileCheck2, Mail, MessageCircle, Phone, Route, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesStaffMobile } from '@/i18n/pagesStaffMobile';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { CallButton } from '@/components/calls/CallButton';
import { ViewAsClientButton } from '@/components/privacyTools/ViewAsClientButton';
import { clientHref } from '@/components/staffDesk/api';
import { fetchNextStep, nextStepKey, ruleText, TONE_STYLE } from '@/components/caseNext/api';
import { caseKey, useCaseRefresh, type CaseDetailResponse } from '@/components/admin/case/shared';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { fmtRelative, fullName, toastError, waLink } from '@/components/admin/labels';
import type { StaffMember } from '@/components/admin/types';
import type { InboxItem } from './types';

registerCopy(pagesStaffMobile);

const linkChip = 'inline-flex min-h-8 max-w-full min-w-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-ink/80 transition hover:border-line-strong hover:text-link';

/**
 * Right column of the staff inbox: the client and case of the open conversation. Data comes from the same
 * GET /admin/cases/:id the case page uses (case scope + sensitive-field masking are applied by the server); without
 * the permission for it the panel falls back to what the inbox list already knows. Assigning a colleague is the
 * case page's PATCH, so it follows the same permissions.
 */
export const InboxProfile = ({ caseId, item }: { caseId: string; item: InboxItem | null }) => {
  const { t } = useTranslation();
  const refresh = useCaseRefresh(caseId);
  const [assigning, setAssigning] = useState(false);
  const detail = useQuery({
    queryKey: caseKey(caseId),
    queryFn: async () => (await api.get<CaseDetailResponse>(`/admin/cases/${caseId}`)).data,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const c = detail.data?.case;
  const stats = detail.data?.stats;
  const next = useQuery({ queryKey: nextStepKey(caseId), queryFn: () => fetchNextStep(caseId), enabled: !!c, staleTime: 15_000, retry: false });
  const { data: staff } = useQuery({
    queryKey: ['admin-staff'],
    queryFn: async () => (await api.get<{ staff: StaffMember[] }>('/admin/users/staff')).data.staff,
    staleTime: 5 * 60 * 1000,
    enabled: !!c,
  });

  const client = c?.client ?? item?.client ?? null;
  const email = c?.client.email;
  const phone = client?.phone ?? null;
  const assigned = c?.assignedStaff ?? item?.assignedStaff ?? null;
  const status = c?.status ?? item?.status;
  const number = c?.number ?? item?.number;
  const top = next.data?.steps[0];

  const assign = async (assignedStaffId: string) => {
    setAssigning(true);
    try {
      await api.patch(`/admin/cases/${caseId}`, { assignedStaffId: assignedStaffId || null });
      await refresh();
      toast.success(t(assignedStaffId ? 'admin.case.header.assigned' : 'admin.case.header.unassigned'));
    } catch (err) {
      toastError(err);
    } finally {
      setAssigning(false);
    }
  };

  if (!client && detail.isLoading) {
    return (
      <div className="grid h-full place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (!client) return <p className="p-4 text-sm text-muted">{t('smob.inbox.loadProfile')}</p>;

  const docs = stats?.documents;
  const pct = docs && docs.requiredTotal > 0 ? Math.round((docs.requiredAccepted / docs.requiredTotal) * 100) : 0;

  return (
    <div className="space-y-4 p-4">
      <section aria-label={t('smob.inbox.profile')}>
        <div className="flex items-center gap-3">
          <Avatar name={fullName(client)} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{fullName(client)}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              {number && <span className="code-id">{number}</span>}
              {status && <StatusBadge status={status} />}
            </p>
            {c && (
              <p className="mt-0.5 text-[11px] text-muted uppercase">
                {t('smob.inbox.language')}: {c.client.locale}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {email && (
            <a href={`mailto:${email}`} className={linkChip}>
              <Mail className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{email}</span>
            </a>
          )}
          {phone && (
            <>
              <a href={`tel:${phone}`} className={clsx(linkChip, 'whitespace-nowrap')}>
                <Phone className="size-3.5" aria-hidden /> {phone}
              </a>
              <CallButton target={{ caseId }} phone={phone} name={fullName(client)} />
              <a href={waLink(phone)} target="_blank" rel="noreferrer" className={clsx(linkChip, 'border-success-border bg-success-bg font-medium text-success-fg')}>
                <MessageCircle className="size-3.5" aria-hidden /> {t('admin.common.whatsapp')}
              </a>
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={clientHref(client.id)} className="btn-secondary btn-sm">
            <UserRound className="size-3.5" aria-hidden /> {t('smob.inbox.openProfile')}
          </Link>
          {c && (
            <Link to={`/admin/cases/${caseId}`} className="btn-secondary btn-sm">
              <ExternalLink className="size-3.5" aria-hidden /> {t('smob.inbox.openCase')}
            </Link>
          )}
          {c && <ViewAsClientButton user={{ ...c.client, role: 'CLIENT' }} compact />}
        </div>
      </section>

      {!c && !detail.isLoading && <p className="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">{t('smob.inbox.noProfile')}</p>}

      {top && (
        <section aria-label={t('smob.inbox.nextStep')}>
          <p className="type-overline mb-1.5 flex items-center gap-1.5">
            <Route className="size-3.5" aria-hidden /> {t('smob.inbox.nextStep')}
          </p>
          <p className={clsx('rounded-lg px-3 py-2 text-sm ring-1', TONE_STYLE[top.tone])}>{ruleText(t, top)}</p>
        </section>
      )}

      {docs && (
        <section aria-label={t('smob.inbox.docs')}>
          <p className="type-overline mb-1.5 flex items-center gap-1.5">
            <FileCheck2 className="size-3.5" aria-hidden /> {t('smob.inbox.docs')}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-ink/80">
            {t('smob.inbox.docsValue', { done: docs.requiredAccepted, total: docs.requiredTotal })}
            {docs.pending > 0 && <span className="ml-1 text-warning-fg">· {t('smob.inbox.docsPending', { count: docs.pending })}</span>}
          </p>
          {stats?.lastActivity && <p className="mt-1 text-[11px] text-muted">{fmtRelative(stats.lastActivity.at)}</p>}
        </section>
      )}

      <section>
        <label htmlFor="inbox-assign" className="type-overline mb-1.5 block">
          {t('smob.inbox.staff')}
        </label>
        {c ? (
          <div className="relative">
            <select id="inbox-assign" className="input pr-8" value={assigned?.id ?? ''} disabled={assigning} onChange={(e) => void assign(e.target.value)}>
              <option value="">{t('smob.inbox.notAssigned')}</option>
              {assigned && !staff?.some((s) => s.id === assigned.id) && <option value={assigned.id}>{fullName(assigned)}</option>}
              {staff?.map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                </option>
              ))}
            </select>
            {assigning && <Spinner className="absolute top-1/2 right-8 size-3.5 -translate-y-1/2 text-link" />}
          </div>
        ) : (
          <p className="text-sm text-ink">{assigned ? fullName(assigned) : t('smob.inbox.notAssigned')}</p>
        )}
      </section>
    </div>
  );
};
