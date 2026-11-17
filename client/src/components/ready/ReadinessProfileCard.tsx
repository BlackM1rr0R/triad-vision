import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesGermanyReady } from '@/i18n/pagesGermanyReady';

registerCopy(pagesGermanyReady);

interface Profile {
  readinessScore: number;
  germanLevel: string | null;
  mockExam: { level: 'A1' | 'B1'; module: string; percent: number } | null;
  germanyReady: 'BRONZE' | 'SILVER' | 'GOLD' | null;
  workScene: { id: string; percent: number | null; passed: boolean } | null;
  interviewPractised: boolean;
  interviewDone: boolean;
  activitiesDone: number;
}

interface Bands {
  readinessBand: string;
  practiceBand: string;
  germanyReady: boolean;
}

const Shell = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-line bg-card p-4" aria-labelledby="readiness-profile-h">
      <h3 id="readiness-profile-h" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ClipboardCheck className="size-4 text-primary" aria-hidden />
        {t('readyEmployer.title')} <span className="font-normal text-muted">/ {t('readyEmployer.subtitle')}</span>
      </h3>
      <dl className="mt-3 divide-y divide-line text-sm">{children}</dl>
      <p className="mt-2 text-[11px] text-muted">{t('readyEmployer.consentNote')}</p>
    </section>
  );
};

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 py-1.5">
    <dt className="text-muted">{label}</dt>
    <dd className="font-semibold text-ink">{children}</dd>
  </div>
);

/**
 * "Hazırlıq profili / Vorbereitungsprofil" in the company's worker drawer — shown ONLY when the client switched on the
 * READINESS_PROFILE consent in the privacy centre (the API answers null otherwise and nothing is rendered).
 */
export const WorkerReadinessCard = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['company-readiness', 'worker', caseId],
    queryFn: async () => (await api.get<{ profile: Profile | null }>(`/company/readiness-profile/workers/${encodeURIComponent(caseId)}`)).data.profile,
    retry: false,
    staleTime: 60_000,
  });
  const p = q.data;
  if (!p) return null;
  const e = (k: string, o?: Record<string, unknown>) => String(t(`readyEmployer.${k}`, o));
  return (
    <Shell>
      <Row label={e('readiness')}>{p.readinessScore} / 100</Row>
      <Row label={e('german')}>
        {p.germanLevel ?? '—'}
        {p.mockExam && <span className="block text-xs font-normal text-muted">{e('mock', { level: p.mockExam.level, module: p.mockExam.module, pct: p.mockExam.percent })}</span>}
      </Row>
      <Row label={e('ready')}>{p.germanyReady ? t(`gready.level.${p.germanyReady}`) : e('readyNo')}</Row>
      {p.workScene && <Row label={e('scene')}>{p.workScene.percent !== null ? `${p.workScene.percent} %` : e('sceneNone')}</Row>}
      <Row label={e('interview')}>{p.interviewPractised ? e('yes') : e('no')}</Row>
    </Shell>
  );
};

/** Anonymous candidate pool: aggregated bands only, and only with the candidate's consent. */
export const PoolReadinessBands = ({ code }: { code: string }) => {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['company-readiness', 'pool', code],
    queryFn: async () => (await api.get<{ bands: Bands | null }>(`/company/readiness-profile/pool/${encodeURIComponent(code)}`)).data.bands,
    retry: false,
    staleTime: 60_000,
  });
  const b = q.data;
  if (!b) return null;
  const e = (k: string) => String(t(`readyEmployer.${k}`));
  return (
    <Shell>
      <Row label={e('bands')}>{b.readinessBand}</Row>
      <Row label={e('practice')}>{b.practiceBand}</Row>
      <Row label={e('ready')}>{b.germanyReady ? e('readyHeld') : e('readyNo')}</Row>
    </Shell>
  );
};
