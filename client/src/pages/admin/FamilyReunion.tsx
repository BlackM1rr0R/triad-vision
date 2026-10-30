import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesFamilyReunion } from '@/i18n/pagesFamilyReunion';
import { pagesFamilyLanguage } from '@/i18n/pagesFamilyLanguage';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, StatTile } from '@/components/admin/ui';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { TONE_CLASS } from '@/components/ui/status';
import { READINESS_TONE } from '@/components/family/ReunionReadiness';
import type { CaseStatus } from '@/lib/types';
import type { FamilyRelation, JoinsWhen, ReadinessCheck, ReadinessStatus, TimelineStep } from '@/components/family/types';

registerCopy(pagesFamilyReunion);
registerCopy(pagesFamilyLanguage);

const STAGES = ['all', 'waiting', 'ready', 'active'] as const;
type Stage = (typeof STAGES)[number];
type Phase = Exclude<Stage, 'all'>;

// GET /api/family/reunion/waiting (server/src/lib/family/readiness.ts waitingFamilies)
interface Family {
  mainCaseId: string;
  number: string;
  name: string;
  status: CaseStatus;
  staff: string | null;
  phase: Phase;
  startedAt: string | null;
  members: { caseId: string; number: string; relation: FamilyRelation; status: CaseStatus; joinsWhen: JoinsWhen; name: string }[];
  openItems: number;
  readiness: { status: ReadinessStatus; problems: Pick<ReadinessCheck, 'code' | 'status'>[] } | null;
  current: TimelineStep | null;
}
interface List {
  families: Family[];
  counts: Record<Phase, number>;
  truncated: boolean;
}

const PHASE_TONE: Record<Phase, keyof typeof TONE_CLASS> = { waiting: 'neutral', ready: 'warning', active: 'info' };

/** /admin/family-reunion — families with members joining later: worker's state, readiness, next step. */
export default function AdminFamilyReunion() {
  const { t } = useTranslation();
  const { date } = useL10n();
  usePageTitle(t('familyReunion.list.title'));
  const [params, setParams] = useSearchParams();
  const stage: Stage = (STAGES as readonly string[]).includes(params.get('stage') ?? '') ? (params.get('stage') as Stage) : 'all';
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['family-reunion-waiting', stage],
    queryFn: async () => (await api.get<List>('/family/reunion/waiting', { params: { stage } })).data,
    placeholderData: keepPreviousData,
  });
  const choose = (s: Stage) => {
    const next = new URLSearchParams(params);
    if (s === 'all') next.delete('stage');
    else next.set('stage', s);
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHead title={t('familyReunion.list.title')} subtitle={t('familyReunion.list.subtitle')} />
      {data && (
        <div className="mb-4 grid grid-cols-3 gap-3 sm:max-w-xl">
          {(['waiting', 'ready', 'active'] as const).map((p) => (
            <StatTile key={p} label={t(`familyReunion.list.phase.${p}`)} value={data.counts[p]} tone={p === 'ready' && data.counts.ready ? 'warn' : undefined} />
          ))}
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STAGES.map((s) => (
          <Chip key={s} active={stage === s} onClick={() => choose(s)}>
            {t(`familyReunion.list.filters.${s}`)}
          </Chip>
        ))}
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data?.families.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={Users} title={t('familyReunion.list.empty')} />
        </div>
      ) : (
        <>
          <ul className={clsx('divide-y divide-line rounded-xl border border-line bg-card', isFetching && 'opacity-70')}>
            {data.families.map((f) => (
              <li key={f.mainCaseId} className="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,16rem)] lg:items-center">
                <div className="min-w-0">
                  <Link to={`/admin/cases/${f.mainCaseId}#case-family`} className="font-semibold text-link hover:underline">
                    {f.number}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {f.name}
                    {f.staff ? ` · ${f.staff}` : ''}
                  </p>
                  <StatusBadge status={f.status} />
                </div>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className={clsx('badge', TONE_CLASS[PHASE_TONE[f.phase]])}>{t(`familyReunion.list.phase.${f.phase}`)}</span>
                    {f.startedAt && <span className="text-xs text-muted">{date(f.startedAt)}</span>}
                    {f.readiness && <span className={clsx('badge', TONE_CLASS[READINESS_TONE[f.readiness.status]])}>{t(`familyReunion.status.${f.readiness.status}`)}</span>}
                  </p>
                  <p className="mt-1 text-xs text-ink/80">
                    {f.members.map((m, i) => (
                      <span key={m.caseId}>
                        {i > 0 && ' · '}
                        <Link to={`/admin/cases/${m.caseId}`} className="hover:underline">
                          {m.name}
                        </Link>{' '}
                        <span className="text-muted">
                          ({t(`familyMembers.relation.${m.relation}`)}
                          {m.joinsWhen === 'LATER' ? `, ${t('familyReunion.list.joinsLater')}` : ''})
                        </span>
                      </span>
                    ))}
                  </p>
                  {f.readiness && f.readiness.problems.length > 0 && (
                    <p className="mt-0.5 truncate text-xs text-warning-fg">{[...new Set(f.readiness.problems.map((p) => t(`familyReunion.checks.${p.code}.title`, { level: '' }).trim()))].join(' · ')}</p>
                  )}
                </div>
                <div className="text-xs">
                  {f.current && <p className="font-semibold text-ink">{t('familyReunion.list.next', { step: t(`familyReunion.steps.${f.current}`) })}</p>}
                  {f.openItems > 0 && <p className="text-muted">{t('familyReunion.list.openItems', { count: f.openItems })}</p>}
                </div>
              </li>
            ))}
          </ul>
          {data.truncated && <p className="mt-2 text-xs text-muted">{t('familyReunion.list.truncated')}</p>}
        </>
      )}
    </div>
  );
}
