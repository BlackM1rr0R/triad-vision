import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, BrainCircuit, FileCheck2, FileSearch, FileText, Loader2, Settings2, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { Panel } from '@/components/admin/ui';
import { fmtDateTime, toastError } from '@/components/admin/labels';
import { NewSignatureRequest } from '@/components/esign/NewRequest';
import { ConsistencyView } from './ConsistencyView';
import { ContractView } from './ContractView';
import { VidexView } from './VidexView';
import { SettingsModal } from './SettingsModal';
import { fetchOverview, overviewKey, reasonText, runContract, usd, type ConsistencyResult, type Kind, type Overview, type RunResponse, type VidexResult } from './api';
import { Skeleton as UiSkeleton } from '@/components/ui/Skeleton';

const KINDS: { kind: Kind; icon: typeof FileText; path: string }[] = [
  { kind: 'CONSISTENCY', icon: FileSearch, path: 'consistency' },
  { kind: 'CONTRACT', icon: FileCheck2, path: 'contract' },
  { kind: 'VIDEX', icon: FileText, path: 'videx' },
];

const Skeleton = () => (
  <div className="space-y-2" aria-hidden>
    {[0, 1, 2].map((i) => (
      <UiSkeleton key={i} className="h-16" />
    ))}
  </div>
);

/**
 * "AI" section of the admin case page: three one-click checks (consistency, contract, VIDEX) with their last
 * results as checkable cards. No prompts anywhere — every follow-up is a button.
 */
export const CaseAiChecks = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: overviewKey(caseId), queryFn: () => fetchOverview(caseId), staleTime: 30_000 });
  const [tab, setTab] = useState<Kind>('CONSISTENCY');
  const [running, setRunning] = useState<Kind | null>(null);
  const [contractDoc, setContractDoc] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setData = (fn: (o: Overview) => Overview) => qc.setQueryData<Overview>(overviewKey(caseId), (o) => (o ? fn(o) : o));

  const run = async (kind: Kind, file?: File) => {
    setTab(kind);
    setRunning(kind);
    try {
      if (kind === 'CONTRACT') {
        const res = await runContract(caseId, file ? { file } : contractDoc ? { documentId: contractDoc } : {});
        if (!res.run) toast.error(t('aiCase.panel.unavailable', { reason: reasonText(t, res.reason) }));
        else setData((o) => ({ ...o, runs: { ...o.runs, CONTRACT: res.run }, states: res.states ?? o.states }));
      } else {
        const path = KINDS.find((k) => k.kind === kind)!.path;
        const res = (await api.post<RunResponse<ConsistencyResult | VidexResult>>(`/admin/cases/${caseId}/ai/${path}`, {})).data;
        setData((o) => ({ ...o, runs: { ...o.runs, [kind]: res.run }, states: res.states }));
        const ai = res.run.result.ai;
        if (ai.status === 'skipped' && ai.reason && ai.reason !== 'NOTHING_TO_DO') toast.message(t('aiCase.panel.rulesOnly', { reason: reasonText(t, ai.reason) }));
      }
    } catch (err) {
      toastError(err);
    } finally {
      setRunning(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const ai = data?.ai;
  // The contract check needs the model; the other two also work with the rules alone.
  const disabledReason = (kind: Kind) => (kind === 'CONTRACT' && ai && !ai.available ? reasonText(t, ai.reason) : null);
  const contracts = data?.contracts ?? [];
  const current = data?.runs[tab] ?? null;

  return (
    <Panel
      title={t('aiCase.panel.title')}
      icon={BrainCircuit}
      id="case-ai"
      actions={
        <button type="button" className="btn-secondary btn-sm" onClick={() => setSettingsOpen(true)}>
          <Settings2 className="size-3.5" aria-hidden /> {t('aiCase.panel.settings')}
        </button>
      }
    >
      <p className="mb-4 text-xs text-muted">{t('aiCase.panel.subtitle')}</p>
      {ai && !ai.available && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-300" role="status">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {t('aiCase.panel.unavailable', { reason: reasonText(t, ai.reason) })} {t('aiCase.panel.worksWithoutAi')}
          </span>
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {KINDS.map(({ kind, icon: I }) => {
          const last = data?.runs[kind];
          const blocked = disabledReason(kind);
          const isRunning = running === kind;
          return (
            <div key={kind} className={clsx('flex min-w-0 flex-col rounded-xl border p-4 transition', tab === kind ? 'border-brand-600 ring-1 ring-brand-600/30' : 'border-line')}>
              <button type="button" className="flex min-w-0 items-start gap-3 text-left" onClick={() => setTab(kind)} aria-pressed={tab === kind}>
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-600/10 text-brand-600">
                  <I className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-navy-900">{t(`aiCase.kinds.${kind}.title`)}</span>
                  <span className="mt-0.5 block text-xs text-muted">{t(`aiCase.kinds.${kind}.desc`)}</span>
                </span>
              </button>
              {kind === 'CONTRACT' && contracts.length > 0 && (
                <select className="input mt-3 text-xs" value={contractDoc} onChange={(e) => setContractDoc(e.target.value)} aria-label={t('aiCase.contract.pick')}>
                  <option value="">{contracts.find((c) => c.current || c.stage === 'CONTRACT') ? `${(contracts.find((c) => c.current) ?? contracts.find((c) => c.stage === 'CONTRACT'))!.name} (${t('aiCase.contract.current')})` : t('aiCase.contract.pick')}</option>
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={!!running || !!blocked || (kind === 'CONTRACT' && !contracts.some((c) => c.current || c.stage === 'CONTRACT') && !contractDoc)}
                  onClick={() => void run(kind)}
                  title={blocked ?? undefined}
                >
                  {isRunning ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
                  {isRunning ? t('aiCase.panel.working') : last ? t('aiCase.panel.rerun') : t('aiCase.panel.run')}
                </button>
                {kind === 'CONTRACT' && (
                  <>
                    <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => e.target.files?.[0] && void run('CONTRACT', e.target.files[0])} />
                    <button type="button" className="btn-secondary btn-sm" disabled={!!running || !!blocked} onClick={() => fileRef.current?.click()}>
                      {t('aiCase.contract.upload')}
                    </button>
                  </>
                )}
              </div>
              <p className="mt-2 text-[11px] text-muted">
                {last ? t('aiCase.panel.lastRun', { date: fmtDateTime(last.createdAt) }) : t('aiCase.panel.never')}
                {' · '}
                {last && last.costUsd > 0 ? t('aiCase.panel.lastCost', { usd: usd(last.costUsd) }) : t('aiCase.panel.estimate', { usd: usd(data?.estimatesUsd[kind] ?? 0) })}
              </p>
              {blocked && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{blocked}</p>}
              {kind === 'CONTRACT' && !contracts.length && <p className="mt-1 text-[11px] text-muted">{t('aiCase.contract.noContract')}</p>}
            </div>
          );
        })}
      </div>

      <div className="mt-5" aria-live="polite">
        {isLoading || running === tab ? (
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-brand-600">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> {running === tab ? t('aiCase.panel.working') : ''}
            </p>
            <Skeleton />
          </div>
        ) : current && data ? (
          <>
            {current.result && (current.result as { ai?: { status: string; reason?: string } }).ai?.status === 'skipped' && tab !== 'CONTRACT' && (current.result as { ai: { reason?: string } }).ai.reason !== 'NOTHING_TO_DO' && (
              <p className="mb-3 text-xs text-muted">{t('aiCase.panel.rulesOnly', { reason: reasonText(t, (current.result as { ai: { reason?: string } }).ai.reason) })}</p>
            )}
            {tab === 'CONSISTENCY' && data.runs.CONSISTENCY && <ConsistencyView caseId={caseId} run={data.runs.CONSISTENCY} states={data.states} />}
            {tab === 'CONTRACT' && data.runs.CONTRACT && <ContractView caseId={caseId} run={data.runs.CONTRACT} onSendAnyway={() => setSignOpen(true)} />}
            {tab === 'VIDEX' && data.runs.VIDEX && <VidexView caseId={caseId} run={data.runs.VIDEX} states={data.states} />}
          </>
        ) : null}
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewSignatureRequest open={signOpen} onClose={() => setSignOpen(false)} caseId={caseId} contract />
    </Panel>
  );
};

export default CaseAiChecks;
