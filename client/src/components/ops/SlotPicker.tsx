import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesInterviewCalendar } from '@/i18n/pagesInterviewCalendar';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { toastOpsError } from './shared';
import { fmtDay, groupByBakuDay, type InterviewInvite, type Slot } from './interviewCalendar';

registerCopy(pagesInterviewCalendar);

/**
 * Candidate: free slots of one invite, grouped by Baku day, Baku time first and German time beside
 * it. Picking books the slot (or moves the booked interview when the invite already has one).
 */
export const SlotPicker = ({ invite, onClose, onDone }: { invite: InterviewInvite | null; onClose: () => void; onDone: () => void }) => {
  const { t, i18n } = useTranslation();
  const [chosen, setChosen] = useState<string | null>(null);
  const slots = useQuery({
    queryKey: ['interview-invite-slots', invite?.id],
    queryFn: async () => (await api.get<{ slots: Slot[] }>(`/interview-calendar/invites/${invite!.id}/slots`)).data.slots,
    enabled: !!invite,
  });
  const book = useMutation({
    mutationFn: (startsAt: string) => api.post(`/interview-calendar/invites/${invite!.id}/book`, { startsAt }),
    onSuccess: () => {
      toast.success(t(invite?.interview ? 'ivcal.moved' : 'ivcal.booked'));
      setChosen(null);
      onDone();
    },
    onError: (err) => {
      toastOpsError(err);
      void slots.refetch();
    },
  });
  const current = invite?.interview?.startsAt;

  return (
    <Modal
      open={!!invite}
      onClose={onClose}
      title={t(invite?.interview ? 'ivcal.change' : 'ivcal.pickTitle')}
      description={`${t('ivcal.pickHint')} ${invite ? t('ivcal.minutes', { count: invite.minutes }) : ''}`}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>{t('ops.common.cancel')}</button>
          <button type="button" className="btn-primary btn-sm" disabled={!chosen || book.isPending} onClick={() => chosen && book.mutate(chosen)}>
            {book.isPending ? <Spinner className="size-3.5" /> : <CheckCircle2 className="size-3.5" />} {t('ivcal.book')}
          </button>
        </>
      }
    >
      {slots.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" /> {t('ivcal.loadingSlots')}</p>
      ) : !slots.data?.length ? (
        <p className="text-sm text-muted">{t('ivcal.noSlots')}</p>
      ) : (
        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {groupByBakuDay(slots.data).map(([day, list]) => (
            <section key={day}>
              <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{fmtDay(day, i18n.language)}</h4>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {list.map((s) => (
                  <li key={s.startsAt}>
                    <button
                      type="button"
                      aria-pressed={chosen === s.startsAt}
                      disabled={s.startsAt === current}
                      onClick={() => setChosen(s.startsAt)}
                      className={clsx(
                        'w-full rounded-lg border px-3 py-2 text-left transition disabled:opacity-50',
                        chosen === s.startsAt ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-500/30' : 'border-line hover:border-brand-400',
                      )}
                    >
                      <span className="block text-sm font-semibold text-navy-900">{s.baku.time}–{s.baku.until} <span className="font-normal text-muted">{t('ivcal.baku')}</span></span>
                      <span className="block text-[11px] text-muted">
                        {s.berlin.time} {t('ivcal.germany')}{s.berlin.day !== s.baku.day ? ` (${fmtDay(s.berlin.day, i18n.language)})` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
};
