import { CallButton } from '@/components/calls/CallButton'; // click-to-call (Twilio / sipgate) or manual call log
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Building2, ChevronDown, Inbox, Mail, MessageCircle, Phone, Search, User, Users } from 'lucide-react';
import { api } from '@/lib/api';
import {
  INQUIRY_KINDS,
  INQUIRY_STATUSES,
  INQUIRY_STATUS_TONE,
  fmtDateTime,
  fmtRelative,
  inquiryKindLabel,
  inquiryStatusLabel,
  toastError,
  waLink,
  type InquiryStatus,
} from '@/components/admin/labels';
import type { InquiriesResponse, Inquiry } from '@/components/admin/types';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, StatTile } from '@/components/admin/ui';

const KEY = ['admin-inquiries'] as const;

const StatusSelect = ({ item }: { item: Inquiry }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (status: InquiryStatus) => (await api.patch<{ item: Inquiry }>(`/admin/inquiries/${item.id}`, { status })).data.item,
    onSuccess: (updated) => {
      qc.setQueryData<InquiriesResponse>(KEY, (old) => old && { ...old, items: old.items.map((i) => (i.id === updated.id ? updated : i)) });
      // The summary counts come from the server: refresh them after the optimistic row update.
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      toast.success(t('admin.inquiries.statusToast', { status: inquiryStatusLabel(updated.status) }));
    },
    onError: (err) => toastError(err),
  });
  return (
    <select
      aria-label={t('admin.inquiries.statusAria')}
      className={clsx('min-h-8 cursor-pointer rounded-md border-0 py-1 pr-7 pl-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-500/30', INQUIRY_STATUS_TONE[item.status])}
      value={item.status}
      disabled={m.isPending}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => m.mutate(e.target.value as InquiryStatus)}
    >
      {INQUIRY_STATUSES.map((s) => (
        <option key={s} value={s}>
          {inquiryStatusLabel(s)}
        </option>
      ))}
    </select>
  );
};

const Detail = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-[11px] text-muted">{label}</dt>
    <dd className="text-sm text-ink">{children}</dd>
  </div>
);

export default function Inquiries() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as InquiryStatus | null) ?? null;
  const kind = params.get('kind');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<InquiriesResponse>('/admin/inquiries')).data,
    refetchInterval: 120_000,
  });

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const items = data?.items ?? [];
  const summary = data?.summary;
  // With a kind filter the chip counts are narrowed locally; otherwise they are the server totals.
  const counts = useMemo(() => {
    if (!kind && summary) return summary.byStatus;
    const out: Partial<Record<InquiryStatus, number>> = {};
    for (const i of items) if (!kind || i.kind === kind) out[i.status] = (out[i.status] ?? 0) + 1;
    return out;
  }, [items, kind, summary]);

  const filtered = items.filter((i) => {
    if (status && i.status !== status) return false;
    if (kind && i.kind !== kind) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      return [i.contactName, i.companyName, i.email, i.phone, i.message, i.sector].some((f) => f?.toLowerCase().includes(s));
    }
    return true;
  });

  return (
    <div>
      <PageHead title={t('admin.nav.inquiries')} subtitle={t('admin.inquiries.subtitle')} />

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile label={t('admin.inquiries.new7d')} value={summary.new7d} icon={Inbox} />
          <StatTile
            label={t('admin.inquiries.oldestOpen')}
            value={summary.oldestOpenDays === null ? '—' : t('admin.common.days', { count: summary.oldestOpenDays })}
            tone={summary.oldestOpenDays !== null && summary.oldestOpenDays >= 3 ? 'warn' : undefined}
            hint={summary.oldestOpenDays === null ? t('admin.inquiries.noNew') : t('admin.inquiries.awaitingReply')}
          />
          <StatTile label={t('admin.inquiries.companyContact')} value={`${summary.byKind.company ?? 0} / ${summary.byKind.contact ?? 0}`} hint={t('admin.inquiries.companyContactHint')} icon={Building2} />
          <StatTile label={t('admin.inquiries.workersRequested')} value={summary.workersRequested} hint={t('admin.inquiries.workersHint')} icon={Users} />
        </div>
      )}

      <div className="mb-6 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">{t('admin.common.search')}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" className="input pl-9" placeholder={t('admin.inquiries.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select aria-label={t('admin.inquiries.kindAria')} className="input sm:w-56" value={kind ?? ''} onChange={(e) => setParam('kind', e.target.value || null)}>
            <option value="">{t('admin.inquiries.allKinds')}</option>
            {INQUIRY_KINDS.map((k) => (
              <option key={k} value={k}>
                {inquiryKindLabel(k)}
              </option>
            ))}
          </select>
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          <Chip active={!status} onClick={() => setParam('status', null)} count={Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)}>
            {t('admin.common.all')}
          </Chip>
          {INQUIRY_STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setParam('status', status === s ? null : s)} count={counts[s] ?? 0}>
              {inquiryStatusLabel(s)}
            </Chip>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={Inbox} title={t('admin.inquiries.notFound')} />
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {filtered.map((i) => {
            const expanded = open === i.id;
            return (
              <li key={i.id} className={clsx(i.status === 'NEW' && 'bg-brand-50/40')}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : i.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpen(expanded ? null : i.id);
                    }
                  }}
                  className="flex cursor-pointer items-start gap-3 px-4 py-3.5 transition hover:bg-surface sm:px-5"
                >
                  <span
                    className={clsx(
                      'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                      i.kind === 'company' ? 'bg-violet-100 text-violet-700' : 'bg-brand-100 text-brand-700',
                    )}
                    aria-hidden
                  >
                    {i.kind === 'company' ? <Building2 className="size-4" /> : <User className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm">
                      <span className="min-w-0 font-semibold break-words text-navy-900">{i.companyName || i.contactName}</span>
                      {i.companyName && <span className="text-muted">{i.contactName}</span>}
                      <span className="text-[11px] whitespace-nowrap text-muted">{inquiryKindLabel(i.kind)}</span>
                    </p>
                    <p className={clsx('mt-0.5 text-xs text-ink/70', !expanded && 'line-clamp-1')}>{i.message}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="text-[11px] whitespace-nowrap text-muted" title={fmtDateTime(i.createdAt)}>
                      {fmtRelative(i.createdAt)}
                    </span>
                    <StatusSelect item={i} />
                    <ChevronDown className={clsx('hidden size-4 text-muted transition-transform sm:block', expanded && 'rotate-180')} aria-hidden />
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-4 border-t border-line bg-surface/50 px-4 py-4 sm:pr-5 sm:pl-16">
                        <p className="rounded-lg border border-line bg-white px-3.5 py-3 text-sm break-words whitespace-pre-wrap text-ink">{i.message}</p>
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
                          <a href={`mailto:${i.email}`} className="btn-white btn-sm max-w-full min-w-0 border border-line">
                            <Mail className="size-3.5 shrink-0" /> <span className="truncate">{i.email}</span>
                          </a>
                          {i.phone && (
                            <>
                              <a href={`tel:${i.phone}`} className="btn-white btn-sm border border-line">
                                <Phone className="size-3.5" /> {i.phone}
                              </a>
                              <CallButton target={{ inquiryId: i.id }} phone={i.phone} name={i.contactName} />
                              <a href={waLink(i.phone)} target="_blank" rel="noreferrer" className="btn-white btn-sm border border-emerald-200 text-emerald-800">
                                <MessageCircle className="size-3.5" /> {t('admin.common.whatsapp')}
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
