import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, Building2, Check, CircleDashed, ExternalLink, FileText, Info, MapPin, MessageSquareText, PenLine, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesExternalApps } from '@/i18n/pagesExternalApps';
import { pagesGermanyJobs } from '@/i18n/pagesGermanyJobs'; // gj.direct.cabinet: the candidate applies directly
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { fmtDate } from '@/components/admin/labels';
import { useBlobDownload } from '@/components/cv/CvDownloadButton';
import { CoverLetterEditor } from '@/components/germanyJobs/CoverLetterEditor';
import { STATUS_TONE, hostOf, xappError, type ExternalAppStatus, type TimelineStep } from '@/components/germanyJobs/externalApps';

registerCopy(pagesExternalApps);
registerCopy(pagesGermanyJobs);

interface MyExternalApplication {
  id: string;
  provider: string;
  listingUrl: string;
  listingTitle: string | null;
  listingCompany: string | null;
  listingLocation: string | null;
  jobType: string | null;
  status: ExternalAppStatus;
  statusNote: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  cv: { name: string; size: number | null; lebenslauf: boolean } | null;
  coverLetter: { subject: string | null; at: string | null } | null;
  timeline: TimelineStep[];
  events: { status: ExternalAppStatus; note: string | null; at: string }[];
}

/** One step of the status timeline (vertical list on phones, a row from sm up). */
const Step = ({ step, last }: { step: TimelineStep; last: boolean }) => {
  const { t } = useTranslation();
  const label = step.key === 'ANSWER' && step.outcome ? t(`xapp.portal.outcome.${step.outcome}`) : t(`xapp.portal.steps.${step.key}`);
  const bad = step.outcome === 'REJECTED' || step.outcome === 'NO_REPLY';
  return (
    <li className="relative flex min-w-0 flex-1 gap-3 sm:flex-col sm:gap-2" aria-current={step.state === 'current' ? 'step' : undefined}>
      <div className="flex items-center sm:w-full">
        <span
          className={clsx(
            'grid size-7 shrink-0 place-items-center rounded-full border-2',
            step.state === 'done' && !bad && 'border-primary bg-primary text-on-primary',
            step.state === 'done' && bad && 'border-muted bg-sunken text-muted',
            step.state === 'current' && 'border-primary bg-card text-primary',
            (step.state === 'todo' || step.state === 'skipped') && 'border-line bg-card text-muted',
          )}
          aria-hidden
        >
          {step.state === 'done' ? <Check className="size-4" /> : step.state === 'current' ? <span className="size-2 rounded-full bg-primary" /> : <CircleDashed className="size-3.5" />}
        </span>
        {!last && <span className={clsx('mx-2 hidden h-0.5 flex-1 rounded-full sm:block', step.state === 'done' ? 'bg-primary' : 'bg-line')} aria-hidden />}
      </div>
      <div className="min-w-0 pb-3 sm:pb-0">
        <p className={clsx('text-sm font-semibold', step.state === 'todo' || step.state === 'skipped' ? 'text-muted' : 'text-ink')}>
          {label}
          <span className="sr-only"> ({t(`xapp.portal.state.${step.state}`)})</span>
        </p>
        {step.at && step.state !== 'todo' && <p className="text-xs text-muted">{fmtDate(step.at)}</p>}
        {step.state === 'skipped' && <p className="text-xs text-muted">{t('xapp.portal.state.skipped')}</p>}
      </div>
    </li>
  );
};

const ApplicationCard = ({ a, onLetter }: { a: MyExternalApplication; onLetter: () => void }) => {
  const { t } = useTranslation();
  const cvDownload = useBlobDownload();
  const host = hostOf(a.listingUrl);
  const notes = a.events.filter((e) => e.note);
  return (
    <li className="card min-w-0 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg leading-snug font-bold break-words text-ink">{a.listingTitle || host}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {a.listingCompany && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="size-3.5" aria-hidden /> {a.listingCompany}
              </span>
            )}
            {a.listingLocation && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {a.listingLocation}
              </span>
            )}
            <span>{t('xapp.portal.appliedOn', { date: fmtDate(a.createdAt) })}</span>
          </p>
          <a href={a.listingUrl} target="_blank" rel="nofollow noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 text-sm text-link hover:underline">
            <span className="truncate">
              {t('xapp.portal.openListing')}
              {host ? ` · ${host}` : ''}
            </span>
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            <span className="sr-only">{t('xapp.portal.newTab')}</span>
          </a>
        </div>
        <span className={clsx('badge shrink-0', STATUS_TONE[a.status])}>{t(`xapp.portal.status.${a.status}`)}</span>
      </div>

      <ol className="mt-5 flex flex-col sm:flex-row sm:gap-2" aria-label={t(`xapp.portal.status.${a.status}`)}>
        {a.timeline.map((s, i) => (
          <Step key={s.key} step={s} last={i === a.timeline.length - 1} />
        ))}
      </ol>

      {notes.length > 0 && (
        <div className="mt-4 space-y-2">
          {notes
            .slice()
            .reverse()
            .map((e, i) => (
              <div key={`${e.at}-${i}`} className="rounded-lg border border-line bg-sunken/60 px-3 py-2">
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <MessageSquareText className="size-3.5" aria-hidden /> {t('xapp.portal.note')} · {t(`xapp.portal.status.${e.status}`)} · {fmtDate(e.at)}
                </p>
                <p className="mt-1 text-sm whitespace-pre-line break-words text-ink">{e.note}</p>
              </div>
            ))}
        </div>
      )}

      {a.coverLetter && <p className="mt-3 text-xs text-success-fg">{t('xapp.portal.coverAttached')}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" icon={PenLine} onClick={onLetter}>
          {t('xapp.portal.writeLetter')}
        </Button>
        {a.cv && (
          <Button variant="ghost" size="sm" icon={FileText} loading={cvDownload.busy} onClick={() => void cvDownload.run(`/external-applications/${a.id}/cv`, a.cv!.name)}>
            {t('xapp.portal.downloadCv')}: {a.cv.lebenslauf ? t('xapp.portal.cvLebenslauf') : a.cv.name}
          </Button>
        )}
      </div>
    </li>
  );
};

/**
 * Learn › External applications: earlier "apply via Triad Vision" applications with their status, read-only history
 * (GET /api/external-applications). Applying via Triad Vision to external listings is retired: the candidate applies
 * to the employer directly (/jobs/germany), so nothing new appears here and nothing is sent any more.
 */
export default function AccountExternalApplications() {
  const { t } = useTranslation();
  usePageTitle(t('xapp.portal.title'));
  const [letterFor, setLetterFor] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-external-applications'],
    queryFn: async () => (await api.get<{ items: MyExternalApplication[]; linked: number }>('/external-applications')).data,
  });
  const save = useMutation({
    mutationFn: async (v: { id: string; subject: string; body: string }) => api.post(`/external-applications/${v.id}/cover-letter/save`, { subject: v.subject, body: v.body }),
    onSuccess: () => toast.success(t('xapp.letter.saved')),
    onError: (err) => toast.error(xappError(err)),
  });

  if (isLoading) {
    return (
      <div className="grid min-h-[30vh] place-items-center">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-muted">{t('xapp.errors.generic')}</p>
        <button type="button" className="btn-ghost btn-sm mt-4" onClick={() => refetch()}>
          {t('xapp.portal.retry')}
        </button>
      </div>
    );
  }

  const items = data?.items ?? [];
  const current = items.find((a) => a.id === letterFor) ?? null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-page-title">{t('xapp.portal.title')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('xapp.portal.subtitle')}</p>
        </div>
        <Link to="/jobs/germany" className="btn-ghost btn-sm">
          {t('xapp.portal.emptyCta')} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      <p role="note" className="flex items-start gap-2 rounded-lg border border-line bg-sunken/60 px-3 py-2 text-sm text-ink">
        <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /> {t('gj.direct.cabinet')}
      </p>

      {!!data?.linked && (
        <p role="status" className="rounded-lg border border-line bg-info-bg px-3 py-2 text-sm text-info-fg">
          {t('xapp.portal.linked', { count: data.linked })}
        </p>
      )}

      {items.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <p className="type-card-title text-lg">{t('xapp.portal.empty')}</p>
          <Link to="/jobs/germany" className="btn-primary btn-sm mt-5">
            {t('xapp.portal.emptyCta')}
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((a) => (
            <ApplicationCard key={a.id} a={a} onLetter={() => setLetterFor(a.id)} />
          ))}
        </ul>
      )}

      <CoverLetterEditor
        open={!!current}
        onClose={() => setLetterFor(null)}
        draftUrl={current ? `/external-applications/${current.id}/cover-letter` : ''}
        pdfUrl={current ? `/external-applications/${current.id}/cover-letter/pdf` : ''}
        actions={(letter) =>
          current ? (
            <Button icon={Save} loading={save.isPending} disabled={!letter.subject.trim() || !letter.body.trim()} onClick={() => save.mutate({ id: current.id, ...letter })}>
              {t('xapp.letter.saveToLetters')}
            </Button>
          ) : null
        }
      />
    </div>
  );
}
