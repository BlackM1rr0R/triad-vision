import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CheckCircle2, Circle, Clapperboard, Clock3, FileDown, FileText, ShieldCheck, ThumbsDown, ThumbsUp, UserRound } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesPlacement } from '@/i18n/pagesPlacement';
import { pagesJobs } from '@/i18n/pagesJobs';
import { Spinner } from '@/components/ui/Spinner';
import { TONE_CLASS } from '@/components/ui/status';
import { Lost } from '@/components/illustrations';
import { fmtDate } from '@/components/admin/labels';
import { ScoreRing, GapList } from '@/components/jobs/MatchMeter';
import { useJobLabels } from '@/components/jobs/labels';
import { MatchBars } from '@/components/placement/MatchBreakdown';
import { placementError, type PublicShare, type ShareDecision } from '@/components/placement/api';

registerCopy(pagesPlacement);
registerCopy(pagesJobs);

const DOC_ICON = { approved: CheckCircle2, inReview: Clock3, missing: Circle } as const;
const DOC_TONE = { approved: 'text-success-fg', inReview: 'text-info-fg', missing: 'text-muted' } as const;

const Card = ({ title, icon: Icon, children, className }: { title: string; icon: typeof FileText; children: ReactNode; className?: string }) => (
  <section className={clsx('card card-pad min-w-0', className)}>
    <h2 className="mb-4 flex items-center gap-2.5 type-card-title text-ink">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl chip-sky">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      {title}
    </h2>
    {children}
  </section>
);

/**
 * Employer share page for one candidate (/kandidat/:token): works without an account, never indexed. Shows the
 * anonymised profile, match with breakdown, document status (no files), the anonymised CV, the intro video and
 * the "Interested" / "Not a fit" answer. Server: routes/candidateShare.ts.
 */
export default function CandidateSharePage() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const L = useJobLabels();
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const base = `/candidate-share/${encodeURIComponent(token)}`;
  const key = ['candidate-share', token];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ share: PublicShare }>(base)).data.share,
    retry: (count, err) => count < 2 && errorCode(err) === 'NETWORK',
    refetchOnWindowFocus: false,
  });
  usePageTitle(q.data ? `${t('placement.public.eyebrow')} · ${q.data.candidate.name}` : t('placement.public.eyebrow'));
  const [choice, setChoice] = useState<ShareDecision | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const decide = useMutation({
    mutationFn: async () => (await api.post<{ share: PublicShare }>(`${base}/decision`, { decision: choice, name: name.trim(), note: note.trim() || null })).data.share,
    onSuccess: (share) => qc.setQueryData(key, share),
  });

  if (q.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas text-primary" role="status" aria-label={t('placement.public.loading')}>
        <Spinner className="size-8 border-[3px]" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="min-h-screen bg-canvas px-4 pt-24 pb-16 sm:pt-28 lg:pt-36">
        <div className="card mx-auto flex max-w-xl flex-col items-center rounded-3xl px-6 py-14 text-center">
          <Lost className="w-44" />
          <h1 className="mt-5 font-display text-xl font-semibold text-ink">{t('placement.public.invalidTitle')}</h1>
          <p className="mt-1 max-w-md text-sm text-muted">{t('placement.public.invalidText')}</p>
        </div>
      </div>
    );
  }

  const s = q.data;
  const c = s.candidate;
  const rows: [string, string][] = [
    [t('jobsArea.profile.profession'), c.profession ?? '—'],
    [t('jobsArea.profile.experience'), c.experienceYears != null ? L.years(c.experienceYears) : '—'],
    [t('jobsArea.profile.german'), c.germanLevel ? L.german(c.germanLevel) : '—'],
    [t('jobsArea.profile.education'), L.education(c.education) || '—'],
    [t('placement.recognition.label'), c.recognitionStatus ? t(`placement.recognition.status.${c.recognitionStatus}`) : '—'],
    [t('jobsArea.profile.licence'), c.drivingLicence ?? '—'],
    [t('jobsArea.profile.city'), c.city ?? '—'],
  ];

  return (
    <div className="min-h-screen bg-canvas px-4 pt-24 pb-16 sm:pt-28 sm:pb-24 lg:pt-36">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="card card-pad rounded-3xl">
          <span className="eyebrow inline-flex items-center gap-1.5">
            <UserRound className="size-4" aria-hidden /> {t('placement.public.eyebrow')}
          </span>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{c.name}</h1>
              <p className="mt-1 text-sm text-muted">{[c.profession, c.city].filter(Boolean).join(' · ')}</p>
              {s.company && <p className="mt-1 text-sm font-semibold text-ink">{t('placement.public.forCompany', { company: s.company.name })}</p>}
            </div>
            {s.match && <ScoreRing score={s.match.score} size={72} />}
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{t('placement.public.intro')}</p>
          <p className="mt-2 text-xs text-muted">{t('placement.public.expires', { date: fmtDate(s.expiresAt) })}</p>
        </header>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title={t('placement.public.profile')} icon={UserRound}>
            <dl className="divide-y divide-line">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="text-right font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 border-t border-line pt-4">
              {s.cv.available ? (
                <a href={`/api${base}/cv.pdf`} className="btn-secondary btn-sm">
                  <FileDown className="size-3.5" aria-hidden /> {t('placement.public.cvDownload')}
                </a>
              ) : (
                <p className="text-xs text-muted">{t('placement.public.cvNotShared')}</p>
              )}
            </div>
          </Card>

          {s.match && s.vacancy ? (
            <Card title={t('placement.public.match')} icon={CheckCircle2}>
              <p className="text-sm font-semibold text-ink">
                {t('placement.public.vacancy')}: {tr(s.vacancy.title)}
                {s.vacancy.city ? ` · ${s.vacancy.city}` : ''}
              </p>
              <p className="mt-0.5 text-xs text-muted">{t('placement.public.matchHint')}</p>
              <MatchBars match={s.match} className="mt-4" />
              <GapList match={s.match} className="mt-4" />
            </Card>
          ) : (
            <Card title={t('placement.public.video')} icon={Clapperboard}>
              {s.video.available ? (
                <video controls preload="metadata" className="aspect-video w-full rounded-xl bg-navy-900" src={`/api${base}/video`} />
              ) : (
                <p className="text-sm text-muted">{t('placement.public.noVideo')}</p>
              )}
            </Card>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {s.match && s.vacancy && (
            <Card title={t('placement.public.video')} icon={Clapperboard}>
              {s.video.available ? (
                <video controls preload="metadata" className="aspect-video w-full rounded-xl bg-navy-900" src={`/api${base}/video`} />
              ) : (
                <p className="text-sm text-muted">{t('placement.public.noVideo')}</p>
              )}
            </Card>
          )}
          <Card title={t('placement.public.documents')} icon={FileText}>
            <p className="-mt-2 mb-3 text-xs text-muted">{t('placement.public.documentsHint')}</p>
            {!s.documents || !s.documents.total ? (
              <p className="text-sm text-muted">{t('placement.public.docsNone')}</p>
            ) : (
              <>
                <p className="mb-2 text-sm font-semibold text-ink">{t('placement.public.docsSummary', { approved: s.documents.approved, total: s.documents.total })}</p>
                <ul className="divide-y divide-line">
                  {s.documents.items.map((d) => {
                    const Icon = DOC_ICON[d.state];
                    return (
                      <li key={d.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                        <span className="min-w-0 truncate text-ink/80">{tr(d.title)}</span>
                        <span className={clsx('inline-flex shrink-0 items-center gap-1 text-xs font-semibold', DOC_TONE[d.state])}>
                          <Icon className="size-3.5" aria-hidden /> {t(`placement.public.docState.${d.state}`)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Card>
        </div>

        <section className="card card-pad" aria-labelledby="cs-decide">
          <h2 id="cs-decide" className="type-card-title text-ink">
            {t('placement.public.decideTitle')}
          </h2>
          {s.decision ? (
            <div className={clsx('mt-3 rounded-xl px-4 py-3 text-sm', s.decision.decision === 'INTERESTED' ? TONE_CLASS.success : TONE_CLASS.neutral)}>
              <p className="font-semibold">{t(`placement.public.thanks.${s.decision.decision}`)}</p>
              <p className="mt-1 text-xs">
                {t('placement.public.decided', { name: s.decision.decidedByName, date: fmtDate(s.decision.decidedAt), decision: t(`placement.share.decision.${s.decision.decision}`) })}
              </p>
            </div>
          ) : (
            <form
              className="mt-3 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (choice && name.trim().length >= 2) decide.mutate();
              }}
            >
              <p className="text-sm text-muted">{t('placement.public.decideIntro')}</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('placement.public.decideTitle')}>
                {(['INTERESTED', 'REJECTED'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={choice === d}
                    onClick={() => setChoice(d)}
                    className={clsx(
                      'inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors',
                      choice === d ? (d === 'INTERESTED' ? 'border-success bg-success-bg text-success-fg ring-2 ring-success/30' : 'border-primary bg-primary text-primary-contrast') : 'border-line bg-card text-ink hover:border-line-strong',
                    )}
                  >
                    {d === 'INTERESTED' ? <ThumbsUp className="size-4" aria-hidden /> : <ThumbsDown className="size-4" aria-hidden />}
                    {d === 'INTERESTED' ? t('placement.public.interested') : t('placement.public.notFit')}
                  </button>
                ))}
              </div>
              {choice && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="cs-name">
                      {t('placement.public.name')}
                    </label>
                    <input id="cs-name" className="input" required minLength={2} maxLength={160} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="cs-note">
                      {t('placement.public.note')}
                    </label>
                    <textarea id="cs-note" rows={3} maxLength={2000} className="input" placeholder={t('placement.public.notePh')} value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                </div>
              )}
              {decide.error && (
                <p className="text-sm text-danger" role="alert">
                  {placementError(decide.error)}
                </p>
              )}
              <button type="submit" className="btn-primary btn-lg" disabled={!choice || name.trim().length < 2 || decide.isPending}>
                {decide.isPending && <Spinner className="size-4" />} {t('placement.public.submit')}
              </button>
            </form>
          )}
        </section>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          <ShieldCheck className="size-3.5" aria-hidden /> {t('placement.public.privacy')}
        </p>
      </div>
    </div>
  );
}
