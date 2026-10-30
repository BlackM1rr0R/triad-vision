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
  Paperclip,
  Send,
  Stamp,
  Users,
  X,
} from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { currentHref, useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { JobGallery } from '@/components/jobs/JobGallery';
import { vacancyImages } from '@/components/jobs/images';
import { usePageTitle } from '@/lib/usePageTitle';
import { ACCEPT as DOC_ACCEPT, prepareFile } from '@/components/portal/FileDrop';
import { isStaffRole } from '@/lib/types';
import i18n, { registerCopy } from '@/i18n';
import { pagesJobs } from '@/i18n/pagesJobs';
import { PageHero, PageHeroSkeleton } from '@/components/layout/PageHero';
import { SalaryEstimate } from '@/components/tools/SalaryEstimate';
import { BudgetLink } from '@/components/budget/BudgetTeaser';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';
import { Lost } from '@/components/illustrations';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { fmtDate } from '@/components/admin/labels';
import { GapList, ScoreRing } from '@/components/jobs/MatchMeter';
import { jobsError, useJobLabels } from '@/components/jobs/labels';
import { APPLICATION_STATUS_TONE, type ApplicationStatus, type Match, type PublicVacancy } from '@/components/jobs/types';
import { JobAlertForm } from '@/components/jobs/JobAlertForm';
import { ScanCameraButton } from '@/components/scanner/ScanCameraButton'; // camera scan → PDF per document
import { scanPagesToPdf } from '@/components/scanner/scanPdf';
import { VaultApplyPicker } from '@/components/vault/VaultApplyPicker'; // documents from the vault instead of re-uploading
import type { VaultDoc } from '@/components/vault/api';
import { pagesPortalExtras } from '@/i18n/pagesPortalExtras';
import { CompanyLogo } from '@/components/jobs/CompanyLogo';

registerCopy(pagesJobs);
registerCopy(pagesPortalExtras); // px.apply.*, px.scan.*

const HERO = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=2000&q=70';

/** Documents a candidate may attach when applying (server: lib/applicationUploads.ts). */
const APPLY_DOC_KINDS = ['PASSPORT', 'CV', 'DIPLOMA', 'LANGUAGE_CERT', 'OTHER'] as const;
type ApplyDocKind = (typeof APPLY_DOC_KINDS)[number];
/** Uploads + vault documents per application (server: lib/applicationUploads.ts MAX_APPLICATION_FILES). */
const MAX_APPLY_FILES = 6;

interface MeResponse {
  match: Match;
  application: { id: string; status: ApplicationStatus; createdAt: string } | null;
  emailVerified: boolean;
}

const Fact = ({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: ReactNode }) => (
  <div className="flex items-start gap-3 py-2.5">
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sunken text-muted">
      <Icon className="size-4" aria-hidden />
    </span>
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-sm font-semibold break-words text-ink">{children}</dd>
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
  // Optional documents (Reisepass, CV, diploma …): one file per kind, attached to the case once it exists.
  const [docs, setDocs] = useState<Partial<Record<ApplyDocKind, File>>>({});
  // Documents picked from the vault (sent as ids, not re-uploaded).
  const [vaultDocs, setVaultDocs] = useState<VaultDoc[]>([]);
  /** Upload progress of the documents (0..1), null when nothing is being sent. */
  const [progress, setProgress] = useState<number | null>(null);
  // Picked files are checked right away: type, then images are compressed and the 5 MB limit applies.
  const pickDoc = async (k: ApplyDocKind, file: File) => {
    const { file: ready, problem } = await prepareFile(file);
    if (problem) {
      toast.error(t(problem === 'portal.docs.tooLarge' ? 'jobsArea.applyErrors.fileTooLarge' : 'jobsArea.applyErrors.badType', { name: file.name }));
      return;
    }
    setDocs((d) => ({ ...d, [k]: ready }));
  };
  const isClient = user?.role === 'CLIENT';
  const me = useQuery({
    queryKey: ['job-me', v.slug],
    queryFn: async () => (await api.get<MeResponse>(`/vacancies/${v.slug}/me`)).data,
    enabled: isClient,
  });
  const apply = useMutation({
    mutationFn: async () => {
      const picked = APPLY_DOC_KINDS.filter((k) => docs[k]);
      const vaultIds = vaultDocs.map((d) => d.id);
      if (!picked.length) return api.post(`/vacancies/${v.slug}/apply`, { message: message.trim() || undefined, ...(vaultIds.length ? { vaultIds } : {}) });
      const form = new FormData();
      if (message.trim()) form.append('message', message.trim());
      for (const id of vaultIds) form.append('vaultIds', id);
      for (const k of picked) {
        form.append('files', docs[k]!); // compressed when picked (pickDoc)
        form.append('kinds', k);
      }
      setProgress(0);
      try {
        return await api.post(`/vacancies/${v.slug}/apply`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => setProgress(e.total ? e.loaded / e.total : 0),
        });
      } finally {
        setProgress(null);
      }
    },
    onSuccess: (res) => {
      const sent = ((res.data as { documents?: unknown[] } | undefined)?.documents ?? []).length;
      toast.success(sent ? `${t('jobsArea.detail.success')} ${t('jobsArea.detail.docsSent', { count: sent })}` : t('jobsArea.detail.success'));
      setDocs({});
      setVaultDocs([]);
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['job-me', v.slug] });
      void qc.invalidateQueries({ queryKey: ['my-applications'] });
    },
    onError: (err) => {
      const code = errorCode(err);
      if (code === 'ALREADY_APPLIED') void qc.invalidateQueries({ queryKey: ['job-me', v.slug] });
      if (code && ['VAULT_DOCUMENT_NOT_FOUND', 'VAULT_DOCUMENT_EXPIRED', 'TOO_MANY_FILES'].includes(code)) {
        toast.error(t(`px.apply.${code}`));
        return;
      }
      // File errors of the application upload have their own texts (jobsArea.errors holds the vacancy-image ones).
      toast.error(i18n.exists(`jobsArea.applyErrors.${code}`) ? t(`jobsArea.applyErrors.${code}`) : jobsError(err));
    },
  });

  if (!user) {
    const from = currentHref(location);
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('jobsArea.detail.loginToApply')}</p>
        <Link to="/login" state={{ from }} className={buttonClass({ size: 'lg', block: true })}>
          {t('jobsArea.detail.loginCta')} <ArrowRight className="size-4" />
        </Link>
        <Link to="/register" state={{ from }} className={buttonClass({ variant: 'outline', block: true })}>
          {t('jobsArea.detail.registerCta')}
        </Link>
      </div>
    );
  }
  if (!isClient) {
    return (
      <p className="rounded-xl bg-sunken px-4 py-3 text-sm text-muted">
        {user.role === 'COMPANY' ? t('jobsArea.detail.employersCannotApply') : isStaffRole(user.role) ? t('jobsArea.detail.staffCannotApply') : null}
      </p>
    );
  }
  if (me.isLoading) return <Spinner className="mx-auto size-6 text-primary" />;
  const data = me.data;
  const applied = data?.application && data.application.status !== 'WITHDRAWN' ? data.application : null;

  return (
    <div className="space-y-5">
      {data && (
        <div className="rounded-2xl border border-line bg-sunken p-4">
          <div className="flex items-center gap-4">
            <ScoreRing score={data.match.score} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{t('jobsArea.detail.matchTitle')}</p>
              <p className="text-xs text-muted">{t('jobsArea.detail.matchHint')}</p>
            </div>
          </div>
          <GapList match={data.match} className="mt-3" />
          {data.match.gaps.length > 0 && (
            <Link to="/account/profile" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link hover:text-link-hover">
              {t('jobsArea.detail.completeProfile')} <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      )}

      {applied ? (
        <div className="rounded-2xl border border-success-border bg-success-bg p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-success-fg">
            <CheckCircle2 className="size-4" aria-hidden /> {t('jobsArea.detail.applied', { date: fmtDate(applied.createdAt) })}
          </p>
          <p className="mt-2 text-xs text-success-fg">
            {t('jobsArea.detail.status')} <span className={`badge ${APPLICATION_STATUS_TONE[applied.status]}`}>{L.appStatus(applied.status)}</span>
          </p>
          <Link to="/account/applications" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-success-fg hover:underline">
            {t('jobsArea.detail.myApplications')} <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : data && !data.emailVerified ? (
        <div className="rounded-2xl border border-warning-border bg-warning-bg p-4 text-sm text-warning-fg">
          <p className="flex items-center gap-2 font-semibold">
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
          <fieldset className="space-y-2">
            <legend className="label">{t('jobsArea.detail.docsTitle')}</legend>
            <p className="text-xs text-muted">{t('jobsArea.detail.docsHint')}</p>
            <ul className="space-y-1.5">
              {APPLY_DOC_KINDS.map((k) => {
                const f = docs[k];
                const id = `apply-doc-${k}`;
                return (
                  <li key={k} className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-1.5">
                    <Paperclip className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="text-sm font-medium text-ink">{t(`jobsArea.detail.doc${k}`)}</span>
                    {f ? (
                      <>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted" title={f.name}>
                          {f.name}
                        </span>
                        <button type="button" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-danger-fg hover:underline" onClick={() => setDocs((d) => ({ ...d, [k]: undefined }))}>
                          <X className="size-3.5" aria-hidden /> {t('jobsArea.detail.docRemove')}
                        </button>
                      </>
                    ) : (
                      <span className="ml-auto flex flex-wrap items-center gap-3">
                      {/* Camera scan (multi-page → one PDF) instead of picking a file. */}
                      <ScanCameraButton
                        className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-link hover:underline"
                        title={t(`jobsArea.detail.doc${k}`)}
                        onPages={async (pages) => {
                          try {
                            await pickDoc(k, await scanPagesToPdf(pages, t(`jobsArea.detail.doc${k}`)));
                            return true;
                          } catch {
                            toast.error(t('px.scan.failed'));
                            return false;
                          }
                        }}
                      />
                      <label htmlFor={id} className="inline-flex min-h-11 cursor-pointer items-center text-xs font-semibold text-link hover:underline">
                        {t('jobsArea.detail.docChoose')}
                        <input
                          id={id}
                          type="file"
                          className="sr-only"
                          accept={DOC_ACCEPT}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) void pickDoc(k, file);
                          }}
                        />
                      </label>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <VaultApplyPicker selected={vaultDocs} onChange={setVaultDocs} max={MAX_APPLY_FILES - APPLY_DOC_KINDS.filter((k) => docs[k]).length} />
          </fieldset>
          {progress !== null && (
            <div className="space-y-1">
              <p className="text-xs text-muted">{t('jobsArea.applyErrors.uploading', { percent: Math.round(progress * 100) })}</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label={t('ui.uploadProgress')} aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" className={buttonClass({ className: 'flex-1' })} disabled={apply.isPending}>
              {apply.isPending ? <Spinner className="size-4" /> : <Send className="size-4" />} {t('jobsArea.detail.send')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              {t('jobsArea.common.cancel')}
            </button>
          </div>
          <p className="text-xs text-muted">{t('jobsArea.detail.privacy')}</p>
        </form>
      ) : (
        <button type="button" className={buttonClass({ size: 'lg', block: true })} onClick={() => setOpen(true)}>
          <Send className="size-4" /> {data?.application?.status === 'WITHDRAWN' ? t('jobsArea.detail.reapply') : t('jobsArea.detail.apply')}
        </button>
      )}
    </div>
  );
};

/**
 * Loading state in the final layout: the hero (with the title already known from the board's cached list, so
 * the clicked card can morph into it) and placeholders for the description and the side column.
 */
const JobDetailSkeleton = ({ slug }: { slug: string }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const cached = qc
    .getQueriesData<{ items: PublicVacancy[] }>({ queryKey: ['jobs'] })
    .flatMap(([, d]) => d?.items ?? [])
    .find((x) => x.slug === slug);
  return (
    <>
      {cached ? (
        <PageHero title={tr(cached.title)} image={HERO} crumb={{ to: '/jobs', label: t('nav.jobs') }} morph={{ kind: 'job', id: slug }} />
      ) : (
        <PageHeroSkeleton />
      )}
      <section className="section-sm bg-sunken" role="status" aria-label={t('ui.loading')}>
        <div className="container-x grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-10">
          <div className="min-w-0 space-y-6">
            <Skeleton className="h-4 w-24" />
            <div className="card card-pad space-y-4">
              <Skeleton className="h-5 w-40" />
              <SkeletonText lines={5} />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="card card-pad space-y-3">
                <Skeleton className="h-5 w-32" />
                <SkeletonText lines={3} />
              </div>
              <div className="card card-pad space-y-3">
                <Skeleton className="h-5 w-32" />
                <SkeletonText lines={3} />
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <div className="card card-pad space-y-3">
              <Skeleton className="h-5 w-1/2" />
              <SkeletonText lines={4} />
              <Skeleton className="h-11 w-full" />
            </div>
          </div>
        </div>
      </section>
    </>
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

  if (isLoading) return <JobDetailSkeleton slug={slug} />;
  if (error || !data) {
    return (
      <section className="flex min-h-[80vh] items-center bg-sunken pt-28">
        <div className="container-x">
          <div className="card mx-auto max-w-lg rounded-3xl p-8 text-center">
            <Lost className="mx-auto w-40" />
            <h1 className="mt-4 font-display text-2xl font-semibold text-ink">{t('jobsArea.detail.notFound')}</h1>
            <p className="mt-2 text-sm text-muted">{t('jobsArea.detail.notFoundText')}</p>
            <Link to="/jobs" className={buttonClass({ className: 'mt-6' })}>
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
      <PageHero title={tr(v.title)} image={HERO} crumb={{ to: '/jobs', label: t('nav.jobs') }} morph={{ kind: 'job', id: v.slug }}>
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-ink shadow-[var(--tv-shadow-card)]">
            {v.companyLogo && v.companyName ? (
              <CompanyLogo logo={v.companyLogo} name={v.companyName} className="-my-1 -ml-1.5 size-7 rounded-full p-0.5" />
            ) : (
              <Building2 className="size-4 text-muted" aria-hidden />
            )}{' '}
            {v.companyName ?? t('jobsArea.common.confidentialEmployer')}
          </span>
          {v.city && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-ink shadow-[var(--tv-shadow-card)]">
              <MapPin className="size-4 text-muted" aria-hidden /> {v.city}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-ink shadow-[var(--tv-shadow-card)]">
            <Clock className="size-4 text-muted" aria-hidden /> {L.employmentType(v.employmentType)}
          </span>
          {salary && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-ink shadow-[var(--tv-shadow-card)]">
              <Euro className="size-4 text-muted" aria-hidden /> {salary}
            </span>
          )}
        </div>
      </PageHero>

      <section className="section-sm bg-sunken">
        <div className="container-x grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-10">
          <div className="min-w-0 space-y-6">
            <Link to="/jobs" className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
              <ArrowLeft className="size-4" /> {t('jobsArea.detail.back')}
            </Link>

            {vacancyImages(v).length > 0 && <JobGallery images={vacancyImages(v)} title={tr(v.title)} />}

            <article className="card card-pad rounded-3xl">
              <h2 className="font-display text-xl font-semibold text-ink">{t('jobsArea.detail.about')}</h2>
              <div className="mt-4 max-w-[70ch] space-y-3 leading-relaxed text-ink">
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
                  <div className="card card-pad rounded-3xl">
                    <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                      <span className="grid size-9 place-items-center rounded-xl chip-sky"><ListChecks className="size-4.5" aria-hidden /></span> {t('jobsArea.detail.requirements')}
                    </h2>
                    <ul className="mt-4 space-y-2.5">
                      {requirements.map((r) => (
                        <li key={r} className="flex items-start gap-2.5 text-sm text-ink">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {benefits.length > 0 && (
                  <div className="card card-pad rounded-3xl">
                    <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                      <span className="grid size-9 place-items-center rounded-xl chip-peach"><Gift className="size-4.5" aria-hidden /></span> {t('jobsArea.detail.benefits')}
                    </h2>
                    <ul className="mt-4 space-y-2.5">
                      {benefits.map((b) => (
                        <li key={b} className="flex items-start gap-2.5 text-sm text-ink">
                          <BadgeCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {b}
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
                className="group card card-interactive flex items-center gap-4 rounded-3xl p-5"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-xl chip-soft">
                  <Stamp className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-muted">{t('jobsArea.detail.visaRoute')}</span>
                  <span className="block font-semibold text-ink">
                    {tr(v.visaCategory.title)} · {v.visaCategory.visaLabel}
                  </span>
                </span>
                <ArrowRight className="size-5 shrink-0 text-muted group-hover:text-ink" aria-hidden />
              </Link>
            )}

            {/* Job alert preselected with this vacancy's profession. */}
            <JobAlertForm profession={v.profession} />
          </div>

          <aside className="min-w-0">
            <div className="card sticky top-28 rounded-3xl p-5 sm:p-6">
              <dl className="divide-y divide-line">
                {salary && (
                  <Fact icon={Euro} label={t('jobsArea.detail.facts.salary')}>
                    {salary} <span className="text-xs font-medium text-muted">{t('jobsArea.common.perMonth')}</span>
                    <SalaryEstimate min={v.salaryMin} max={v.salaryMax} className="mt-1 font-normal" />
                    <BudgetLink gross={v.salaryMin} grossMax={v.salaryMax} place={v.city} visa={v.visaCategory?.slug} className="mt-0.5 font-normal" />
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
