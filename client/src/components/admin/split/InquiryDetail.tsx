import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Building2, Mail, MessageCircle, Phone, User, Users, X } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAdminUx } from '@/i18n/pagesAdminUx';
import { CallButton } from '@/components/calls/CallButton';
import { INQUIRY_STATUSES, INQUIRY_STATUS_TONE, fmtDateTime, inquiryKindLabel, inquiryStatusLabel, waLink, type InquiryStatus } from '@/components/admin/labels';
import type { InquiriesResponse, Inquiry } from '@/components/admin/types';
import { LeadDetailsPanel, LeadScoreBadge } from '@/components/marketing/LeadScore';
import type { LeadLevel, ScoreReason } from '@/components/marketing/api';
import { InlineSelect } from '@/components/inline/InlineSelect';
import { optimisticListEdit } from '@/components/inline/optimistic';
import { PresenceAvatars } from '@/components/presence/PresenceAvatars';
import { usePresence } from '@/components/presence/usePresence';

registerCopy(pagesAdminUx);

export type ScoredInquiry = Inquiry & { score?: number; scoreLevel?: LeadLevel | null; scoreReasons?: ScoreReason[] | null; source?: string | null };

export const INQUIRIES_KEY = ['admin-inquiries'] as const;

/** Inquiry status, editable in place with an optimistic update (PATCH /admin/inquiries/:id). */
export const InquiryStatusCell = ({ item }: { item: Inquiry }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const save = (value: string) => {
    const status = value as InquiryStatus;
    return optimisticListEdit<InquiriesResponse>({
      qc,
      queryKey: INQUIRIES_KEY,
      update: (old) => ({ ...old, items: old.items.map((i) => (i.id === item.id ? { ...i, status } : i)) }),
      request: () => api.patch(`/admin/inquiries/${item.id}`, { status }),
      success: t('admin.inquiries.statusToast', { status: inquiryStatusLabel(status) }),
      invalidate: [['admin-dashboard']],
    });
  };
  return (
    <InlineSelect
      label={t('admin.inquiries.statusAria')}
      value={item.status}
      rowId={item.id}
      field="status"
      primary
      onSave={save}
      options={INQUIRY_STATUSES.map((s) => ({ value: s, text: inquiryStatusLabel(s), label: <span className={clsx('badge', INQUIRY_STATUS_TONE[s])}>{inquiryStatusLabel(s)}</span> }))}
      display={<span className={clsx('inline-flex min-h-7 items-center rounded-md px-2 text-xs font-semibold whitespace-nowrap', INQUIRY_STATUS_TONE[item.status])}>{inquiryStatusLabel(item.status)}</span>}
    />
  );
};

const Detail = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-[11px] text-muted">{label}</dt>
    <dd className="text-sm text-ink">{children}</dd>
  </div>
);

/** Body of an inquiry: message, lead details, facts and contact actions (expanded row and split view). */
export const InquiryDetailBody = ({ i, className }: { i: Inquiry; className?: string }) => {
  const { t } = useTranslation();
  return (
    <div className={clsx('space-y-4', className)}>
      <p className="rounded-lg border border-line bg-card px-3.5 py-3 text-sm break-words whitespace-pre-wrap text-ink">{i.message}</p>
      <LeadDetailsPanel inquiryId={i.id} />
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label={t('admin.inquiries.contactPerson')}>{i.contactName}</Detail>
        {i.companyName && <Detail label={t('admin.inquiries.company')}>{i.companyName}</Detail>}
        {i.sector && <Detail label={t('admin.inquiries.sector')}>{i.sector}</Detail>}
        {i.workersNeeded != null && (
          <Detail label={t('admin.inquiries.workersNeeded')}>
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5 text-muted" /> {i.workersNeeded}
            </span>
          </Detail>
        )}
        <Detail label={t('admin.common.language')}>{i.locale.toUpperCase()}</Detail>
        <Detail label={t('admin.common.date')}>{fmtDateTime(i.createdAt)}</Detail>
      </dl>
      <div className="flex flex-wrap gap-2">
        <a href={`mailto:${i.email}`} className="btn-secondary btn-sm max-w-full min-w-0 border border-line">
          <Mail className="size-3.5 shrink-0" /> <span className="truncate">{i.email}</span>
        </a>
        {i.phone && (
          <>
            <a href={`tel:${i.phone}`} className="btn-secondary btn-sm">
              <Phone className="size-3.5" /> {i.phone}
            </a>
            <CallButton target={{ inquiryId: i.id }} phone={i.phone} name={i.contactName} />
            <a href={waLink(i.phone)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm border border-success-border text-success-fg">
              <MessageCircle className="size-3.5" /> {t('admin.common.whatsapp')}
            </a>
          </>
        )}
      </div>
    </div>
  );
};

/** Who else has this inquiry open (expanded row / split panel). */
export const InquiryPresence = ({ id, className }: { id: string; className?: string }) => {
  const { others } = usePresence('inquiry', id);
  return <PresenceAvatars viewers={others} max={3} className={className} />;
};

/** Right side of the inquiries split view. */
export const InquirySplitPanel = ({ i, onClose }: { i: ScoredInquiry; onClose: () => void }) => {
  const { t } = useTranslation();
  return (
    <section aria-label={t('ux.split.detailOf', { name: i.companyName || i.contactName })} className="flex min-h-0 flex-col rounded-xl border border-line bg-card">
      <header className="flex items-start gap-3 border-b border-line px-5 py-3.5">
        <span className={clsx('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', i.kind === 'company' ? 'bg-accent-bg text-accent-fg' : 'bg-primary/10 text-link')} aria-hidden>
          {i.kind === 'company' ? <Building2 className="size-4" /> : <User className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold break-words text-ink">{i.companyName || i.contactName}</span>
            <LeadScoreBadge level={i.scoreLevel ?? null} score={i.score ?? 0} reasons={i.scoreReasons ?? null} />
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {inquiryKindLabel(i.kind)} · {fmtDateTime(i.createdAt)}
          </p>
          <div className="mt-2">
            <InquiryStatusCell item={i} />
          </div>
        </div>
        <InquiryPresence id={i.id} />
        <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-sunken hover:text-ink" aria-label={t('ux.split.close')} title={`${t('ux.split.close')} (Esc)`}>
          <X className="size-4" aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-surface/40 p-5">
        <InquiryDetailBody i={i} />
      </div>
    </section>
  );
};
