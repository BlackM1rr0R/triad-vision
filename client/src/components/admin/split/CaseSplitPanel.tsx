import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertCircle, ArrowUpRight, CheckCircle2, Clock, FileClock, FileText, History, Mail, MessageSquare, MessageSquareWarning, Phone, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesAdminUx } from '@/i18n/pagesAdminUx';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorBlock } from '@/components/admin/ui';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { actorSideLabel, eventLabel, fmtDate, fmtRelative, fullName } from '@/components/admin/labels';
import type { AdminCaseListItem } from '@/components/admin/types';
import { caseKey, missingAccepted, type CaseDetailResponse } from '@/components/admin/case/shared';
import { NextStepChip } from '@/components/caseNext/NextStepChip';
import { BallChip } from '@/components/clientProcess/Ball';
import { CaseAssigneeCell } from '@/components/inline/CaseInlineCells';
import { PresenceAvatars } from '@/components/presence/PresenceAvatars';
import { usePresence } from '@/components/presence/usePresence';

registerCopy(pagesAdminUx);

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-[11px] text-muted">{label}</dt>
    <dd className="mt-0.5 text-sm break-words text-ink">{children}</dd>
  </div>
);

const action = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-ink transition hover:border-line-strong hover:text-link';

/**
 * Right side of the cases split view: a compact summary of the selected case (facts, status, next step, open
 * items, quick actions) from the same query as the full case page (so opening it afterwards is instant), plus
 * the live presence avatars. The full case page stays one click / Enter away.
 */
export const CaseSplitPanel = ({ id, row, onClose }: { id: string; row?: AdminCaseListItem; onClose: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: caseKey(id),
    queryFn: async () => (await api.get<CaseDetailResponse>(`/admin/cases/${id}`)).data,
    staleTime: 30_000,
  });
  const presence = usePresence('case', id);
  const c = data?.case;
  const stats = data?.stats;

  const openItems: { icon: typeof AlertCircle; text: string; tone: string; to: string }[] = [];
  if (c && stats) {
    if (stats.documents.pending > 0) openItems.push({ icon: FileClock, text: t('ux.split.docsPending', { count: stats.documents.pending }), tone: 'text-warning-fg', to: `/admin/cases/${id}?tab=documents` });
    const missing = missingAccepted(c, 'INITIAL').length + missingAccepted(c, 'EMBASSY').length;
    if (stats.documents.requiredTotal > 0 && missing > 0)
      openItems.push({ icon: FileText, text: t('ux.split.requiredDocs', { done: stats.documents.requiredAccepted, total: stats.documents.requiredTotal }), tone: 'text-ink/80', to: `/admin/cases/${id}?tab=documents` });
    if (stats.messages.awaitingStaffReply) openItems.push({ icon: MessageSquareWarning, text: t('ux.split.unanswered'), tone: 'text-danger-fg', to: `/admin/cases/${id}#case-messages` });
    if (stats.daysInStatus >= 7) openItems.push({ icon: Clock, text: t('ux.split.overdue', { count: stats.daysInStatus }), tone: 'text-danger-fg', to: `/admin/cases/${id}` });
  }

  return (
    <section aria-label={t('ux.split.detailOf', { name: row ? fullName(row.client) : (c ? fullName(c.client) : '') })} className="flex min-h-0 flex-col rounded-xl border border-line bg-card">
      <header className="flex items-start gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-ink">{c?.number ?? row?.number}</span>
            {(c ?? row) && <StatusBadge status={(c ?? row)!.status} />}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-ink">{c ? fullName(c.client) : row ? fullName(row.client) : <Skeleton className="h-4 w-40" />}</p>
        </div>
        <PresenceAvatars viewers={presence.others} max={3} />
        <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-sunken hover:text-ink" aria-label={t('ux.split.close')} title={`${t('ux.split.close')} (Esc)`}>
          <X className="size-4" aria-hidden />
        </button>
      </header>

      {isLoading ? (
        <div className="space-y-3 p-5" aria-busy>
          <Skeleton className="h-16 w-full" rounded="xl" />
          <Skeleton className="h-24 w-full" rounded="xl" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ) : error || !c || !stats ? (
        <div className="p-5">
          <ErrorBlock error={error} onRetry={() => refetch()} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {presence.editors.length > 0 && (
            <p role="status" className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-fg">
              {t('ux.presence.banner', { name: `${presence.editors[0].firstName} ${presence.editors[0].lastName}`.trim(), section: t(`ux.presence.sections.${presence.editors[0].editing}`, { defaultValue: t('ux.presence.sections.generic') }) })}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Link to={`/admin/cases/${id}`} className="btn-primary btn-sm">
              <ArrowUpRight className="size-3.5" aria-hidden /> {t('ux.split.openFull')}
            </Link>
            <Link to={`/admin/cases/${id}#case-messages`} className={action}>
              <MessageSquare className="size-3.5" aria-hidden /> {t('ux.split.message')}
            </Link>
            <Link to={`/admin/cases/${id}?tab=documents`} className={action}>
              <FileText className="size-3.5" aria-hidden /> {t('ux.split.documents')}
            </Link>
            <Link to={`/admin/cases/${id}?tab=history`} className={action}>
              <History className="size-3.5" aria-hidden /> {t('ux.split.history')}
            </Link>
          </div>

          {row?.nextStep !== undefined && (
            <div>
              <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('ux.split.nextStep')}</h3>
              <NextStepChip step={row.nextStep} />
              {row.ballInCourt && (
                <div className="mt-2">
                  <BallChip ball={row.ballInCourt} />
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('ux.split.openItems')}</h3>
            {openItems.length === 0 ? (
              <p className="inline-flex items-center gap-1.5 text-sm text-success-fg">
                <CheckCircle2 className="size-4" aria-hidden /> {t('ux.split.noOpenItems')}
              </p>
            ) : (
              <ul className="space-y-1">
                {openItems.map((o, i) => (
                  <li key={i}>
                    <Link to={o.to} className={clsx('inline-flex items-center gap-2 rounded-md py-0.5 text-sm hover:underline', o.tone)}>
                      <o.icon className="size-4 shrink-0" aria-hidden /> {o.text}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('ux.split.facts')}</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact label={t('ux.split.profession')}>{c.profession}</Fact>
              <Fact label={t('ux.split.visa')}>{c.visaCategory ? `${c.visaCategory.visaLabel} · ${tr(c.visaCategory.title)}` : '—'}</Fact>
              <Fact label={t('ux.split.staff')}>{row ? <CaseAssigneeCell c={row} /> : c.assignedStaff ? fullName(c.assignedStaff) : t('ux.inline.unassigned')}</Fact>
              <Fact label={t('ux.split.created')}>{fmtDate(c.createdAt)}</Fact>
              <Fact label={t('ux.split.contact')}>
                <span className="flex flex-col gap-0.5 text-xs">
                  <a href={`mailto:${c.client.email}`} className="inline-flex min-w-0 items-center gap-1 text-link hover:underline">
                    <Mail className="size-3 shrink-0" aria-hidden /> <span className="truncate">{c.client.email}</span>
                  </a>
                  {c.client.phone && (
                    <a href={`tel:${c.client.phone}`} className="inline-flex items-center gap-1 text-link hover:underline">
                      <Phone className="size-3 shrink-0" aria-hidden /> {c.client.phone}
                    </a>
                  )}
                </span>
              </Fact>
              <Fact label={t('ux.split.lastActivity')}>
                {stats.lastActivity ? (
                  <span className="text-xs">
                    {eventLabel(stats.lastActivity.type)}
                    <span className="block text-muted">
                      {actorSideLabel(stats.lastActivity.byRole ?? undefined)} · {fmtRelative(stats.lastActivity.at)}
                    </span>
                  </span>
                ) : (
                  '—'
                )}
              </Fact>
            </dl>
          </div>
        </div>
      )}
    </section>
  );
};
