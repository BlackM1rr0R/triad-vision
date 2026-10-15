import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  AlertCircle,
  Building2,
  CalendarCheck2,
  CalendarPlus,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe2,
  MessageCircleQuestion,
  RefreshCw,
  Send,
  Settings2,
  UserRound,
  Video,
} from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { bookingCopy } from '@/i18n/pagesBooking';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
import { TOPICS, browserTimeZone, fmtTime, useDayLabels, zoned, type Topic } from '@/components/booking/time';

registerCopy(bookingCopy);

interface Slot {
  id: string;
  startsAt: string;
  endsAt: string;
}
interface BookResult {
  booking: { id: string; status: string; startsAt: string; endsAt: string; meetingUrl: string; topic: Topic };
  manageToken: string;
}

const TOPIC_ICON = { candidate: UserRound, company: Building2, other: MessageCircleQuestion } as const;
const SLOT_ERRORS = new Set(['SLOT_TAKEN', 'SLOT_NOT_FOUND', 'SLOT_TOO_SOON']);

const StepTitle = ({ n, children }: { n: number; children: string }) => (
  <h2 className="mb-4 flex items-center gap-3 font-display text-lg font-bold text-navy-900 sm:text-xl">
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-navy-900 text-sm font-bold text-white" aria-hidden>
      {n}
    </span>
    {children}
  </h2>
);

export default function Booking() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('bookingPage.title'));
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const tz = useMemo(browserTimeZone, []);
  const labels = useDayLabels();

  const initialTopic = params.get('topic');
  const [topic, setTopic] = useState<Topic | null>((TOPICS as readonly string[]).includes(initialTopic ?? '') ? (initialTopic as Topic) : null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', consent: false, website: '' });
  const [done, setDone] = useState<BookResult | null>(null);

  // Prefill from the logged-in account once it is known (never overwrite what the visitor typed).
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      name: f.name || `${user.firstName} ${user.lastName}`.trim(),
      email: f.email || user.email,
      phone: f.phone || user.phone || '',
    }));
    if (!topic && user.role === 'COMPANY') setTopic('company');
    if (!topic && user.role === 'CLIENT') setTopic('candidate');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const slotsQ = useQuery({
    queryKey: ['booking-slots'],
    queryFn: async () => (await api.get<{ slots: Slot[] }>('/booking/slots')).data.slots,
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slotsQ.data ?? []) {
      const k = zoned(s.startsAt, tz).key;
      const list = map.get(k) ?? [];
      list.push(s);
      map.set(k, list);
    }
    return [...map.entries()];
  }, [slotsQ.data, tz]);

  // Keep the selected day valid as slots refresh.
  useEffect(() => {
    if (!days.length) return;
    if (!day || !days.some(([k]) => k === day)) setDay(days[0][0]);
  }, [days, day]);
  useEffect(() => {
    if (slot && slotsQ.data && !slotsQ.data.some((s) => s.id === slot.id)) setSlot(null);
  }, [slotsQ.data, slot]);

  const daySlots = days.find(([k]) => k === day)?.[1] ?? [];

  const errText = (err: unknown) => {
    const code = errorCode(err);
    return i18n.exists(`bookingPage.errors.${code}`) ? t(`bookingPage.errors.${code}`) : t('bookingPage.errors.default');
  };

  const book = useMutation({
    mutationFn: async () =>
      (
        await api.post<BookResult>('/booking', {
          slotId: slot!.id,
          topic,
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          message: form.message.trim(),
          consent: form.consent,
          website: form.website,
          locale: i18n.resolvedLanguage?.slice(0, 2) ?? 'az',
        })
      ).data,
    onSuccess: (data) => {
      setDone(data);
      void qc.invalidateQueries({ queryKey: ['booking-slots'] });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (err) => {
      toast.error(errText(err));
      if (SLOT_ERRORS.has(errorCode(err))) {
        setSlot(null);
        void qc.invalidateQueries({ queryKey: ['booking-slots'] });
      }
    },
  });

  const ready = !!topic && !!slot && form.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.email) && form.consent;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!topic || !slot) {
      toast.error(t('bookingPage.chooseFirst'));
      return;
    }
    if (ready && !book.isPending) book.mutate();
  };

  const minutes = slot ? Math.round((new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) / 60000) : 0;

  return (
    <>
      <PageHero
        title={t('bookingPage.title')}
        subtitle={t('bookingPage.subtitle')}
        image="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=2000&q=70"
      >
        <ul className="mt-6 flex flex-wrap gap-2">
          {(t('bookingPage.perks', { returnObjects: true }) as string[]).map((p) => (
            <li key={p} className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white/90">
              <CheckCircle2 className="size-3.5 text-brand-400" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
      </PageHero>

      <section className="section-sm">
        <div className="container-x">
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div key="done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl">
                <Success result={done} email={form.email} tz={tz} onAnother={() => { setDone(null); setSlot(null); }} />
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={submit}
                exit={{ opacity: 0, y: -10 }}
                className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8"
                noValidate
              >
                <div className="min-w-0 space-y-6">
                  {/* Step 1: topic */}
                  <div className="card card-pad">
                    <StepTitle n={1}>{t('bookingPage.step1')}</StepTitle>
                    <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t('bookingPage.step1')}>
                      {TOPICS.map((k) => {
                        const I = TOPIC_ICON[k];
                        const on = topic === k;
                        return (
                          <button
                            key={k}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setTopic(k)}
                            className={clsx(
                              'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition',
                              on ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-brand-400',
                            )}
                          >
                            <span className={clsx('grid size-10 shrink-0 place-items-center rounded-lg transition', on ? 'bg-brand-600 text-white' : 'bg-surface text-navy-900')}>
                              <I className="size-5" aria-hidden />
                            </span>
                            <span className="min-w-0">
                              <span className="block font-semibold text-navy-900">{t(`bookingPage.topics.${k}.title`)}</span>
                              <span className="mt-0.5 block text-xs text-muted">{t(`bookingPage.topics.${k}.text`)}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 2: day and time */}
                  <div className="card card-pad">
                    <StepTitle n={2}>{t('bookingPage.step2')}</StepTitle>
                    <p className="-mt-1 mb-4 flex items-center gap-1.5 text-xs text-muted">
                      <Globe2 className="size-3.5 shrink-0" aria-hidden />
                      {t('bookingPage.tzNote', { tz })}
                    </p>

                    {slotsQ.isLoading ? (
                      <div className="grid min-h-40 place-items-center text-brand-600" role="status">
                        <Spinner className="size-7 border-[3px]" />
                      </div>
                    ) : slotsQ.error ? (
                      <div className="flex flex-col items-center gap-3 rounded-xl bg-red-50 p-6 text-center text-sm text-red-800" role="alert">
                        <AlertCircle className="size-5" aria-hidden />
                        {t('bookingPage.loadFailed')}
                        <button type="button" className="btn-white btn-sm border border-line" onClick={() => slotsQ.refetch()}>
                          <RefreshCw className="size-3.5" aria-hidden /> {t('bookingPage.retry')}
                        </button>
                      </div>
                    ) : days.length === 0 ? (
                      <div className="rounded-xl bg-surface p-6 text-center">
                        <CalendarCheck2 className="mx-auto size-7 text-muted" aria-hidden />
                        <p className="mt-2 font-semibold text-navy-900">{t('bookingPage.noSlots')}</p>
                        <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t('bookingPage.noSlotsText')}</p>
                        <Link to="/contact" className="btn-ghost btn-sm mt-4">
                          {t('bookingPage.contactLink')}
                        </Link>
                      </div>
                    ) : (
                      <>
                        <p className="label">{t('bookingPage.pickDay')}</p>
                        <div className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:thin] sm:-mx-6 sm:px-6 lg:-mx-7 lg:px-7">
                          {days.map(([k, list]) => {
                            const c = labels.chip(list[0].startsAt, tz);
                            const rel = labels.relative(k, tz);
                            const on = k === day;
                            return (
                              <button
                                key={k}
                                type="button"
                                aria-pressed={on}
                                onClick={() => setDay(k)}
                                className={clsx(
                                  'flex w-[4.75rem] shrink-0 snap-start flex-col items-center rounded-xl border px-2 py-2.5 text-center transition',
                                  on ? 'border-navy-900 bg-navy-900 text-white shadow-lg shadow-navy-900/20' : 'border-line bg-card text-navy-900 hover:border-brand-400',
                                )}
                              >
                                <span className={clsx('text-[11px] font-semibold uppercase', on ? 'text-white/70' : 'text-muted')}>{rel ?? c.weekday}</span>
                                <span className="font-display text-xl leading-tight font-extrabold">{c.day}</span>
                                <span className={clsx('text-[11px]', on ? 'text-white/70' : 'text-muted')}>{c.month}</span>
                                <span className={clsx('mt-1 rounded-full px-1.5 text-[10px] font-semibold', on ? 'bg-white/15' : 'bg-brand-50 text-brand-700')}>
                                  {t('bookingPage.slotsCount', { count: list.length })}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {day && (
                          <>
                            <p className="label mt-5">
                              {t('bookingPage.pickTime')} · <span className="font-normal text-muted">{labels.long(daySlots[0]?.startsAt ?? new Date(), tz)}</span>
                            </p>
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6" role="radiogroup" aria-label={t('bookingPage.pickTime')}>
                              {daySlots.map((s) => {
                                const on = slot?.id === s.id;
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={on}
                                    onClick={() => setSlot(s)}
                                    className={clsx(
                                      'min-h-11 rounded-lg border text-sm font-semibold tabular-nums transition',
                                      on ? 'border-brand-600 bg-brand-600 text-white shadow-md shadow-brand-600/25' : 'border-line bg-card text-navy-900 hover:border-brand-500 hover:text-brand-700',
                                    )}
                                  >
                                    {fmtTime(s.startsAt, tz)}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Step 3: details + summary */}
                <div className="min-w-0 lg:sticky lg:top-28 lg:self-start">
                  <div className="card card-pad">
                    <StepTitle n={3}>{t('bookingPage.step3')}</StepTitle>

                    <div className={clsx('mb-5 rounded-xl p-4', slot ? 'bg-navy-900 text-white' : 'border border-dashed border-line text-muted')}>
                      {slot ? (
                        <>
                          <p className="text-[11px] font-semibold tracking-wider text-white/60 uppercase">{t('bookingPage.selected')}</p>
                          <p className="mt-1 font-display text-lg font-bold">{labels.long(slot.startsAt, tz)}</p>
                          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/85">
                            <span className="inline-flex items-center gap-1.5">
                              <Clock className="size-3.5" aria-hidden />
                              {fmtTime(slot.startsAt, tz)}–{fmtTime(slot.endsAt, tz)}
                            </span>
                            <span>{t('bookingPage.minutes', { count: minutes })}</span>
                            {topic && <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{t(`bookingCommon.topic.${topic}`)}</span>}
                          </p>
                          <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-white/15 pt-3 text-xs">
                            <div>
                              <dt className="text-white/60">{t('bookingPage.baku')}</dt>
                              <dd className="font-semibold tabular-nums">{fmtTime(slot.startsAt, 'Asia/Baku')}</dd>
                            </div>
                            <div>
                              <dt className="text-white/60">{t('bookingPage.berlin')}</dt>
                              <dd className="font-semibold tabular-nums">{fmtTime(slot.startsAt, 'Europe/Berlin')}</dd>
                            </div>
                          </dl>
                        </>
                      ) : (
                        <p className="flex items-center gap-2 text-sm">
                          <CalendarCheck2 className="size-4 shrink-0" aria-hidden />
                          {t('bookingPage.nothingSelected')}
                        </p>
                      )}
                    </div>

                    {/* honeypot for bots */}
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                    <div className="grid gap-4">
                      <div>
                        <label className="label" htmlFor="bk-name">{t('bookingPage.name')} *</label>
                        <input id="bk-name" className="input" required minLength={2} maxLength={120} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                      </div>
                      <div>
                        <label className="label" htmlFor="bk-email">{t('bookingPage.email')} *</label>
                        <input id="bk-email" className="input" type="email" required maxLength={200} autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                      </div>
                      <div>
                        <label className="label" htmlFor="bk-phone">{t('bookingPage.phone')}</label>
                        <input id="bk-phone" className="input" type="tel" maxLength={40} autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                      </div>
                      <div>
                        <label className="label" htmlFor="bk-msg">{t('bookingPage.message')}</label>
                        <textarea id="bk-msg" className="input resize-y" rows={3} maxLength={2000} placeholder={t('bookingPage.messagePlaceholder')} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                      </div>
                      <label className="flex items-start gap-2.5 text-xs text-muted">
                        <input type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-brand-600" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
                        <span>
                          {t('bookingPage.consent')}{' '}
                          <Link to="/privacy" target="_blank" className="font-semibold text-brand-600 underline-offset-2 hover:underline">
                            {t('bookingPage.privacy')}
                          </Link>
                        </span>
                      </label>
                      <button type="submit" className="btn-primary w-full" disabled={!ready || book.isPending}>
                        {book.isPending ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />}
                        {book.isPending ? t('bookingPage.submitting') : t('bookingPage.submit')}
                      </button>
                      {(!topic || !slot) && <p className="-mt-2 text-center text-xs text-muted">{t('bookingPage.chooseFirst')}</p>}
                    </div>
                  </div>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </section>
    </>
  );
}

const Success = ({ result, email, tz, onAnother }: { result: BookResult; email: string; tz: string; onAnother: () => void }) => {
  const { t } = useTranslation();
  const labels = useDayLabels();
  const b = result.booking;
  const token = encodeURIComponent(result.manageToken);
  return (
    <div className="card overflow-hidden" role="status">
      <div className="bg-navy-900 px-6 py-8 text-center text-white sm:px-10">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.1 }} className="mx-auto grid size-16 place-items-center rounded-full bg-success">
          <CheckCircle2 className="size-8" aria-hidden />
        </motion.span>
        <h2 className="mt-4 font-display text-2xl font-extrabold">{t('bookingPage.successTitle')}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/75">{t('bookingPage.successText', { email })}</p>
      </div>
      <div className="card-pad space-y-5">
        <div className="rounded-xl bg-surface p-4">
          <p className="font-display text-lg font-bold text-navy-900">{labels.long(b.startsAt, tz)}</p>
          <p className="text-sm text-muted tabular-nums">
            {fmtTime(b.startsAt, tz)}–{fmtTime(b.endsAt, tz)} · {t('bookingPage.baku')} {fmtTime(b.startsAt, 'Asia/Baku')} · {t('bookingPage.berlin')} {fmtTime(b.startsAt, 'Europe/Berlin')}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <a href={b.meetingUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">
            <Video className="size-4" aria-hidden /> {t('bookingPage.join')} <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <a href={`/api/booking/ics?token=${token}`} className="btn-ghost" download>
            <CalendarPlus className="size-4" aria-hidden /> {t('bookingPage.addCalendar')}
          </a>
          <Link to={`/booking/manage?token=${token}`} className="btn-white border border-line">
            <Settings2 className="size-4" aria-hidden /> {t('bookingPage.manage')}
          </Link>
          <button type="button" className="btn-white border border-line" onClick={onAnother}>
            <CalendarCheck2 className="size-4" aria-hidden /> {t('bookingPage.another')}
          </button>
        </div>
      </div>
    </div>
  );
};
