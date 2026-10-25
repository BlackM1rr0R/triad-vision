import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CalendarClock, CheckCircle2, ClipboardCheck, Download, FileSignature, History, Mail, MessageSquareText, Phone, ShieldAlert, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesTimeCare } from '@/i18n/pagesTimeCare';
import { pagesEmployerWorkers } from '@/i18n/pagesEmployerWorkers';
import { fmtDate } from '@/components/admin/labels';
import { Drawer } from '@/components/ui/Drawer';
import { TONE_CLASS } from '@/components/ui/status';
import { Loading } from './shared';
import { CHECKIN_TONE, CheckInCell, DateCell, RISK_TONE, useMilestoneText } from './workerCells';
import { plannedArrival, type WorkerDetail } from './workerTypes';
import { EmployerAcceleratedBlock } from '@/components/recognition/EmployerAcceleratedBlock'; // § 81a (registers its copy)
import { euro } from '@/components/recognition/api';

registerCopy(pagesTimeCare); // check-in topic labels (checkIn.topics.*)
registerCopy(pagesEmployerWorkers);

const Block = ({ title, icon: Icon, children }: { title: string; icon: typeof History; children: ReactNode }) => (
  <section>
    <h3 className="type-card-title mb-3 flex items-center gap-2 text-ink">
      <Icon className="size-4 text-muted" aria-hidden /> {title}
    </h3>
    {children}
  </section>
);

const Def = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
    <dt className="text-muted">{label}</dt>
    <dd className="text-right font-medium text-ink">{children}</dd>
  </div>
);

/** Worker drawer of the employer panel (?worker=<caseId>): overview, open items, dates, documents, check-ins, contact. */
export const WorkerDrawer = ({ id, onClose }: { id: string | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const milestone = useMilestoneText();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['company-worker', id],
    queryFn: async () => (await api.get<WorkerDetail>(`/company/workers/${id}`)).data,
    enabled: !!id,
  });
  const w = data?.worker;

  return (
    <Drawer open={!!id} onClose={onClose} title={w?.name ?? t('employerWorkers.title')} description={w ? `${w.position} · ${t(`employerWorkers.phase.${w.phase}`)}` : undefined} width="lg">
      {isLoading ? (
        <Loading />
      ) : isError || !data || !w ? (
        <p className="text-sm text-muted">{t('jobsArea.errors.generic')}</p>
      ) : (
        <div className="space-y-7">
          <Block title={t('employerWorkers.drawer.overview')} icon={UserRound}>
            <dl className="divide-y divide-line rounded-2xl border border-line px-4">
              <Def label={t('employerWorkers.cols.status')}>
                <span className="flex flex-col items-end">
                  <span>{w.phase === 'IN_PROCESS' ? t(`requests.workers.stage.${w.stage}`) : t(`employerWorkers.phase.${w.phase}`)}</span>
                  {milestone(w) && <span className="text-xs font-normal text-muted">{milestone(w)}</span>}
                </span>
              </Def>
              <Def label={t('employerWorkers.cols.arrival')}>
                <DateCell iso={w.arrivedAt ?? plannedArrival(w)} />
              </Def>
              <Def label={w.title ? t(`employerWorkers.titleKind.${w.title.kind}`) : t('employerWorkers.cols.title')}>
                <DateCell iso={w.title?.validUntil} warn={w.title?.warn} daysLeft={w.title?.daysLeft} />
              </Def>
              <Def label={t('employerWorkers.cols.probation')}>
                <DateCell iso={w.probation?.endsAt} warn={w.probation?.warn} daysLeft={w.probation?.daysLeft} />
              </Def>
              <Def label={t('employerWorkers.cols.checkIn')}>
                <CheckInCell w={w} />
              </Def>
              <Def label={t('employerWorkers.cols.risk')}>
                {w.risk ? <span className={clsx('badge', TONE_CLASS[RISK_TONE[w.risk.level]])}>{t(`employerWorkers.risk.${w.risk.level}`)}</span> : '—'}
              </Def>
            </dl>
            {w.risk && w.risk.reasons.length > 0 && w.risk.level !== 'LOW' && (
              <ul className="mt-3 space-y-1 rounded-2xl bg-warning-bg/60 px-4 py-3 text-xs text-warning-fg">
                {w.risk.reasons.map((r) => (
                  <li key={r.code} className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t(`employerWorkers.riskReason.${r.code}`, r.params ?? {})}
                  </li>
                ))}
              </ul>
            )}
          </Block>

          {w.openItems.length > 0 && (
            <Block title={t('employerWorkers.drawer.openItems')} icon={ClipboardCheck}>
              <ul className="space-y-2">
                {w.openItems.map((i) => (
                  <li key={`${i.kind}-${i.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-warning-border bg-warning-bg px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold tracking-wide text-warning-fg uppercase">{t(`employerWorkers.docKind.${i.kind}`)}</span>
                      <span className="font-medium text-ink">
                        {i.kind === 'CHECKIN' ? t('employerWorkers.action.ANSWER_CHECKIN') : i.kind === 'ACCELERATED' ? t(`accel.employer.todo.${i.id.split(':')[1]}`, { defaultValue: i.title, fee: euro(data.accelerated?.feeCents) }) : i.title}
                      </span>
                    </span>
                    {i.link && (
                      <Link to={i.link} className="btn-primary btn-sm">
                        {i.kind === 'SIGNATURE' ? t('employerWorkers.drawer.sign') : i.kind === 'FORM' ? t('employerWorkers.drawer.openForm') : t('employerWorkers.drawer.answer')}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {/* § 81a accelerated procedure: steps, what the employer has to do, embassy dates (read-only). */}
          {data.accelerated && <EmployerAcceleratedBlock a={data.accelerated} />}

          <Block title={t('employerWorkers.drawer.upcoming')} icon={CalendarClock}>
            {data.upcoming.length === 0 ? (
              <p className="text-sm text-muted">{t('employerWorkers.drawer.noUpcoming')}</p>
            ) : (
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {data.upcoming.map((u) => (
                  <li key={`${u.code}-${u.at}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="text-ink">{t(`employerWorkers.upcomingCode.${u.code}`)}</span>
                    <span className="num font-semibold text-ink">
                      {u.code === 'DECISION' && u.params?.to ? t('employerWorkers.window', { from: fmtDate(u.at), to: fmtDate(String(u.params.to)) }) : fmtDate(u.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title={t('employerWorkers.drawer.timeline')} icon={History}>
            <ol className="relative ml-2 space-y-3 border-l border-line pl-5">
              {data.timeline.map((e, i) => (
                <li key={`${e.code}-${e.at}-${i}`} className="relative">
                  <span className={clsx('absolute top-1 -left-[26px] grid size-3 place-items-center rounded-full ring-4 ring-card', i === data.timeline.length - 1 ? 'bg-primary' : 'bg-line-strong')} aria-hidden />
                  <p className="text-sm text-ink">{t(`employerWorkers.timeline.${e.code}`, { ...(e.params ?? {}), defaultValue: e.code })}</p>
                  <p className="text-xs text-muted tabular-nums">{fmtDate(e.at)}</p>
                </li>
              ))}
            </ol>
          </Block>

          <Block title={t('employerWorkers.drawer.documents')} icon={FileSignature}>
            {data.documents.length === 0 ? (
              <p className="text-sm text-muted">{t('employerWorkers.drawer.noDocuments')}</p>
            ) : (
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {data.documents.map((d) => (
                  <li key={`${d.kind}-${d.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{d.title}</span>
                      <span className="text-xs text-muted">
                        {t(`employerWorkers.docStatus.${d.status}`, { defaultValue: d.status })}
                        {d.date ? ` · ${fmtDate(d.date)}` : ''}
                      </span>
                    </span>
                    <span className="flex gap-2">
                      {d.signLink && (
                        <Link to={d.signLink} className="btn-primary btn-sm">
                          <FileSignature className="size-3.5" aria-hidden /> {d.kind === 'FORM' ? t('employerWorkers.drawer.openForm') : t('employerWorkers.drawer.sign')}
                        </Link>
                      )}
                      {d.downloadable && (
                        <a href={`/api/company/workers/${w.id}/documents/${d.kind === 'SIGNATURE' ? 'signature' : 'form'}/${d.id}`} className="btn-ghost btn-sm" download>
                          <Download className="size-3.5" aria-hidden /> {t('employerWorkers.drawer.download')}
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title={t('employerWorkers.drawer.checkIns')} icon={MessageSquareText}>
            {data.checkIns.length === 0 ? (
              <p className="text-sm text-muted">{t('employerWorkers.drawer.noCheckIns')}</p>
            ) : (
              <ul className="space-y-2">
                {data.checkIns.map((c) => (
                  <li key={c.id} className="rounded-2xl border border-line px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-ink">
                        {t(c.audience === 'EMPLOYER' ? 'employerWorkers.checkInYou' : 'employerWorkers.checkInWorker')} · {t('employerWorkers.drawer.afterDays', { days: c.offsetDays })}
                        <span className="ml-2 text-xs text-muted tabular-nums">{fmtDate(c.answeredAt ?? c.dueAt)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {c.state && <span className={clsx('badge', TONE_CLASS[CHECKIN_TONE[c.state]])}>{t(`employerWorkers.checkIn.${c.state}`)}</span>}
                        {c.link && (
                          <Link to={c.link} className="btn-primary btn-sm">
                            {t('employerWorkers.drawer.answer')}
                          </Link>
                        )}
                      </span>
                    </div>
                    {c.audience === 'EMPLOYER' && (c.topics.length > 0 || c.comment) && (
                      <div className="mt-2 text-xs text-muted">
                        {c.topics.length > 0 && <p>{c.topics.map((tp) => t(`checkIn.topics.${tp}`, { defaultValue: tp })).join(', ')}</p>}
                        {c.comment && (
                          <p className="mt-1 whitespace-pre-line">
                            <span className="font-semibold">{t('employerWorkers.drawer.yourComment')}:</span> {c.comment}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-muted">{t('employerWorkers.drawer.workerPrivacy')}</p>
          </Block>

          <Block title={t('employerWorkers.drawer.contact')} icon={CheckCircle2}>
            <div className="rounded-2xl bg-sunken px-4 py-3 text-sm">
              {data.contact.manager ? (
                <>
                  <p className="text-xs text-muted">{t('employerWorkers.drawer.manager')}</p>
                  <p className="font-semibold text-ink">{data.contact.manager.name}</p>
                  <a href={`mailto:${data.contact.manager.email}`} className="mt-2 inline-flex items-center gap-1.5 font-semibold text-link hover:underline">
                    <Mail className="size-4" aria-hidden /> {t('employerWorkers.drawer.email')}
                  </a>
                </>
              ) : (
                <p className="text-muted">{t('employerWorkers.drawer.noManager')}</p>
              )}
              {(data.contact.office.phone || data.contact.office.email) && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs">
                  <span className="text-muted">{t('employerWorkers.drawer.office')}:</span>
                  {data.contact.office.phone && (
                    <a href={`tel:${data.contact.office.phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
                      <Phone className="size-3.5" aria-hidden /> {data.contact.office.phone}
                    </a>
                  )}
                  {data.contact.office.email && (
                    <a href={`mailto:${data.contact.office.email}`} className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
                      <Mail className="size-3.5" aria-hidden /> {data.contact.office.email}
                    </a>
                  )}
                </div>
              )}
            </div>
          </Block>
        </div>
      )}
    </Drawer>
  );
};
