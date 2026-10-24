import { useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarClock,
  Car,
  CheckCircle2,
  Clock,
  Euro,
  Gift,
  Languages,
  ListChecks,
  MailWarning,
  MapPin,
  Send,
  Stamp,
  Users,
} from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { currentHref, useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { isStaffRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesJobs } from '@/i18n/pagesJobs';
import { PageHero } from '@/components/layout/PageHero';
import { SalaryEstimate } from '@/components/tools/SalaryEstimate';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate } from '@/components/admin/labels';
import { GapList, ScoreRing } from '@/components/jobs/MatchMeter';
import { jobsError, useJobLabels } from '@/components/jobs/labels';
import { APPLICATION_STATUS_TONE, type ApplicationStatus, type Match, type PublicVacancy } from '@/components/jobs/types';
import { JobAlertForm } from '@/components/jobs/JobAlertForm';

registerCopy(pagesJobs);

const HERO = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=2000&q=70';

interface MeResponse {
  match: Match;
  application: { id: string; status: ApplicationStatus; createdAt: string } | null;
  emailVerified: boolean;
}

const Fact = ({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: ReactNode }) => (
  <div className="flex items-start gap-3 py-2.5">
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
      <Icon className="size-4" aria-hidden />
    </span>
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className="text-sm font-semibold break-words text-navy-900">{children}</dd>
    </div>
  </div>
);

const ApplyBox = ({ v }: { v: PublicVacancy }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const L = useJobLabels();
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const isClient = user?.role === 'CLIENT';
  const me = useQuery({
    queryKey: ['job-me', v.slug],
    queryFn: async () => (await api.get<MeResponse>(`/vacancies/${v.slug}/me`)).data,
    enabled: isClient,
  });
  const apply = useMutation({
    mutationFn: async () => api.post(`/vacancies/${v.slug}/apply`, { message: message.trim() || undefined }),
    onSuccess: () => {
      toast.success(t('jobsArea.detail.success'));
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['job-me', v.slug] });
      void qc.invalidateQueries({ queryKey: ['my-applications'] });
    },
    onError: (err) => {
      if (errorCode(err) === 'ALREADY_APPLIED') void qc.invalidateQueries({ queryKey: ['job-me', v.slug] });
      toast.error(jobsError(err));
    },
  });

  if (!user) {
    const from = currentHref(location);
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('jobsArea.detail.loginToApply')}</p>
        <Link to="/login" state={{ from }} className="btn-primary w-full">
          {t('jobsArea.detail.loginCta')} <ArrowRight className="size-4" />
        </Link>
        <Link to="/register" state={{ from }} className="btn-ghost w-full">
          {t('jobsArea.detail.registerCta')}
        </Link>
      </div>
    );
  }
  if (!isClient) {
    return (
      <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">
        {user.role === 'COMPANY' ? t('jobsArea.detail.employersCannotApply') : isStaffRole(user.role) ? t('jobsArea.detail.staffCannotApply') : null}
      </p>
    );
  }
  if (me.isLoading) return <Spinner className="mx-auto size-6 text-brand-600" />;
  const data = me.data;
  const applied = data?.application && data.application.status !== 'WITHDRAWN' ? data.application : null;

  return (
    <div className="space-y-5">
      {data && (
        <div className="rounded-xl border border-line bg-surface/60 p-4">
          <div className="flex items-center gap-4">
            <ScoreRing score={data.match.score} />
            <div className="min-w-0">
              <p className="text-sm font-bold text-navy-900">{t('jobsArea.detail.matchTitle')}</p>
              <p className="text-xs text-muted">{t('jobsArea.detail.matchHint')}</p>
            </div>
          </div>
          <GapList match={data.match} className="mt-3" />
          {data.match.gaps.length > 0 && (
            <Link to="/account/profile" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
              {t('jobsArea.detail.completeProfile')} <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      )}

      {applied ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
            <CheckCircle2 className="size-4" aria-hidden /> {t('jobsArea.detail.applied', { date: fmtDate(applied.createdAt) })}
          </p>
          <p className="mt-2 text-xs text-emerald-900/80">
            {t('jobsArea.detail.status')} <span className={`badge ${APPLICATION_STATUS_TONE[applied.status]}`}>{L.appStatus(applied.status)}</span>
          </p>
          <Link to="/account/applications" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline">
            {t('jobsArea.detail.myApplications')} <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : data && !data.emailVerified ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-bold">
            <MailWarning className="size-4" aria-hidden /> {t('jobsArea.detail.verifyTitle')}
          </p>
          <p className="mt-1 text-xs">{t('jobsArea.detail.verifyText')}</p>
        </div>
      ) : open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply.mutate();
          }}
          className="space-y-3"
        >
          <div>
            <label htmlFor="apply-msg" className="label">
              {t('jobsArea.detail.messageLabel')}
            </label>
            <textarea
              id="apply-msg"
              className="input min-h-28"
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('jobsArea.detail.messagePlaceholder')}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1" disabled={apply.isPending}>
              {apply.isPending ? <Spinner className="size-4" /> : <Send className="size-4" />} {t('jobsArea.detail.send')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              {t('jobsArea.common.cancel')}
            </button>
          </div>
          <p className="text-[11px] text-muted">{t('jobsArea.detail.privacy')}</p>
        </form>
      ) : (
        <button type="button" className="btn-primary w-full" onClick={() => setOpen(true)}>
          <Send className="size-4" /> {data?.application?.status === 'WITHDRAWN' ? t('jobsArea.detail.reapply') : t('jobsArea.detail.apply')}
        </button>
      )}
    </div>
  );
};

export default function JobDetail() {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const { tr, trList } = useL10n();
  const L = useJobLabels();
  const { data, isLoading, error } = useQuery({
    queryKey: ['job', slug],
    queryFn: async () => (await api.get<{ vacancy: PublicVacancy }>(`/vacancies/${slug}`)).data.vacancy,
    retry: (n, err) => errorCode(err) !== 'VACANCY_NOT_FOUND' && n < 2,
  });
  usePageTitle(data ? tr(data.title) : t('jobsArea.board.title'));

  if (isLoading) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <Spinner className="size-8 text-brand-600" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <section className="flex min-h-[80vh] items-center bg-surface pt-28">
        <div className="container-x">
          <div className="card mx-auto max-w-lg p-8 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-50 text-brand-600">
              <Briefcase className="size-6" aria-hidden />
            </span>
            <h1 className="mt-4 font-display text-2xl font-extrabold text-navy-900">{t('jobsArea.detail.notFound')}</h1>
            <p className="mt-2 text-sm text-muted">{t('jobsArea.detail.notFoundText')}</p>
            <Link to="/jobs" className="btn-primary mt-6">
              {t('jobsArea.detail.toBoard')}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const v = data;
  const description = tr(v.description);
  const requirements = trList(v.requirements);
  const benefits = trList(v.benefits);
  const salary = L.salary(v.salaryMin, v.salaryMax);

  return (
    <>
      <PageHero title={tr(v.title)} image={HERO} crumb={{ to: '/jobs', label: t('nav.jobs') }}>
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
            <Building2 className="size-4 text-brand-400" aria-hidden /> {v.companyName ?? t('jobsArea.common.confidentialEmployer')}
          </span>
          {v.city && (
            <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
              <MapPin className="size-4 text-brand-400" aria-hidden /> {v.city}
            </span>
          )}
          <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
            <Clock className="size-4 text-brand-400" aria-hidden /> {L.employmentType(v.employmentType)}
          </span>
          {salary && (
            <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
              <Euro className="size-4 text-brand-400" aria-hidden /> {salary}
            </span>
          )}
        </div>
      </PageHero>

      <section className="section-sm bg-surface">
        <div className="container-x grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-10">
          <div className="min-w-0 space-y-6">
            <Link to="/jobs" className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-navy-900">
              <ArrowLeft className="size-4" /> {t('jobsArea.detail.back')}
            </Link>

            <article className="card card-pad">
              <h2 className="font-display text-xl font-bold text-navy-900">{t('jobsArea.detail.about')}</h2>
              <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink/80">
                {description.split(/\n{2,}/).map((p, i) => (
                  <p key={i} className="whitespace-pre-line">
                    {p}
                  </p>
                ))}
              </div>
            </article>

            {(requirements.length > 0 || benefits.length > 0) && (
              <div className="grid gap-6 md:grid-cols-2">
                {requirements.length > 0 && (
                  <div className="card card-pad">
                    <h2 className="flex items-center gap-2 font-display text-lg font-bold text-navy-900">
                      <ListChecks className="size-5 text-brand-600" aria-hidden /> {t('jobsArea.detail.requirements')}
                    </h2>
                    <ul className="mt-4 space-y-2.5">
                      {requirements.map((r) => (
                        <li key={r} className="flex items-start gap-2.5 text-sm text-ink/80">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {benefits.length > 0 && (
                  <div className="card card-pad">
                    <h2 className="flex items-center gap-2 font-display text-lg font-bold text-navy-900">
                      <Gift className="size-5 text-emerald-600" aria-hidden /> {t('jobsArea.detail.benefits')}
                    </h2>
                    <ul className="mt-4 space-y-2.5">
                      {benefits.map((b) => (
                        <li key={b} className="flex items-start gap-2.5 text-sm text-ink/80">
                          <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {v.visaCategory && (
              <Link
                to={`/visas/${v.visaCategory.slug}`}
                className="group card flex items-center gap-4 p-5 transition hover:border-brand-400/60"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-navy-900 text-white">
                  <Stamp className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-muted">{t('jobsArea.detail.visaRoute')}</span>
                  <span className="block font-bold text-navy-900">
                    {tr(v.visaCategory.title)} · {v.visaCategory.visaLabel}
                  </span>
                </span>
                <ArrowRight className="size-5 shrink-0 text-brand-600 transition group-hover:translate-x-0.5" aria-hidden />
              </Link>
            )}

            {/* Job alert preselected with this vacancy's profession. */}
            <JobAlertForm profession={v.profession} />
          </div>

          <aside className="min-w-0">
            <div className="card sticky top-28 p-5 sm:p-6">
              <dl className="divide-y divide-line">
                {salary && (
                  <Fact icon={Euro} label={t('jobsArea.detail.facts.salary')}>
                    {salary} <span className="text-xs font-medium text-muted">{t('jobsArea.common.perMonth')}</span>
                    <SalaryEstimate min={v.salaryMin} max={v.salaryMax} className="mt-1 font-normal" />
                  </Fact>
                )}
                {v.city && <Fact icon={MapPin} label={t('jobsArea.detail.facts.location')}>{v.city}</Fact>}
                <Fact icon={Clock} label={t('jobsArea.detail.facts.type')}>{L.employmentType(v.employmentType)}</Fact>
                <Fact icon={Languages} label={t('jobsArea.detail.facts.german')}>
                  {v.germanLevel && v.germanLevel !== 'none' ? t('jobsArea.common.germanMin', { level: v.germanLevel }) : t('jobsArea.german.none')}
                </Fact>
                {v.minExperience ? <Fact icon={Briefcase} label={t('jobsArea.detail.facts.experience')}>{t('jobsArea.common.minExperience', { count: v.minExperience })}</Fact> : null}
                {v.drivingLicence && <Fact icon={Car} label={t('jobsArea.detail.facts.licence')}>{v.drivingLicence}</Fact>}
                <Fact icon={Users} label={t('jobsArea.detail.facts.positions')}>{v.positions}</Fact>
                {v.validThrough && <Fact icon={CalendarClock} label={t('jobsArea.detail.facts.closes')}>{fmtDate(v.validThrough)}</Fact>}
              </dl>
              <div className="mt-5 border-t border-line pt-5">
                <ApplyBox v={v} />
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
