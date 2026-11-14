import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowUpRight, CalendarClock, ChevronDown, ChevronUp, FileText, Mail, MessageSquare, Phone, Send, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesCasesList } from '@/i18n/pagesCasesList';
import { pagesAdminUx } from '@/i18n/pagesAdminUx';
import { Drawer } from '@/components/ui/Drawer';
import { IconButton } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorBlock } from '@/components/admin/ui';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { fmtDateTime, fmtRelative, fullName, toastError } from '@/components/admin/labels';
import type { AdminCaseListItem } from '@/components/admin/types';
import { caseKey, type CaseDetailResponse } from '@/components/admin/case/shared';
import { ActionPanel } from '@/components/admin/case/ActionPanel';
import { useStaffOptions } from '@/components/inline/CaseInlineCells';
import { NextStepChip } from '@/components/caseNext/NextStepChip';
import { BallChip } from '@/components/clientProcess/Ball';
import { PresenceAvatars } from '@/components/presence/PresenceAvatars';
import { usePresence } from '@/components/presence/usePresence';
import { useCannedComposer } from '@/components/staffDesk/CannedReplies';
import { AssignHint } from '@/components/staffDesk/AssignHint';
import { clientHref } from '@/components/staffDesk/api';

registerCopy(pagesCasesList);
registerCopy(pagesAdminUx);

const Section = ({ title, icon: Icon, action, children, className }: { title: string; icon?: typeof FileText; action?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={clsx('rounded-xl border border-line bg-card p-4', className)}>
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h3 className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
        {Icon && <Icon className="size-3.5" aria-hidden />} {title}
      </h3>
      {action}
    </div>
    {children}
  </section>
);

const linkClass = 'text-xs font-semibold text-link hover:underline';

/**
 * Quick view of a case in a right-side drawer (cases list, ?open=<id>): status with the workflow step form,
 * owner, documents summary, last message with a reply box, next appointment, contact and the full page one
 * click away. Uses the same query as the case page, so opening the full page afterwards is instant.
 */
export const CaseQuickDrawer = ({
  id,
  row,
  onClose,
  onPrev,
  onNext,
  autoFocusReply = false,
}: {
  id: string | null;
  /** Focus the reply box once the case is loaded ("Mesaj yaz" row action). */
  autoFocusReply?: boolean;
  row?: AdminCaseListItem;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: caseKey(id ?? ''),
    queryFn: async () => (await api.get<CaseDetailResponse>(`/admin/cases/${id}`)).data,
    enabled: !!id,
    staleTime: 30_000,
  });
  const presence = usePresence('case', id, { enabled: !!id });
  const { data: staff } = useStaffOptions();
  const c = data?.case;
  const stats = data?.stats;
  const [reply, setReply] = useState('');
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const canned = useCannedComposer({ value: reply, setValue: setReply, ref: replyRef, context: { caseId: id ?? undefined } }); // "/" canned replies
  useEffect(() => setReply(''), [id]);
  const loaded = !!data;
  useEffect(() => {
    if (!autoFocusReply || !loaded) return;
    const h = window.setTimeout(() => replyRef.current?.focus(), 320); // after the slide-in
    return () => window.clearTimeout(h);
  }, [autoFocusReply, loaded, id]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: caseKey(id ?? '') });
    void qc.invalidateQueries({ queryKey: ['admin-cases'] });
    void qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
  };
  const assign = useMutation({
    mutationFn: async (staffId: string | null) => api.patch(`/admin/cases/${id}`, { assignedStaffId: staffId }),
    onSuccess: (_r, staffId) => {
      const s = staff?.find((x) => x.id === staffId);
      toast.success(s ? t('cl.drawer.assigneeSaved', { name: fullName(s) }) : t('cl.drawer.unassignedSaved'));
      refresh();
    },
    onError: (err) => toastError(err),
  });
  const send = useMutation({
    mutationFn: async (body: string) => api.post(`/admin/cases/${id}/messages`, { body }),
    onSuccess: () => {
      setReply('');
      toast.success(t('cl.drawer.sent'));
      refresh();
    },
    onError: (err) => toastError(err),
  });

  const last = c?.messages.length ? [...c.messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : null;
  const number = c?.number ?? row?.number ?? '';
  const name = c ? fullName(c.client) : row ? fullName(row.client) : '';
  const full = `/admin/cases/${id}`;
  const docs = stats?.documents;
  const pct = docs && docs.requiredTotal > 0 ? Math.round((docs.requiredAccepted / docs.requiredTotal) * 100) : null;

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      width="lg"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="code-id shrink-0 text-sm font-semibold text-link">{number}</span>
          <span className="truncate">{name || <Skeleton className="h-4 w-40" />}</span>
        </span>
      }
      description={c ? [c.profession, c.visaCategory ? `${c.visaCategory.visaLabel} · ${tr(c.visaCategory.title)}` : null].filter(Boolean).join(' · ') : row?.profession}
      headerActions={
        <>
          <PresenceAvatars viewers={presence.others} max={3} className="mr-1 hidden sm:flex" />
          {onPrev && <IconButton icon={ChevronUp} label={t('cl.drawer.prev')} onClick={onPrev} size="sm" />}
          {onNext && <IconButton icon={ChevronDown} label={t('cl.drawer.next')} onClick={onNext} size="sm" />}
        </>
      }
      bodyClassName="space-y-4 bg-surface/40"
      footer={
        <>
          <Link to={`${full}?tab=documents`} className="btn-secondary btn-sm">
            <FileText className="size-3.5" aria-hidden /> {t('cl.drawer.toDocuments')}
          </Link>
          <Link to={full} className="btn-primary btn-sm">
            <ArrowUpRight className="size-3.5" aria-hidden /> {t('cl.drawer.openFull')}
          </Link>
        </>
      }
    >
      {isLoading ? (
        <div className="space-y-4" aria-busy>
          <Skeleton className="h-20 w-full" rounded="xl" />
          <Skeleton className="h-28 w-full" rounded="xl" />
          <Skeleton className="h-36 w-full" rounded="xl" />
        </div>
      ) : error || !c || !stats ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {presence.editors.length > 0 && (
            <p role="status" className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-fg">
              {t('ux.presence.banner', {
                name: `${presence.editors[0].firstName} ${presence.editors[0].lastName}`.trim(),
                section: t(`ux.presence.sections.${presence.editors[0].editing}`, { defaultValue: t('ux.presence.sections.generic') }),
              })}
            </p>
          )}

          {/* Status + owner + appointment */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Section title={t('cl.drawer.status')} className="sm:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={c.status} />
                <span className={clsx('text-xs tabular-nums', stats.daysInStatus >= 7 ? 'font-semibold text-danger-fg' : stats.daysInStatus >= 3 ? 'font-semibold text-warning-fg' : 'text-muted')}>
                  {t('cl.drawer.inStatus', { count: stats.daysInStatus })}
                </span>
              </div>
              {row?.nextStep && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <NextStepChip step={row.nextStep} />
                  {row.ballInCourt && <BallChip ball={row.ballInCourt} />}
                </div>
              )}
            </Section>

            <Section title={t('cl.drawer.assignee')} icon={UserRound}>
              <select
                className="input min-h-10 py-1.5 text-sm sm:min-h-9"
                aria-label={t('cl.drawer.assignee')}
                value={c.assignedStaff?.id ?? ''}
                disabled={assign.isPending}
                onChange={(e) => assign.mutate(e.target.value || null)}
              >
                <option value="">{t('ux.inline.unassigned')}</option>
                {(staff ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {fullName(s)}
                  </option>
                ))}
              </select>
              <AssignHint caseId={c.id} currentId={c.assignedStaff?.id ?? null} disabled={assign.isPending} onPick={(sid) => assign.mutate(sid)} />
            </Section>

            <Section title={t('cl.drawer.appointment')} icon={CalendarClock}>
              {c.appointmentAt ? (
                <p className="text-sm">
                  <span className="block font-semibold text-ink">{fmtDateTime(c.appointmentAt)}</span>
                  {c.appointmentPlace && <span className="mt-0.5 block text-xs text-muted">{c.appointmentPlace}</span>}
                  <span className="mt-0.5 block text-[11px] text-muted">{fmtRelative(c.appointmentAt)}</span>
                </p>
              ) : (
                <p className="text-sm text-muted">{t('cl.drawer.noAppointment')}</p>
              )}
            </Section>
          </div>

          {/* Documents */}
          <Section
            title={t('cl.drawer.documents')}
            icon={FileText}
            action={
              <Link to={`${full}?tab=documents`} className={linkClass}>
                {t('cl.drawer.toDocuments')}
              </Link>
            }
          >
            {docs && docs.total === 0 && docs.requiredTotal === 0 ? (
              <p className="text-sm text-muted">{t('cl.drawer.noDocs')}</p>
            ) : (
              docs && (
                <>
                  {pct !== null && (
                    <>
                      <p className="text-sm text-ink">{t('cl.drawer.required', { done: docs.requiredAccepted, total: docs.requiredTotal })}</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('cl.drawer.documents')}>
                        <span className={clsx('block h-full rounded-full', pct === 100 ? 'bg-success' : 'bg-primary')} style={{ width: `${pct}%` }} />
                      </div>
                    </>
                  )}
                  <p className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                    {docs.pending > 0 && <span className="rounded-md bg-warning-bg px-1.5 py-0.5 text-warning-fg">{t('cl.drawer.pending', { count: docs.pending })}</span>}
                    {docs.accepted > 0 && <span className="rounded-md bg-success-bg px-1.5 py-0.5 text-success-fg">{t('cl.drawer.accepted', { count: docs.accepted })}</span>}
                    {docs.rejected > 0 && <span className="rounded-md bg-danger-bg px-1.5 py-0.5 text-danger-fg">{t('cl.drawer.rejected', { count: docs.rejected })}</span>}
                  </p>
                </>
              )
            )}
          </Section>

          {/* Last message + reply */}
          <Section
            title={t('cl.drawer.lastMessage')}
            icon={MessageSquare}
            action={
              <Link to={`${full}#case-messages`} className={linkClass}>
                {t('cl.drawer.allMessages')}
              </Link>
            }
          >
            {last ? (
              <div className="rounded-lg bg-sunken/70 px-3 py-2.5">
                <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                  <span className="font-semibold text-ink/80">{last.author.role === 'CLIENT' ? t('cl.drawer.fromClient') : t('cl.drawer.fromStaff')}</span>
                  <span>{fullName(last.author)}</span>
                  <span title={fmtDateTime(last.createdAt)}>· {fmtRelative(last.createdAt)}</span>
                  {stats.messages.awaitingStaffReply && <span className="rounded bg-danger-bg px-1.5 font-semibold text-danger-fg">{t('cl.drawer.awaitingReply')}</span>}
                </p>
                <p className="mt-1 line-clamp-4 text-sm whitespace-pre-line text-ink">{last.body}</p>
              </div>
            ) : (
              <p className="text-sm text-muted">{t('cl.drawer.noMessages')}</p>
            )}
            <form
              className="mt-3 flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (reply.trim()) send.mutate(reply.trim());
              }}
            >
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">{t('cl.drawer.replyLabel')}</span>
                {canned.popover}
                <textarea
                  ref={replyRef}
                  rows={2}
                  maxLength={4000}
                  className="input min-h-10 resize-y py-2 text-sm"
                  placeholder={t('cl.drawer.reply')}
                  value={reply}
                  {...canned.aria}
                  onChange={(e) => {
                    setReply(e.target.value);
                    canned.onInput(e.currentTarget);
                  }}
                  onClick={(e) => canned.onInput(e.currentTarget)}
                  onKeyDown={(e) => {
                    if (canned.onKeyDown(e)) return;
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && reply.trim()) {
                      e.preventDefault();
                      send.mutate(reply.trim());
                    }
                  }}
                />
              </label>
              <IconButton type="submit" icon={Send} label={t('cl.drawer.send')} variant="primary" loading={send.isPending} disabled={!reply.trim()} />
            </form>
          </Section>

          {/* Workflow step (status change): the same form as on the case page */}
          <ActionPanel c={c} />

          <Section
            title={t('cl.drawer.contact')}
            action={
              <Link to={clientHref(c.client.id)} className={linkClass}>
                {t('sd.c360.open')}
              </Link>
            }
          >
            <p className="flex flex-col gap-1 text-sm">
              <a href={`mailto:${c.client.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-link hover:underline">
                <Mail className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{c.client.email}</span>
              </a>
              {c.client.phone && (
                <a href={`tel:${c.client.phone}`} className="inline-flex items-center gap-1.5 text-link hover:underline">
                  <Phone className="size-3.5 shrink-0" aria-hidden /> {c.client.phone}
                </a>
              )}
            </p>
          </Section>
        </>
      )}
    </Drawer>
  );
};
