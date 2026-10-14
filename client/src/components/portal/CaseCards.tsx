import { useMemo } from 'react';
import clsx from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { CalendarDays, CalendarPlus, Download, ExternalLink, FileText, History, MapPin, PartyPopper, ShieldX } from 'lucide-react';
import { fileUrl, formatBytes } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail } from '@/lib/types';

// ─── Appointment ────────────────────────────────────────────────────────

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export const downloadIcs = (opts: { uid: string; start: Date; title: string; place: string | null; description: string }) => {
  const end = new Date(opts.start.getTime() + 60 * 60 * 1000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Triad Vision//Client Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${opts.uid}@triadvision`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(opts.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(opts.title)}`,
    ...(opts.place ? [`LOCATION:${icsText(opts.place)}`] : []),
    `DESCRIPTION:${icsText(opts.description)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(opts.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${opts.uid}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const AppointmentCard = ({ data }: { data: CaseDetail }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  if (!data.appointmentAt) return null;
  const at = new Date(data.appointmentAt);
  const upcoming = at.getTime() > Date.now();
  const title = `${t('portal.appointment.title')} · ${data.number}`;

  return (
    <section id="appointment" className="card relative scroll-mt-28 overflow-hidden p-5 sm:p-6 lg:scroll-mt-36" aria-labelledby="appointment-title">
      <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-[radial-gradient(closest-side,var(--color-violet-200),transparent)] opacity-40" aria-hidden />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex w-20 shrink-0 flex-col overflow-hidden rounded-xl border border-violet-200 bg-white text-center shadow-sm" aria-hidden>
          <span className="bg-violet-600 py-1 text-[11px] font-bold tracking-wider text-white uppercase">{date(at, { month: 'short' })}</span>
          <span className="py-1.5 font-display text-3xl font-extrabold text-navy-900">{date(at, { day: 'numeric' })}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="appointment-title" className="text-lg font-bold text-navy-900">
            {t('portal.appointment.title')}
          </h3>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex items-start gap-2">
              <dt className="sr-only">{t('portal.appointment.date')}</dt>
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-violet-600" aria-hidden />
              <dd className="font-semibold text-navy-900">
                <time dateTime={data.appointmentAt}>{date(at, { dateStyle: 'full', timeStyle: 'short' })}</time>
              </dd>
            </div>
            {data.appointmentPlace && (
              <div className="flex items-start gap-2">
                <dt className="sr-only">{t('portal.appointment.place')}</dt>
                <MapPin className="mt-0.5 size-4 shrink-0 text-violet-600" aria-hidden />
                <dd className="min-w-0 break-words whitespace-pre-line text-navy-900">{data.appointmentPlace}</dd>
              </div>
            )}
          </dl>
        </div>
        {upcoming && (
          <button
            type="button"
            className="btn-ghost btn-sm min-h-10 w-full shrink-0 whitespace-nowrap sm:w-auto"
            onClick={() =>
              downloadIcs({
                uid: `${data.number}-appointment`,
                start: at,
                title,
                place: data.appointmentPlace,
                description: t('portal.statusHelp.APPOINTMENT_SCHEDULED'),
              })
            }
          >
            <CalendarPlus className="size-4" aria-hidden />
            {t('portal.appointment.addToCalendar')}
          </button>
        )}
      </div>
    </section>
  );
};

// ─── Decision ───────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#1565e8', '#5c9bff', '#ffce00', '#12a150', '#ef3340', '#00b5e2'];

const ConfettiBurst = () => {
  const reduce = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => {
        const angle = (i / 36) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const dist = 90 + Math.random() * 170;
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist * 0.7 - 30,
          rotate: (Math.random() - 0.5) * 720,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          w: 6 + Math.random() * 6,
          round: i % 3 === 0,
          delay: Math.random() * 0.15,
        };
      }),
    [],
  );
  if (reduce) return null;
  return (
    <div className="pointer-events-none absolute top-14 left-1/2 sm:left-16" aria-hidden>
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className={clsx('absolute block', p.round ? 'rounded-full' : 'rounded-[2px]')}
          style={{ width: p.w, height: p.round ? p.w : p.w * 0.45, backgroundColor: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 70], opacity: [1, 1, 0], rotate: p.rotate, scale: 1 }}
          transition={{ duration: 1.8, delay: 0.3 + p.delay, ease: [0.16, 1, 0.3, 1], times: [0, 0.55, 1] }}
        />
      ))}
    </div>
  );
};

export const DecisionCard = ({ data }: { data: CaseDetail }) => {
  const { t } = useTranslation();
  const { date } = useL10n();

  if (data.status === 'APPROVED') {
    return (
      <motion.section
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        id="decision"
        className="relative scroll-mt-28 overflow-hidden rounded-2xl bg-gradient-to-br lg:scroll-mt-36 from-emerald-500 via-emerald-600 to-teal-700 p-5 text-white shadow-xl shadow-emerald-600/25 sm:p-8"
        aria-labelledby="decision-title"
      >
        <div className="pointer-events-none absolute -right-20 -bottom-24 size-72 rounded-full bg-[radial-gradient(closest-side,var(--color-white),transparent)] opacity-10" aria-hidden />
        <ConfettiBurst />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <motion.span
            className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/20"
            initial={{ rotate: -20, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.15 }}
          >
            <PartyPopper className="size-8" aria-hidden />
          </motion.span>
          <div className="min-w-0 flex-1">
            <h3 id="decision-title" className="text-2xl font-extrabold sm:text-3xl">
              {t('portal.decision.approved')}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/85">{t('portal.statusHelp.APPROVED')}</p>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              {(data.visaValidFrom || data.visaValidTo) && (
                <div className="rounded-xl bg-white/15 px-4 py-3">
                  <dt className="text-xs font-semibold text-white/75">{t('portal.decision.validity')}</dt>
                  <dd className="mt-0.5 font-semibold">
                    {data.visaValidFrom ? date(data.visaValidFrom) : '…'} – {data.visaValidTo ? date(data.visaValidTo) : '…'}
                  </dd>
                </div>
              )}
              {data.decisionReason && (
                <div className="rounded-xl bg-white/15 px-4 py-3 sm:col-span-2">
                  <dt className="text-xs font-semibold text-white/75">{t('portal.decision.note')}</dt>
                  <dd className="mt-0.5 text-sm whitespace-pre-line">{data.decisionReason}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </motion.section>
    );
  }

  if (data.status === 'REJECTED') {
    return (
      <section id="decision" className="card scroll-mt-28 overflow-hidden border-red-200 lg:scroll-mt-36" aria-labelledby="decision-title">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-red-100 text-danger">
            <ShieldX className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 id="decision-title" className="text-xl font-bold text-navy-900">
              {t('portal.decision.rejected')}
            </h3>
            {data.decisionAt && <p className="mt-0.5 text-xs text-muted">{date(data.decisionAt)}</p>}
            {data.decisionReason && (
              <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                <p className="text-xs font-semibold text-danger">{t('portal.decision.reason')}</p>
                <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-navy-900">{data.decisionReason}</p>
              </div>
            )}
            <p className="mt-4 text-sm text-muted">{t('portal.statusHelp.REJECTED')}</p>
          </div>
        </div>
      </section>
    );
  }
  return null;
};

// ─── Files from staff ───────────────────────────────────────────────────

export const OtherFiles = ({ data }: { data: CaseDetail }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  if (!data.otherDocuments.length) return null;
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="other-files-title">
      <h3 id="other-files-title" className="text-lg font-bold text-navy-900">
        {t('portal.docs.otherFiles')}
      </h3>
      <ul className="mt-2 divide-y divide-line">
        {data.otherDocuments.map((d) => (
          <li key={d.id} className="flex items-center gap-3 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <FileText className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-navy-900" title={d.originalName}>
                {d.originalName}
              </p>
              <p className="text-xs text-muted">
                {formatBytes(d.size)} · {date(d.createdAt)}
              </p>
            </div>
            <a
              href={fileUrl(d.id)}
              target="_blank"
              rel="noreferrer"
              className="grid size-10 shrink-0 place-items-center rounded-lg text-brand-600 hover:bg-brand-50"
              aria-label={`${t('common.open')}: ${d.originalName}`}
              title={t('common.open')}
            >
              <ExternalLink className="size-4" aria-hidden />
            </a>
            <a
              href={fileUrl(d.id, true)}
              className="grid size-10 shrink-0 place-items-center rounded-lg text-brand-600 hover:bg-brand-50"
              aria-label={`${t('common.download')}: ${d.originalName}`}
              title={t('common.download')}
            >
              <Download className="size-4" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
};

// ─── Timeline ───────────────────────────────────────────────────────────

export const CaseTimeline = ({ data }: { data: CaseDetail }) => {
  const { t, i18n } = useTranslation();
  const { dateTime } = useL10n();
  const events = [...data.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!events.length) return null;

  const label = (type: string) => (i18n.exists(`portal.events.${type}`) ? t(`portal.events.${type}`) : type);

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="timeline-title">
      <h3 id="timeline-title" className="flex items-center gap-2 text-base font-bold text-navy-900">
        <History className="size-4.5 text-brand-600" aria-hidden />
        {t('portal.timeline')}
      </h3>
      <ol className="relative mt-4 space-y-5 before:absolute before:top-1 before:bottom-1 before:left-[5px] before:w-px before:bg-line">
        {events.map((e, i) => (
          <motion.li
            key={e.id}
            className="relative pl-6"
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.04 }}
          >
            <span
              className={clsx(
                'absolute top-1 left-0 size-[11px] rounded-full border-2 border-white ring-1',
                i === 0 ? 'bg-brand-600 ring-brand-600' : 'bg-line ring-line',
              )}
              aria-hidden
            />
            <p className="text-sm font-semibold text-navy-900">{label(e.type)}</p>
            {e.type === 'STATUS_CHANGED' && e.toStatus && (
              <p className="text-xs text-brand-600">{t(`portal.status.${e.toStatus}`)}</p>
            )}
            {e.note && <p className="mt-1 text-xs leading-relaxed break-words whitespace-pre-line text-muted">{e.note}</p>}
            <time className="mt-1 block text-[11px] text-muted/80" dateTime={e.createdAt}>
              {dateTime(e.createdAt)}
            </time>
          </motion.li>
        ))}
      </ol>
    </section>
  );
};
