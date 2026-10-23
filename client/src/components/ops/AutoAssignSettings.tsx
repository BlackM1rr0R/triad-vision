import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Save, Scale, UserCog } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesOps } from '@/i18n/pagesOps';
import { Spinner } from '@/components/ui/Spinner';
import { Panel } from '@/components/admin/ui';
import { fullName } from '@/components/admin/labels';
import { toastOpsError } from './shared';

registerCopy(pagesOps);

type Mode = 'off' | 'roundRobin' | 'leastLoaded';
// Other fields (eligibility filters, weights, handover — edited in Admin → Automation) are kept as they are.
export interface AutoAssignValue { mode: Mode; staffIds?: string[]; [extra: string]: unknown }
interface Staff { id: string; firstName: string; lastName: string; role: string }
interface Workload { staff: (Staff & { open: number; waitingForStaff: number })[]; unassigned: number }

const MODES: Mode[] = ['off', 'roundRobin', 'leastLoaded'];

export const normalizeAutoAssign = (v: unknown): AutoAssignValue => {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Partial<AutoAssignValue>;
  return { ...o, mode: MODES.includes(o.mode as Mode) ? (o.mode as Mode) : 'off', staffIds: Array.isArray(o.staffIds) ? o.staffIds.filter((s): s is string => typeof s === 'string') : [] };
};

/** Admin → Settings: "Avtomatik təyinat" (mode + staff pool) and the "Balans" workload preview. */
export const AutoAssignSettings = ({ initial }: { initial: AutoAssignValue }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [pool, setPool] = useState<string[]>(initial.staffIds ?? []);
  useEffect(() => {
    setMode(initial.mode);
    setPool(initial.staffIds ?? []);
  }, [initial]);
  const { data: staff } = useQuery({ queryKey: ['staff-list'], queryFn: async () => (await api.get<{ staff: Staff[] }>('/admin/users/staff')).data.staff, staleTime: 300_000 });
  const workload = useQuery({ queryKey: ['ops-workload'], queryFn: async () => (await api.get<Workload>('/admin/ops/workload')).data, refetchInterval: 60_000 });
  const save = useMutation({
    mutationFn: () => api.put('/admin/settings/autoAssign', { value: { ...initial, mode, staffIds: pool } }),
    onSuccess: () => {
      toast.success(t('ops.settings.autoAssign.saved'));
      void qc.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: toastOpsError,
  });
  const toggle = (id: string) => setPool((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const max = Math.max(1, ...(workload.data?.staff.map((s) => s.open) ?? [1]));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Panel
          title={t('ops.settings.autoAssign.title')}
          icon={UserCog}
          actions={
            <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
              {save.isPending ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />} {t('ops.common.save')}
            </button>
          }
        >
          <p className="mb-4 text-xs text-muted">{t('ops.settings.autoAssign.hint')}</p>
          <fieldset className="space-y-2">
            <legend className="label">{t('ops.settings.autoAssign.mode')}</legend>
            {MODES.map((m) => (
              <label key={m} className={clsx('flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition', mode === m ? 'border-brand-500 bg-brand-50/60' : 'border-line hover:border-brand-300')}>
                <input type="radio" name="aa-mode" className="mt-0.5 size-4" checked={mode === m} onChange={() => setMode(m)} />
                <span>
                  <span className="block font-semibold text-navy-900">{t(`ops.settings.autoAssign.modes.${m}`)}</span>
                  <span className="block text-xs text-muted">{t(`ops.settings.autoAssign.modeHints.${m}`)}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className={clsx('mt-5', mode === 'off' && 'opacity-50')} disabled={mode === 'off'}>
            <legend className="label">{t('ops.settings.autoAssign.pool')}</legend>
            <p className="mb-2 text-xs text-muted">{t('ops.settings.autoAssign.poolHint')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setPool([])} className={clsx('rounded-full border px-3 py-1.5 text-xs font-semibold', pool.length === 0 ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-ink/75')}>
                {t('ops.settings.autoAssign.everyone')}
              </button>
              {staff?.map((s) => (
                <button key={s.id} type="button" onClick={() => toggle(s.id)} aria-pressed={pool.includes(s.id)} className={clsx('rounded-full border px-3 py-1.5 text-xs font-semibold', pool.includes(s.id) ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink/75 hover:border-brand-400')}>
                  {fullName(s)}
                </button>
              ))}
            </div>
          </fieldset>
        </Panel>
      </form>

      <Panel title={t('ops.settings.workload.title')} icon={Scale}>
        <p className="mb-3 text-xs text-muted">{t('ops.settings.workload.hint')}</p>
        {workload.isLoading ? (
          <Spinner className="size-5 text-brand-600" />
        ) : !workload.data?.staff.length ? (
          <p className="text-sm text-muted">{t('ops.settings.workload.empty')}</p>
        ) : (
          <ul className="space-y-2.5">
            {workload.data.staff.map((s) => (
              <li key={s.id} className="text-xs">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className={clsx('truncate font-medium text-navy-900', pool.length && !pool.includes(s.id) && 'text-muted')}>{fullName(s)}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">{s.open}</span> <span className="text-muted">{t('ops.settings.workload.open')}</span>
                    {s.waitingForStaff > 0 && <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">{s.waitingForStaff} {t('ops.settings.workload.waiting')}</span>}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round((s.open / max) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {workload.data && <p className={clsx('mt-3 text-xs', workload.data.unassigned ? 'font-semibold text-amber-800' : 'text-muted')}>{t('ops.settings.workload.unassigned', { count: workload.data.unassigned })}</p>}
      </Panel>
    </div>
  );
};
