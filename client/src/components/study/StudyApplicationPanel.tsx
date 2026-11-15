import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink, FileText, GraduationCap, UserCheck } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesStudy } from '@/i18n/pagesStudy';
import { pagesStudyAdmin } from '@/i18n/pagesStudyAdmin';
import type { StudyApplicationInfo } from '@/components/admin/types';

registerCopy(pagesStudy);
registerCopy(pagesStudyAdmin);

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-[11px] text-muted">{label}</dt>
    <dd className="text-sm break-words text-ink">{children}</dd>
  </div>
);

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Study facts + CV / diploma of a "study programme" lead (server routes/study.ts, lib/inquiries enrichInquiries). */
export const StudyApplicationPanel = ({ inquiryId, app }: { inquiryId: string; app: StudyApplicationInfo }) => {
  const { t } = useTranslation();
  const intake = app.desiredIntake ? /^(WINTER|SUMMER)-(\d{4})$/.exec(app.desiredIntake) : null;
  const file = (kind: 'cv' | 'diploma', name: string | null, size: number | null) =>
    name ? (
      <a href={`/api/admin/study/applications/${inquiryId}/${kind}`} className="btn-secondary btn-sm max-w-full min-w-0 border border-line" download>
        <Download className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">
          {t(`sta.panel.${kind}`)}: {name}
          {size ? ` (${kb(size)})` : ''}
        </span>
      </a>
    ) : (
      <p className="inline-flex items-center gap-1 text-xs text-muted">
        <FileText className="size-3.5" aria-hidden /> {t(`sta.panel.${kind}`)}: {t('sta.panel.none')}
      </p>
    );
  return (
    <section className="rounded-lg border border-line bg-card px-3.5 py-3" aria-label={t('sta.panel.title')}>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <GraduationCap className="size-3.5" aria-hidden /> {t('sta.panel.title')}
        {app.userId && (
          <span className="inline-flex items-center gap-1 text-success-fg">
            <UserCheck className="size-3.5" aria-hidden /> {t('sta.panel.account')}
          </span>
        )}
      </p>
      <p className="mt-1 font-semibold break-words text-ink">{app.programmeName}</p>
      <p className="text-sm text-muted">{app.university}</p>
      {app.programmeId ? (
        <a href={`/study/${app.programmeSlug}`} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-sm text-link hover:underline">
          {t('sta.panel.open')} <ExternalLink className="size-3.5" aria-hidden />
        </a>
      ) : (
        <p className="mt-0.5 text-xs text-muted">{t('sta.panel.removed')}</p>
      )}
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {app.currentDegree && <Fact label={t('sta.panel.degree')}>{t(`study.apply.degreeOpts.${app.currentDegree}`)}</Fact>}
        {app.fieldOfStudy && <Fact label={t('sta.panel.field')}>{app.fieldOfStudy}</Fact>}
        {app.gpa && <Fact label={t('sta.panel.gpa')}>{app.gpa}</Fact>}
        {app.languageCertificate && (
          <Fact label={t('sta.panel.certificate')}>
            {t(`study.apply.certOpts.${app.languageCertificate}`)}
            {app.languageLevel ? ` · ${app.languageLevel}` : ''}
          </Fact>
        )}
        {intake && <Fact label={t('sta.panel.intake')}>{t(`study.intake.${intake[1]}`, { year: Number(intake[2]), next: String(Number(intake[2]) + 1).slice(2) })}</Fact>}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {file('cv', app.cvOriginalName, app.cvSize)}
        {file('diploma', app.diplomaOriginalName, app.diplomaSize)}
      </div>
    </section>
  );
};
