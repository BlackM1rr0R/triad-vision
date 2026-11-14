import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, Check, Eye, FileText, PartyPopper, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesStaffPower } from '@/i18n/pagesStaffPower';
import { pagesStaffMobile } from '@/i18n/pagesStaffMobile';
import { pagesUploadAi } from '@/i18n/pagesUploadAi';
import { delayedCommit } from '@/lib/undo';
import { Spinner } from '@/components/ui/Spinner';
import { fmtRelative, fullName } from '@/components/admin/labels';
import { useReviewQueue, type ReviewItem } from '@/components/staffPower/api';
import { DocViewer, type ViewState } from '@/components/staffPower/review/DocViewer';
import { RejectDialog, suggestedReasons } from '@/components/staffPower/review/RejectDialog';
import type { ReviewMark } from '@/components/review/marks';
import { BottomSheet } from './BottomSheet';
import { SwipeRow } from './SwipeRow';

registerCopy(pagesStaffPower);
registerCopy(pagesStaffMobile);
registerCopy(pagesUploadAi);

type Decision = 'ACCEPTED' | 'REJECTED';

/**
 * Phone document review (/admin/review below 768 px; the desktop review screen is untouched): the pending uploads
 * as a list — swipe right accepts, swipe left rejects (reason dialog), tap opens a full-screen preview with big
 * Accept / Reject buttons that moves on to the next document. Decisions use the same endpoint and the same
 * "Geri al" undo window as the desktop review (POST /admin/cases/:id/documents/:docId/review, lib/undo).
 */
export const MobileReview = () => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  usePageTitle(t('smob.review.title'));
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const { data, isLoading, error, refetch } = useReviewQueue({ scope });
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ReviewItem | null>(null);
  const [view, setView] = useState<ViewState>({ zoom: 1, rotation: 0 });
  useEffect(() => setView({ zoom: 1, rotation: 0 }), [previewId]);
  // A fresh queue (after the commits) no longer holds the decided documents; drop them from the local set.
  const lastData = useRef(data);
  useEffect(() => {
    if (!data || data === lastData.current) return;
    lastData.current = data;
    const ids = new Set(data.items.map((i) => i.id));
    setDone((d) => new Set([...d].filter((id) => ids.has(id))));
  }, [data]);

  const items = useMemo(() => (data?.items ?? []).filter((i) => !done.has(i.id)), [data, done]);
  const preview = previewId ? (data?.items.find((i) => i.id === previewId) ?? null) : null;
  const nameOf = (i: ReviewItem) => (i.requirement ? tr(i.requirement.title) : i.originalName);

  const nextAfter = (id: string) => {
    const idx = items.findIndex((i) => i.id === id);
    return items.filter((i) => i.id !== id)[Math.max(0, idx)]?.id ?? null;
  };

  const send = (item: ReviewItem, decision: Decision, note?: string, marks?: ReviewMark[]) => {
    if (previewId === item.id) setPreviewId(nextAfter(item.id));
    setDone((d) => new Set(d).add(item.id));
    const url = `/admin/cases/${item.caseId}/documents/${item.id}/review`;
    const body = { status: decision, ...(decision === 'REJECTED' ? { note, ...(marks?.length ? { reviewMarks: marks } : {}) } : {}) };
    delayedCommit({
      message: t(decision === 'ACCEPTED' ? 'sp.review.approvedToast' : 'sp.review.rejectedToast', { name: nameOf(item) }),
      commit: () => api.post(url, body),
      keepalive: { method: 'POST', url, body },
      onCommitted: () => {
        void qc.invalidateQueries({ queryKey: ['staff-review-queue'] });
        void qc.invalidateQueries({ queryKey: ['admin-case', item.caseId] });
        void qc.invalidateQueries({ queryKey: ['admin-cases'] });
        void qc.invalidateQueries({ queryKey: ['my-work'] });
      },
      rollback: () =>
        setDone((d) => {
          const next = new Set(d);
          next.delete(item.id);
          return next;
        }),
    });
  };

  const flagsOf = (i: ReviewItem) => (i.insight?.flags.length ?? 0) + (i.insight?.qualityLevel === 'BAD' || i.insight?.qualityLevel === 'WARN' ? 1 : 0);
  const pos = preview ? items.findIndex((i) => i.id === preview.id) + 1 : 0;

  return (
    <div className="-mx-1 space-y-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-ink">{t('smob.review.title')}</h1>
          {data && <p className="text-xs text-muted">{t('smob.review.waiting', { count: Math.max(0, data.total - done.size) })}</p>}
        </div>
        <div className="flex shrink-0 rounded-xl bg-sunken p-1" role="group" aria-label={t('smob.review.title')}>
          {(['mine', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scope === s}
              onClick={() => setScope(s)}
              className={clsx('min-h-10 rounded-lg px-3 text-sm font-medium transition', scope === s ? 'bg-card text-ink shadow-[var(--tv-shadow-card)]' : 'text-muted')}
            >
              {t(`smob.review.${s}`)} {data && <span className="tabular-nums">{data.counts[s]}</span>}
            </button>
          ))}
        </div>
      </div>
      <p className="px-1 text-[11px] text-muted">{t('smob.swipe.hint')}</p>

      {isLoading ? (
        <div className="grid place-items-center py-16 text-muted">
          <Spinner className="size-6" />
        </div>
      ) : error ? (
        <div className="py-12 text-center text-sm">
          <p className="text-danger-fg">{t('admin.common.loadFailed')}</p>
          <button type="button" className="btn-secondary mt-3 min-h-11" onClick={() => refetch()}>
            {t('admin.common.retry')}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <PartyPopper className="size-10 text-success-fg" aria-hidden />
          <p className="text-base font-semibold text-ink">{t('smob.review.empty')}</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((i) => {
            const flags = flagsOf(i);
            return (
              <li key={i.id}>
                <SwipeRow
                  right={{ label: t('smob.review.accept'), icon: Check, tone: 'success', onTrigger: () => send(i, 'ACCEPTED') }}
                  left={{ label: t('smob.review.reject'), icon: X, tone: 'danger', onTrigger: () => setRejecting(i) }}
                >
                  <div className="rounded-xl border border-line bg-card p-3">
                    <button type="button" onClick={() => setPreviewId(i.id)} className="flex w-full min-w-0 items-start gap-3 text-left">
                      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-sunken text-muted" aria-hidden>
                        <FileText className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{nameOf(i)}</span>
                        <span className="block truncate text-xs text-muted">
                          {fullName(i.case.client)} · <span className="code-id">{i.case.number}</span>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                          <span>{t('sp.review.uploaded', { when: fmtRelative(i.createdAt) })}</span>
                          {flags > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-1.5 py-0.5 font-medium text-warning-fg">
                              <AlertTriangle className="size-3" aria-hidden /> {t('smob.review.flags', { count: flags })}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button type="button" className="btn-secondary min-h-11 justify-center" onClick={() => setPreviewId(i.id)}>
                        <Eye className="size-4" aria-hidden /> {t('smob.review.preview')}
                      </button>
                      <button type="button" className="btn-secondary min-h-11 justify-center text-danger-fg" onClick={() => setRejecting(i)}>
                        <X className="size-4" aria-hidden /> {t('smob.review.reject')}
                      </button>
                      <button type="button" className="btn-primary min-h-11 justify-center" onClick={() => send(i, 'ACCEPTED')}>
                        <Check className="size-4" aria-hidden /> {t('smob.review.accept')}
                      </button>
                    </div>
                  </div>
                </SwipeRow>
              </li>
            );
          })}
        </ul>
      )}
      <p className="px-1 pt-2 text-center text-[11px] text-muted">{t('smob.review.desktopHint')}</p>

      <BottomSheet
        open={!!preview}
        onClose={() => setPreviewId(null)}
        full
        title={preview ? nameOf(preview) : ''}
        subtitle={preview ? `${fullName(preview.case.client)} · ${preview.case.number} · ${t('smob.review.position', { pos, total: items.length })}` : undefined}
        footer={
          preview && (
            <>
              <button type="button" className="btn-secondary min-h-14 flex-1 justify-center text-base text-danger-fg" onClick={() => setRejecting(preview)}>
                <X className="size-5" aria-hidden /> {t('smob.review.reject')}
              </button>
              <button type="button" className="btn-primary min-h-14 flex-1 justify-center text-base" onClick={() => send(preview, 'ACCEPTED')}>
                <Check className="size-5" aria-hidden /> {t('smob.review.accept')}
              </button>
            </>
          )
        }
      >
        {preview && (
          <div className="flex h-full min-h-[60dvh] flex-col">
            <div className="min-h-0 flex-1">
              <DocViewer doc={preview} view={view} onView={setView} />
            </div>
            <div className="space-y-1 border-t border-line px-4 py-3 text-xs text-muted">
              {preview.requirement?.description && <p className="line-clamp-3">{tr(preview.requirement.description)}</p>}
              {preview.insight && preview.insight.flags.length > 0 && (
                <p className="flex flex-wrap gap-1">
                  {preview.insight.flags.map((f) => (
                    <span key={f} className="rounded-full bg-warning-bg px-1.5 py-0.5 font-medium text-warning-fg">
                      {t(`uploadAi.staff.flags.${f}`, { defaultValue: f })}
                    </span>
                  ))}
                </p>
              )}
              <Link to={`/admin/cases/${preview.case.id}`} className="inline-flex min-h-11 items-center font-medium text-link">
                {preview.case.number}
              </Link>
            </div>
          </div>
        )}
      </BottomSheet>

      <RejectDialog
        open={!!rejecting}
        doc={rejecting}
        suggested={rejecting ? suggestedReasons(rejecting.insight?.flags ?? [], rejecting.insight?.qualityLevel) : []}
        onClose={() => setRejecting(null)}
        onConfirm={(note, marks) => {
          const item = rejecting;
          setRejecting(null);
          if (item) send(item, 'REJECTED', note, marks);
        }}
      />
    </div>
  );
};
