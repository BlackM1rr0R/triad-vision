import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Car, CheckCircle2, GraduationCap, Languages, MapPin, ShieldCheck, Timer, UserCheck, Users, Video, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate } from '@/components/admin/labels';
import { ScoreRing } from '@/components/jobs/MatchMeter';
import { toastJobsError, useJobLabels } from '@/components/jobs/labels';
import { APPLICATION_STATUS_TONE, type AnonProfile, type ApplicationStatus } from '@/components/jobs/types';
import { Empty, Loading, Section } from './shared';
import { CvDownloadButton } from '@/components/cv/CvDownloadButton';

interface Item {
  id: string;
  status: ApplicationStatus;
  matchScore: number | null;
  companyNote: string | null;
  updatedAt: string;
  vacancy: { id: string; title: L10n; slug: string };
  candidate: AnonProfile;
}

type Action = 'INTERVIEW' | 'ACCEPT' | 'REJECT';
const FILTERS = ['', 'PROPOSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'] as const;

const DecisionBox = ({ item, onDone }: { item: Item; onDone: () => void }) => {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<Action | null>(null);
  const m = useMutation({
    mutationFn: (action: Action) => api.post(`/company/candidates/${item.id}/decision`, { action, note: note.trim() || undefined }),
    onSuccess: () => {
      toast.success(t('jobsArea.portal.candidates.saved'));
      setNote('');
      onDone();
    },
    onError: toastJobsError,
    onSettled: () => setPending(null),
  });
  const run = (a: Action) => {
    setPending(a);
    m.mutate(a);
  };
  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <label className="sr-only" htmlFor={`note-${item.id}`}>
        {t('jobsArea.portal.candidates.note')}
      </label>
      <textarea
        id={`note-${item.id}`}
        className="input min-h-16 text-sm"
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('jobsArea.portal.candidates.notePlaceholder')}
      />
      <div className="flex flex-wrap gap-2">
        {item.status === 'PROPOSED' && (
          <button type="button" className="btn-white btn-sm border border-line" disabled={m.isPending} onClick={() => run('INTERVIEW')}>
            {pending === 'INTERVIEW' ? <Spinner className="size-3.5" /> : <Video className="size-3.5" />} {t('jobsArea.portal.candidates.interview')}
          </button>
        )}
        <button type="button" className="btn-primary btn-sm" disabled={m.isPending} onClick={() => run('ACCEPT')}>
          {pending === 'ACCEPT' ? <Spinner className="size-3.5" /> : <CheckCircle2 className="size-3.5" />} {t('jobsArea.portal.candidates.accept')}
        </button>
        <button type="button" className="btn-white btn-sm border border-line text-danger" disabled={m.isPending} onClick={() => run('REJECT')}>
          {pending === 'REJECT' ? <Spinner className="size-3.5" /> : <XCircle className="size-3.5" />} {t('jobsArea.portal.candidates.reject')}
        </button>
      </div>
    </div>
  );
};

export const CompanyCandidates = () => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const L = useJobLabels();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const vacancyId = params.get('vacancyId') ?? '';
  const { data, isLoading } = useQuery({
    queryKey: ['company-candidates', status, vacancyId],
    queryFn: async () =>
      (await api.get<{ items: Item[] }>('/company/candidates', { params: { status: status || undefined, vacancyId: vacancyId || undefined } })).data.items,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['company-candidates'] });
    void qc.invalidateQueries({ queryKey: ['company-dashboard'] });
  };
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <Section title={t('jobsArea.portal.candidates.title')} icon={Users}>
      <p className="-mt-2 mb-5 flex items-start gap-2 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden /> {t('jobsArea.portal.candidates.privacy')}
      </p>
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f || 'all'}
            type="button"
            onClick={() => setFilter('status', f)}
            aria-pressed={status === f}
            className={clsx(
              'inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-semibold transition',
              status === f ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-ink/75 hover:border-brand-400',
            )}
          >
            {f ? L.appStatus(f) : t('jobsArea.common.all')}
          </button>
        ))}
        {vacancyId && (
          <button type="button" onClick={() => setFilter('vacancyId', '')} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-brand-50 px-3 text-xs font-semibold text-brand-700">
            {t('jobsArea.portal.candidates.oneVacancy')} <XCircle className="size-3.5" />
          </button>
        )}
      </div>

      {isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <Empty icon={UserCheck} title={t('jobsArea.portal.candidates.empty')} text={t('jobsArea.portal.candidates.emptyText')} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.map((a) => (
            <li key={a.id} className="min-w-0 rounded-2xl border border-line bg-white p-5">
              <div className="flex items-start gap-4">
                {a.matchScore != null && <ScoreRing score={a.matchScore} size={56} />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-display text-lg font-bold text-navy-900">{a.candidate.name}</p>
                    <span className={clsx('badge', APPLICATION_STATUS_TONE[a.status])}>{L.appStatus(a.status)}</span>
                  </div>
                  <p className="truncate text-sm text-muted">
                    {a.candidate.profession ?? '—'} · {tr(a.vacancy.title)}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <Timer className="size-4 shrink-0 text-brand-600" aria-hidden />
                  <dt className="sr-only">{t('jobsArea.profile.experience')}</dt>
                  <dd>{a.candidate.experienceYears != null ? L.years(a.candidate.experienceYears) : '—'}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <Languages className="size-4 shrink-0 text-brand-600" aria-hidden />
                  <dt className="sr-only">{t('jobsArea.profile.german')}</dt>
                  <dd>{L.german(a.candidate.germanLevel)}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <GraduationCap className="size-4 shrink-0 text-brand-600" aria-hidden />
                  <dt className="sr-only">{t('jobsArea.profile.education')}</dt>
                  <dd className="truncate">{L.education(a.candidate.education) || '—'}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <Car className="size-4 shrink-0 text-brand-600" aria-hidden />
                  <dt className="sr-only">{t('jobsArea.profile.licence')}</dt>
                  <dd className="truncate">{a.candidate.drivingLicence || '—'}</dd>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <MapPin className="size-4 shrink-0 text-brand-600" aria-hidden />
                  <dt className="sr-only">{t('jobsArea.profile.city')}</dt>
                  <dd className="truncate">{a.candidate.city ? t('jobsArea.portal.candidates.from', { city: a.candidate.city }) : '—'}</dd>
                </div>
              </dl>
              {a.companyNote && <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs text-ink/80">{a.companyNote}</p>}
              <CvDownloadButton url={`/company/candidates/${a.id}/cv.pdf`} anonymised className="mt-3" />
              <p className="mt-3 text-[11px] text-muted">{t('jobsArea.portal.candidates.updated', { date: fmtDate(a.updatedAt) })}</p>
              {(a.status === 'PROPOSED' || a.status === 'INTERVIEW') && <DecisionBox item={a} onDone={refresh} />}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
};
