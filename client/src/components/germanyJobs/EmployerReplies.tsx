import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, MailOpen, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import i18n, { registerCopy } from '@/i18n';
import { pagesEmailDelivery } from '@/i18n/pagesEmailDelivery';
import { Badge } from '@/components/ui/Badge';
import type { BadgeTone } from '@/components/ui/status';
import { Button } from '@/components/ui/Button';
import { fmtDateTime } from '@/components/admin/labels';

registerCopy(pagesEmailDelivery);

/** Employer answer found in the agency mailbox (server lib/germanyJobs/replies.ts); staff only. */
export interface EmployerReply {
  id: string;
  from: string;
  subject: string | null;
  excerpt: string | null;
  receivedAt: string;
  matchedBy: 'MESSAGE_ID' | 'DOMAIN';
  classification: 'INTERVIEW' | 'REJECTION' | 'DOCUMENTS' | 'OTHER';
  suggestedStatus: 'INTERVIEW' | 'REJECTED' | null;
  resolution: 'APPLIED' | 'KEPT' | null;
  resolvedAt: string | null;
}

const CLASS_TONE: Record<EmployerReply['classification'], BadgeTone> = { INTERVIEW: 'success', REJECTION: 'danger', DOCUMENTS: 'warning', OTHER: 'neutral' };

const replyError = (err: unknown) => {
  const key = `adminDelivery.errors.${errorCode(err)}`;
  return String(i18n.t(i18n.exists(key) ? key : 'adminDelivery.errors.generic'));
};

/**
 * "İşəgötürən cavabları" in the staff view of an application: the answer, the keyword suggestion and one click to
 * apply it (INTERVIEW / REJECTED, the client is notified as for any status change) or keep the status. Nothing
 * changes by itself. `onUpdate` receives the refreshed application view.
 */
export const EmployerReplies = <T,>({ inquiryId, replies, onUpdate }: { inquiryId: string; replies: EmployerReply[]; onUpdate: (view: T) => void }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: async (v: { id: string; action: 'APPLY' | 'KEEP' }) => (await api.post<T>(`/admin/external-applications/${inquiryId}/replies/${v.id}`, { action: v.action })).data,
    onSuccess: (data) => {
      onUpdate(data);
      toast.success(t('adminDelivery.replies.saved'));
    },
    onError: (err) => toast.error(replyError(err)),
  });
  if (!replies.length) return null;

  return (
    <section className="rounded-lg border border-line p-3" aria-label={t('adminDelivery.replies.title')}>
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <MailOpen className="size-4 text-link" aria-hidden />
        {t('adminDelivery.replies.title')}
      </h4>
      <p className="mt-0.5 text-[11px] text-muted">{t('adminDelivery.replies.hint')}</p>
      <ul className="mt-2 divide-y divide-line">
        {replies.map((r) => {
          const long = (r.excerpt ?? '').length > 280;
          const text = open === r.id || !long ? r.excerpt : `${(r.excerpt ?? '').slice(0, 280)}…`;
          return (
            <li key={r.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={CLASS_TONE[r.classification]} dot>
                  {t(`adminDelivery.replies.classes.${r.classification}`)}
                </Badge>
                <span className="font-medium text-ink break-all">{r.from}</span>
                <span className="text-xs text-muted">
                  {fmtDateTime(r.receivedAt)} · {t(`adminDelivery.replies.matchedBy.${r.matchedBy}`)}
                </span>
              </div>
              {r.subject && <p className="mt-1 font-medium text-ink">{r.subject}</p>}
              {text && <p className="mt-1 whitespace-pre-line text-xs text-muted">{text}</p>}
              {long && (
                <button type="button" className="mt-1 text-xs text-link hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  {t('adminDelivery.replies.showMore')}
                </button>
              )}
              {r.resolution ? (
                <p className="mt-1 text-xs text-muted">
                  {t(`adminDelivery.replies.done.${r.resolution}`)}
                  {r.resolvedAt ? ` · ${fmtDateTime(r.resolvedAt)}` : ''}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ink">
                    {r.suggestedStatus ? t('adminDelivery.replies.suggestion', { status: t(`xapp.portal.status.${r.suggestedStatus}`) }) : t('adminDelivery.replies.noSuggestion')}
                  </span>
                  {r.suggestedStatus && (
                    <Button size="sm" icon={Check} loading={act.isPending && act.variables?.id === r.id && act.variables.action === 'APPLY'} onClick={() => act.mutate({ id: r.id, action: 'APPLY' })}>
                      {t('adminDelivery.replies.apply')}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={X} loading={act.isPending && act.variables?.id === r.id && act.variables.action === 'KEEP'} onClick={() => act.mutate({ id: r.id, action: 'KEEP' })}>
                    {t('adminDelivery.replies.keep')}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
