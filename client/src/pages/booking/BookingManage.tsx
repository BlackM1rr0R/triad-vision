import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, CalendarPlus, CalendarX2, CheckCircle2, Clock, ExternalLink, Globe2, MessageSquare, UserRound, Video, XCircle } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { bookingCopy } from '@/i18n/pagesBooking';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
import { BOOKING_STATUS_TONE, browserTimeZone, fmtTime, useDayLabels, type BookingStatus, type Topic } from '@/components/booking/time';

registerCopy(bookingCopy);

interface ManagedBooking {
  id: string;
  status: BookingStatus;
  name: string;
  email: string;
  phone: string | null;
  topic: Topic | null;
  message: string | null;
  startsAt: string;
  endsAt: string;
  meetingUrl: string | null;
  staffName: string;
  canCancel: boolean;
}

const HERO = 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=2000&q=70';

export default function BookingManage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('bookingManage.title'));
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const qc = useQueryClient();
  const tz = useMemo(browserTimeZone, []);
  const labels = useDayLabels();
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');

  const q = useQuery({
    queryKey: ['booking-manage', token],
    queryFn: async () => (await api.get<{ booking: ManagedBooking }>('/booking/manage', { params: { token } })).data.booking,
    enabled: token.length >= 20,
    retry: false,
  });

  const cancel = useMutation({
    mutationFn: async () => (await api.post<{ booking: ManagedBooking }>('/booking/manage/cancel', { token, reason: reason.trim() || undefined })).data.booking,
    onSuccess: (b) => {
      qc.setQueryData(['booking-manage', token], b);
      void qc.invalidateQueries({ queryKey: ['booking-slots'] });
      setConfirm(false);
      toast.success(t('bookingManage.cancelled'));
    },
    onError: (err) => {
      const code = errorCode(err);
      toast.error(i18n.exists(`bookingManage.errors.${code}`) ? t(`bookingManage.errors.${code}`) : t('bookingManage.errors.default'));
      void q.refetch();
    },
  });

  const b = q.data;
  const started = b ? new Date(b.startsAt).getTime() <= Date.now() : false;

  return (
    <>
      <PageHero title={t('bookingManage.title')} subtitle={t('bookingManage.subtitle')} image={HERO} crumb={{ to: '/booking', label: t('bookingPage.title') }} />
      <section className="section-sm">
        <div className="container-x">
          <div className="mx-auto max-w-2xl">
            {token.length < 20 ? (
              <Notice icon={AlertTriangle} title={t('bookingManage.notFound')} text={t('bookingManage.missingToken')} />
            ) : q.isLoading ? (
              <div className="grid min-h-60 place-items-center text-brand-600" role="status">
                <Spinner className="size-8 border-[3px]" />
              </div>
            ) : !b ? (
              <Notice icon={CalendarX2} title={t('bookingManage.notFound')} text={t('bookingManage.notFoundText')} />
            ) : (
              <div className="card overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-surface px-5 py-5 sm:px-7">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-wider text-muted uppercase">{t('bookingManage.when')}</p>
                    <p className="mt-1 font-display text-xl font-extrabold text-navy-900 sm:text-2xl">{labels.long(b.startsAt, tz)}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-ink/80 tabular-nums">
                      <Clock className="size-4 text-brand-600" aria-hidden />
                      {fmtTime(b.startsAt, tz)}–{fmtTime(b.endsAt, tz)}
                    </p>
                  </div>
                  <span className={clsx('badge shrink-0', BOOKING_STATUS_TONE[b.status])}>{t(`bookingManage.status.${b.status}`)}</span>
                </div>

                <div className="card-pad space-y-5">
                  <dl className="grid gap-4 text-sm sm:grid-cols-2">
                    <div className="rounded-xl border border-line p-3">
                      <dt className="flex items-center gap-1.5 text-xs text-muted">
                        <Globe2 className="size-3.5" aria-hidden /> {t('bookingPage.baku')} / {t('bookingPage.berlin')}
                      </dt>
                      <dd className="mt-1 font-semibold text-navy-900 tabular-nums">
                        {fmtTime(b.startsAt, 'Asia/Baku')} · {fmtTime(b.startsAt, 'Europe/Berlin')}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-line p-3">
                      <dt className="flex items-center gap-1.5 text-xs text-muted">
                        <UserRound className="size-3.5" aria-hidden /> {t('bookingManage.with')}
                      </dt>
                      <dd className="mt-1 font-semibold text-navy-900">Triad Vision · {b.staffName}</dd>
                    </div>
                    <div className="rounded-xl border border-line p-3 sm:col-span-2">
                      <dt className="flex items-center gap-1.5 text-xs text-muted">
                        <MessageSquare className="size-3.5" aria-hidden /> {t('bookingManage.topic')}
                      </dt>
                      <dd className="mt-1 font-semibold text-navy-900">{t(`bookingCommon.topic.${b.topic ?? 'other'}`)}</dd>
                      {b.message && <dd className="mt-1 text-sm whitespace-pre-line text-muted">{b.message}</dd>}
                    </div>
                  </dl>

                  {b.status === 'BOOKED' && b.meetingUrl && (
                    <div className="rounded-xl bg-navy-900 p-4 text-white sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-white/75">{t('bookingManage.joinHint')}</p>
                        <a href={b.meetingUrl} target="_blank" rel="noopener noreferrer" className="btn-primary shrink-0">
                          <Video className="size-4" aria-hidden /> {t('bookingManage.join')} <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      </div>
                    </div>
                  )}

                  {b.status === 'CANCELLED' && (
                    <div className="flex items-center gap-3 rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
                      <XCircle className="size-5 shrink-0" aria-hidden />
                      {t('bookingManage.cancelled')}
                    </div>
                  )}
                  {b.status === 'BOOKED' && started && (
                    <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                      <Clock className="size-5 shrink-0" aria-hidden />
                      {t('bookingManage.started')}
                    </div>
                  )}

                  {confirm && b.canCancel && (
                    <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 sm:p-5" role="region" aria-label={t('bookingManage.cancelTitle')}>
                      <p className="font-semibold text-navy-900">{t('bookingManage.cancelTitle')}</p>
                      <p className="mt-1 text-sm text-muted">{t('bookingManage.cancelText')}</p>
                      <label className="label mt-3" htmlFor="bm-reason">{t('bookingManage.reason')}</label>
                      <textarea id="bm-reason" className="input resize-y" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button type="button" className="btn-white btn-sm border border-line" onClick={() => setConfirm(false)} disabled={cancel.isPending}>
                          {t('bookingManage.keep')}
                        </button>
                        <button type="button" className="btn-danger btn-sm" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                          {cancel.isPending && <Spinner className="size-3.5" />}
                          {t('bookingManage.confirmCancel')}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {b.status === 'BOOKED' && (
                      <a href={`/api/booking/ics?token=${encodeURIComponent(token)}`} className="btn-ghost btn-sm" download>
                        <CalendarPlus className="size-4" aria-hidden /> {t('bookingManage.calendar')}
                      </a>
                    )}
                    {b.canCancel && !confirm && (
                      <button type="button" className="btn-white btn-sm border border-red-200 text-danger hover:bg-red-50" onClick={() => setConfirm(true)}>
                        <CalendarX2 className="size-4" aria-hidden /> {t('bookingManage.cancel')}
                      </button>
                    )}
                    {b.status !== 'BOOKED' && (
                      <Link to="/booking" className="btn-primary btn-sm">
                        <CheckCircle2 className="size-4" aria-hidden /> {t('bookingManage.rebook')}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

    </>
  );
}

const Notice = ({ icon: I, title, text }: { icon: typeof AlertTriangle; title: string; text: string }) => {
  const { t } = useTranslation();
  return (
    <div className="card card-pad flex flex-col items-center py-12 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-surface text-muted">
        <I className="size-7" aria-hidden />
      </span>
      <h2 className="mt-4 font-display text-xl font-bold text-navy-900">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted">{text}</p>
      <Link to="/booking" className="btn-primary mt-6">
        {t('bookingManage.rebook')}
      </Link>
    </div>
  );
};
