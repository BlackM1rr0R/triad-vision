import { useMemo, useState } from 'react';
import { STATUS_TONES, toneClasses, toneTexts } from '@/components/ui/status';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { History, Pencil, Plus, Trash2, Workflow, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesAutomation } from '@/i18n/pagesAutomation';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Drawer } from '@/components/admin/Drawer';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Switch } from '@/components/admin/ui';
import { Tabs } from '@/components/ui/Tabs';
import { fmtDateTime, fmtRelative } from '@/components/admin/labels';
import { RuleEditor, blankRule } from '@/components/automation/RuleEditor';
import { AssignmentPanel, HandoversPanel } from '@/components/automation/AssignmentPanel';
import { reasonText, toastAutomationError, type Meta, type Rule, type RuleDraft, type Run, type RunStatus } from '@/components/automation/types';

registerCopy(pagesAutomation);

const RUN_TONE: Record<RunStatus, string> = toneClasses(STATUS_TONES.automationRun);
const STEP_TONE: Record<string, string> = toneTexts(STATUS_TONES.automationRun);

const RunLog = ({ rule, onClose }: { rule: Rule | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<RunStatus | ''>('');
  const { data, isLoading } = useQuery({
    queryKey: ['automation-runs', rule?.id, status],
    queryFn: async () => (await api.get<{ total: number; runs: Run[] }>(`/admin/automation/rules/${rule!.id}/runs`, { params: status ? { status } : {} })).data,
    enabled: !!rule,
    refetchInterval: 30_000,
  });
  return (
    <Drawer open={!!rule} onClose={onClose} title={rule ? t('automation.runs.title', { name: rule.name }) : ''}>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Chip active={!status} onClick={() => setStatus('')}>{t('automation.runs.all')}</Chip>
        {(['SUCCEEDED', 'WAITING', 'PARTIAL', 'SKIPPED', 'FAILED'] as RunStatus[]).map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{t(`automation.runs.status.${s}`)}</Chip>
        ))}
      </div>
      {isLoading ? (
        <LoadingBlock className="min-h-40" />
      ) : !data?.runs.length ? (
        <EmptyState icon={History} title={t('automation.runs.empty')} />
      ) : (
        <ol className="space-y-3">
          {data.runs.map((r) => (
            <li key={r.id} className="rounded-lg border border-line bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={clsx('badge', RUN_TONE[r.status])}>{t(`automation.runs.status.${r.status}`)}</span>
                {r.caseId ? <Link to={`/admin/cases/${r.caseId}`} className="font-semibold text-link hover:underline">{r.caseNumber ?? r.caseId}</Link> : <span className="text-muted">{r.entityType}</span>}
                <span className="text-xs text-muted" title={fmtDateTime(r.createdAt)}>{fmtRelative(r.createdAt)}</span>
                {r.depth > 0 && <span className="text-xs text-muted">· {t('automation.runs.depth', { depth: r.depth })}</span>}
              </div>
              {r.reason && <p className="mt-1 text-xs text-muted">{reasonText(r.reason)}</p>}
              {r.steps.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-dashed border-line pt-2 text-xs">
                  {r.steps.map((s) => (
                    <li key={s.index} className="flex flex-wrap gap-x-2">
                      <span className="font-semibold text-ink">{s.index + 1}. {t(`automation.actions.${s.actionType}`)}</span>
                      <span className={STEP_TONE[s.status]}>{t(`automation.runs.step.${s.status}`)}</span>
                      <span className="text-muted">{s.executedAt ? t('automation.runs.at', { time: fmtDateTime(s.executedAt) }) : t('automation.runs.due', { time: fmtDateTime(s.runAt) })}</span>
                      {s.reason && <span className="basis-full text-muted">{reasonText(s.reason)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </Drawer>
  );
};

const RuleCard = ({ rule, onEdit, onLog, onDelete }: { rule: Rule; onEdit: () => void; onLog: () => void; onDelete: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.patch(`/admin/automation/rules/${rule.id}/enabled`, { enabled }),
    onSuccess: (_r, enabled) => {
      toast.success(enabled ? t('automation.rules.on') : t('automation.rules.off'));
      void qc.invalidateQueries({ queryKey: ['automation-rules'] });
    },
    onError: toastAutomationError,
  });
  const stats = (['SUCCEEDED', 'PARTIAL', 'SKIPPED', 'FAILED', 'WAITING'] as RunStatus[]).filter((s) => rule.stats30d[s]);
  return (
    <li className={clsx('rounded-xl border bg-card p-4 transition', rule.enabled ? 'border-primary/25' : 'border-line')}>
      <div className="flex items-start gap-3">
        <span className={clsx('grid size-9 shrink-0 place-items-center rounded-lg', rule.enabled ? 'bg-primary/[0.06] text-link' : 'bg-sunken text-muted')}><Zap className="size-4" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-ink">{rule.name}</h3>
            {rule.exampleKey && <span className="badge bg-neutral-bg text-neutral-fg">{t('automation.rules.example')}</span>}
            {!rule.valid && <span className="badge bg-danger-bg text-danger-fg">{t('automation.rules.invalid')}</span>}
          </div>
          {rule.description && <p className="mt-0.5 text-sm text-muted">{rule.description}</p>}
          <p className="mt-1.5 text-xs text-ink/80">
            <span className="font-bold text-link">{t('automation.rules.when')}</span> {t(`automation.triggers.${rule.triggerType}`)}
            {' · '}
            <span className="font-bold text-success-fg">{t('automation.rules.then')}</span> {rule.actions.map((a) => t(`automation.actions.${a.type}`)).join(' → ')}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span>{t('automation.rules.runs', { count: rule.runCount })}</span>
            <span>{rule.lastRunAt ? t('automation.rules.lastRun', { time: fmtRelative(rule.lastRunAt) }) : t('automation.rules.never')}</span>
            {stats.length > 0 && (
              <span>
                {t('automation.rules.stats')}: {stats.map((s) => <span key={s} className={clsx('ml-1 rounded px-1.5 py-0.5 font-semibold', RUN_TONE[s])}>{rule.stats30d[s]} {t(`automation.runs.status.${s}`)}</span>)}
              </span>
            )}
          </p>
        </div>
        <Switch checked={rule.enabled} disabled={toggle.isPending || !rule.valid} onChange={(v) => toggle.mutate(v)} label={t('automation.rules.toggle')} />
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={onLog}><History className="size-3.5" /> {t('automation.rules.log')}</button>
        <button type="button" className="btn-secondary btn-sm" onClick={onEdit}><Pencil className="size-3.5" /> {t('automation.common.edit')}</button>
        <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={onDelete}><Trash2 className="size-3.5" /> {t('automation.common.delete')}</button>
      </div>
    </li>
  );
};

const RulesTab = ({ meta }: { meta: Meta | undefined }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ['automation-rules'], queryFn: async () => (await api.get<{ rules: Rule[] }>('/admin/automation/rules')).data.rules });
  const [editing, setEditing] = useState<{ id: string | null; draft: RuleDraft } | null>(null);
  const [log, setLog] = useState<Rule | null>(null);
  const [del, setDel] = useState<Rule | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/automation/rules/${id}`),
    onSuccess: () => {
      toast.success(t('automation.rules.deleted'));
      setDel(null);
      void qc.invalidateQueries({ queryKey: ['automation-rules'] });
    },
    onError: toastAutomationError,
  });
  const initial = useMemo(() => editing?.draft ?? blankRule(), [editing]);

  if (rules.isLoading) return <LoadingBlock />;
  if (rules.error) return <ErrorBlock error={rules.error} onRetry={() => void rules.refetch()} />;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{t('automation.rules.hint')}</p>
        <button type="button" className="btn-primary btn-sm" disabled={!meta} onClick={() => setEditing({ id: null, draft: blankRule() })}><Plus className="size-3.5" /> {t('automation.rules.new')}</button>
      </div>
      {!rules.data?.length ? (
        <EmptyState icon={Workflow} title={t('automation.rules.empty')} />
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {rules.data.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              onLog={() => setLog(r)}
              onDelete={() => setDel(r)}
              onEdit={() => setEditing({ id: r.id, draft: { name: r.name, description: r.description, enabled: r.enabled, trigger: r.trigger, conditions: r.conditions, actions: r.actions } })}
            />
          ))}
        </ul>
      )}
      {meta && <RuleEditor open={!!editing} ruleId={editing?.id ?? null} initial={initial} meta={meta} onClose={() => setEditing(null)} />}
      <RunLog rule={log} onClose={() => setLog(null)} />
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => del && remove.mutate(del.id)}
        title={del?.name ?? ''}
        message={t('automation.rules.confirmDelete')}
        confirmLabel={t('automation.common.delete')}
        loading={remove.isPending}
      />
    </>
  );
};

type Tab = 'rules' | 'assignment' | 'handovers';

/** Admin → Automation ("Avtomatlaşdırma"), ADMIN+: rules, automatic assignment, absence cover. */
export default function AdminAutomation() {
  const { t } = useTranslation();
  usePageTitle(t('automation.title'));
  const [params, setParams] = useSearchParams();
  const tab = (['rules', 'assignment', 'handovers'].includes(params.get('tab') ?? '') ? params.get('tab') : 'rules') as Tab;
  const meta = useQuery({ queryKey: ['automation-meta'], queryFn: async () => (await api.get<Meta>('/admin/automation/meta')).data, staleTime: 300_000 });
  return (
    <div>
      <PageHead title={t('automation.title')} subtitle={t('automation.subtitle')} />
      <Tabs
        className="mb-5"
        label={t('automation.title')}
        items={(['rules', 'assignment', 'handovers'] as Tab[]).map((k) => ({ key: k, label: t(`automation.tabs.${k}`) }))}
        value={tab}
        onChange={(k) => setParams(k === 'rules' ? {} : { tab: k }, { replace: true })}
      />
      {tab === 'rules' && <RulesTab meta={meta.data} />}
      {tab === 'assignment' && <AssignmentPanel meta={meta.data} />}
      {tab === 'handovers' && <HandoversPanel />}
    </div>
  );
}
