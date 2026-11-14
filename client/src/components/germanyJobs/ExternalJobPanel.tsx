import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink, FileText, Globe2, UserCheck } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesGermanyJobsAdmin } from '@/i18n/pagesGermanyJobsAdmin';
import type { ExternalJobInfo } from '@/components/admin/types';

registerCopy(pagesGermanyJobsAdmin);

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-[11px] text-muted">{label}</dt>
    <dd className="text-sm break-words text-ink">{children}</dd>
  </div>
);

const PROVIDERS = ['arbeitnow', 'careerjet', 'jooble', 'adzuna', 'link'];

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Listing + candidate facts + CV of an "apply via Triad Vision" lead (server routes/germanyJobs.ts). */
export const ExternalJobPanel = ({ inquiryId, job }: { inquiryId: string; job: ExternalJobInfo }) => {
  const { t } = useTranslation();
  let host = '';
  try {
    host = new URL(job.listingUrl).hostname.replace(/^www\./, '');
  } catch {
    /* stored URLs are validated; keep the panel even if not */
  }
  return (
    <section className="rounded-lg border border-line bg-card px-3.5 py-3" aria-label={t('gja.panel.title')}>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Globe2 className="size-3.5" aria-hidden /> {t('gja.panel.title')} · {t(`gja.panel.provider.${PROVIDERS.includes(job.provider) ? job.provider : 'link'}`)}
        {job.userId && (
          <span className="inline-flex items-center gap-1 text-success-fg">
            <UserCheck className="size-3.5" aria-hidden /> {t('gja.panel.account')}
          </span>
        )}
      </p>
      <p className="mt-1 font-semibold break-words text-ink">{job.listingTitle || host || job.listingUrl}</p>
      <a href={job.listingUrl} target="_blank" rel="nofollow noopener noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 text-sm text-link hover:underline">
        <span className="truncate">{t('gja.panel.open')}{host ? ` · ${host}` : ''}</span> <ExternalLink className="size-3.5 shrink-0" aria-hidden />
        <span className="sr-only">{t('gja.panel.newTab')}</span>
      </a>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {job.listingCompany && <Fact label={t('gja.panel.company')}>{job.listingCompany}</Fact>}
        {job.listingLocation && <Fact label={t('gja.panel.location')}>{job.listingLocation}</Fact>}
        {job.jobType && <Fact label={t('gja.panel.type')}>{job.jobType === 'ausbildung' ? t('gja.panel.typeAusbildung') : t('gja.panel.typeJob')}</Fact>}
        {job.profession && <Fact label={t('gja.panel.profession')}>{job.profession}</Fact>}
        {job.germanLevel && <Fact label={t('gja.panel.german')}>{job.germanLevel === 'none' ? '—' : job.germanLevel}</Fact>}
        {job.experienceYears != null && <Fact label={t('gja.panel.experience')}>{t('gja.panel.years', { n: job.experienceYears })}</Fact>}
      </dl>
      <div className="mt-3">
        {job.cvOriginalName ? (
          <a href={`/api/admin/germany-jobs/applications/${inquiryId}/cv`} className="btn-secondary btn-sm max-w-full min-w-0 border border-line" download>
            <Download className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {t('gja.panel.download')}: {job.cvOriginalName}
              {job.cvSize ? ` (${kb(job.cvSize)})` : ''}
            </span>
          </a>
        ) : (
          <p className="inline-flex items-center gap-1 text-xs text-muted">
            <FileText className="size-3.5" aria-hidden /> {t('gja.panel.noCv')}
          </p>
        )}
      </div>
    </section>
  );
};
