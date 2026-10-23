import { useEffect, useState } from 'react';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Pencil, RefreshCw, Save, UserCog, Users } from 'lucide-react';
import { api } from '@/lib/api';
import type { CaseStatus } from '@/lib/types';
import { currentLocale } from '@/i18n';
import { Modal } from '@/components/admin/Modal';
import { EmptyState, LoadingBlock, Panel, Switch } from '@/components/admin/ui';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate, fullName, statusLabel } from '@/components/admin/labels';
import { LoadCard, useAssignmentOverview } from './LoadCard';
import { MultiChips } from './MultiChips';
import { LANGS, OPEN_STATUSES, VISA_TYPES, toastAutomationError, type AssignmentConfig, type Handover, type Lang, type Meta, type Mode, type StaffLoadRow, type StaffPrefs, type VisaType } from './types';

const MODES: Mode[] = ['off', 'roundRobin', 'leastLoaded'];
const DAYS = [1, 2, 3, 4, 5, 6, 7];

const Check = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <label className="flex items-start gap-2.5 text-sm">
    <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>
      <span className="text-navy-900">{label}</span>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </span>
  </label>
);

const ConfigForm = ({ initial, staff }: { initial: AssignmentConfig; staff: StaffLoadRow[] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [cfg, setCfg] = useState(initial);
  useEffect(() => setCfg(initial), [initial]);
  const set = <K extends keyof AssignmentConfig>(k: K, v: AssignmentConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const pool = cfg.staffIds ?? [];
  const save = useMutation({
    mutationFn: () => api.put('/admin/assignment/config', cfg),
    onSuccess: () => {
      toast.success(t('automation.assignment.saved'));
      void qc.invalidateQueries({ queryKey: ['assignment-overview'] });
      void qc.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: toastAutomationError,
  });
  return (
    <Panel
      title={t('automation.assignment.configTitle')}
      icon={UserCog}
      actions={<button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />} {t('automation.common.save')}</button>}
    >
      <p className="mb-4 text-xs text-muted">{t('automation.assignment.configHint')}</p>
      <fieldset className="space-y-2">
        {MODES.map((m) => (
          <label key={m} className={clsx('flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition', cfg.mode === m ? 'border-brand-500 bg-brand-50/60' : 'border-line hover:border-brand-300')}>
            <input type="radio" name="assign-mode" className="mt-0.5 size-4" checked={cfg.mode === m} onChange={() => set('mode', m)} />
            <span>
              <span className="block font-semibold text-navy-900">{t(`automation.assignment.modes.${m}`)}</span>
              <span className="block text-xs text-muted">{t(`automation.assignment.modeHints.${m}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="mt-5">
        <span className="label">{t('automation.assignment.pool')}</span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => set('staffIds', [])} aria-pressed={!pool.length} className={clsx('rounded-full border px-3 py-1.5 text-xs font-semibold', !pool.length ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-ink/75')}>{t('automation.assignment.everyone')}</button>
          {staff.map((s) => (
            <button key={s.id} type="button" aria-pressed={pool.includes(s.id)} onClick={() => set('staffIds', pool.includes(s.id) ? pool.filter((x) => x !== s.id) : [...pool, s.id])} className={clsx('rounded-full border px-3 py-1.5 text-xs font-semibold', pool.includes(s.id) ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink/75 hover:border-brand-400')}>
              {fullName(s)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-2.5">
        <span className="label">{t('automation.assignment.filters')}</span>
        <Check checked={cfg.matchLanguage} onChange={(v) => set('matchLanguage', v)} label={t('automation.assignment.matchLanguage')} />
        <Check checked={cfg.matchVisaType} onChange={(v) => set('matchVisaType', v)} label={t('automation.assignment.matchVisaType')} />
        <Check checked={cfg.respectMaxOpen} onChange={(v) => set('respectMaxOpen', v)} label={t('automation.assignment.respectMaxOpen')} />
        <Check checked={cfg.respectWorkingDays} onChange={(v) => set('respectWorkingDays', v)} label={t('automation.assignment.respectWorkingDays')} />
        <Check checked={cfg.inquiries} onChange={(v) => set('inquiries', v)} label={t('automation.assignment.inquiries')} />
        <Check checked={cfg.handover} onChange={(v) => set('handover', v)} label={t('automation.assignment.handover')} hint={t('automation.assignment.handoverHint')} />
      </div>

      <div className="mt-5">
        <span className="label">{t('automation.assignment.weights')}</span>
        <p className="mb-2 text-xs text-muted">{t('automation.assignment.weightsHint')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {OPEN_STATUSES.map((s) => (
            <label key={s} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5 text-xs">
              <span className="min-w-0 truncate">{statusLabel(s as CaseStatus)}</span>
              <input type="number" step={0.5} min={0} max={10} className="input w-20 py-1 text-right" value={cfg.weights[s] ?? 1} onChange={(e) => set('weights', { ...cfg.weights, [s]: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} />
            </label>
          ))}
        </div>
      </div>
    </Panel>
  );
};

const PrefsModal = ({ row, meta, onClose }: { row: StaffLoadRow | null; meta: Meta | undefined; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lang = currentLocale();
  const [p, setP] = useState<StaffPrefs | null>(row?.prefs ?? null);
  useEffect(() => setP(row?.prefs ?? null), [row]);
  const save = useMutation({
    mutationFn: () => api.put(`/admin/assignment/staff/${row!.id}/prefs`, p),
    onSuccess: () => {
      toast.success(t('automation.staff.saved'));
      void qc.invalidateQueries({ queryKey: ['assignment-overview'] });
      onClose();
    },
    onError: toastAutomationError,
  });
  return (
    <Modal
      open={!!row}
      onClose={onClose}
      size="lg"
      title={row ? t('automation.staff.editTitle', { name: fullName(row) }) : ''}
      description={t('automation.staff.hint')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>{t('automation.common.cancel')}</button>
          <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />} {t('automation.common.save')}</button>
        </>
      }
    >
      {p && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-navy-900">{t('automation.staff.autoAssign')}</span>
            <Switch checked={p.autoAssign} onChange={(v) => setP({ ...p, autoAssign: v })} label={t('automation.staff.autoAssign')} />
          </div>
          <div><span className="label">{t('automation.staff.languages')}</span><MultiChips options={LANGS} value={p.languages} onChange={(languages) => setP({ ...p, languages: languages as Lang[] })} label={(l) => t(`automation.locales.${l}`)} /></div>
          <div><span className="label">{t('automation.staff.visaTypes')}</span><MultiChips options={VISA_TYPES} value={p.visaTypes} onChange={(visaTypes) => setP({ ...p, visaTypes: visaTypes as VisaType[] })} label={(v) => t(`automation.visaTypes.${v}`)} /></div>
          {meta && meta.visaCategories.length > 0 && (
            <div>
              <span className="label">{t('automation.staff.categories')}</span>
              <MultiChips options={meta.visaCategories.map((c) => c.id)} value={p.visaCategoryIds} onChange={(visaCategoryIds) => setP({ ...p, visaCategoryIds })} label={(id) => { const c = meta.visaCategories.find((x) => x.id === id); return c ? `${c.visaLabel} ${c.title[lang] || c.title.de || ''}`.trim() : id; }} />
            </div>
          )}
          <label className="block">
            <span className="label">{t('automation.staff.maxOpen')}</span>
            <input type="number" min={1} max={1000} className="input w-40" placeholder={t('automation.staff.unlimited')} value={p.maxOpenCases ?? ''} onChange={(e) => setP({ ...p, maxOpenCases: e.target.value === '' ? null : Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })} />
          </label>
          <div>
            <span className="label">{t('automation.staff.workingDays')}</span>
            <MultiChips options={DAYS.map(String)} value={p.workingDays.map(String)} onChange={(d) => setP({ ...p, workingDays: d.map(Number).sort() })} label={(d) => t(`automation.staff.weekdays.${d}`)} anyLabel={t('automation.staff.everyDay')} />
          </div>
        </div>
      )}
    </Modal>
  );
};

const StaffTable = ({ staff, meta }: { staff: StaffLoadRow[]; meta: Meta | undefined }) => {
  const { t } = useTranslation();
  const [edit, setEdit] = useState<StaffLoadRow | null>(null);
  const summary = (xs: string[], key: string) => (xs.length ? xs.map((x) => t(`automation.${key}.${x}`)).join(', ') : t('automation.common.any'));
  return (
    <Panel title={t('automation.staff.title')} icon={Users}>
      <p className="mb-3 text-xs text-muted">{t('automation.staff.hint')}</p>
      {!staff.length ? (
        <EmptyState icon={Users} title={t('automation.common.none')} />
      ) : (
        <ul className="divide-y divide-line">
          {staff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
              <span className="min-w-40 flex-1 font-semibold text-navy-900">{fullName(s)} {!s.prefs.autoAssign && <span className="text-xs font-normal text-muted">({t('automation.load.off')})</span>}</span>
              <span className="text-xs text-muted">{t('automation.staff.languages')}: {summary(s.prefs.languages, 'locales')}</span>
              <span className="text-xs text-muted">{t('automation.staff.visaTypes')}: {summary(s.prefs.visaTypes, 'visaTypes')}</span>
              <span className="text-xs text-muted">{t('automation.staff.maxOpen')}: {s.prefs.maxOpenCases ?? t('automation.staff.unlimited')}</span>
              <span className="text-xs text-muted">{t('automation.staff.workingDays')}: {s.prefs.workingDays.length ? s.prefs.workingDays.map((d) => t(`automation.staff.weekdays.${d}`)).join(' ') : t('automation.staff.everyDay')}</span>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setEdit(s)}><Pencil className="size-3.5" /> {t('automation.common.edit')}</button>
            </li>
          ))}
        </ul>
      )}
      <PrefsModal row={edit} meta={meta} onClose={() => setEdit(null)} />
    </Panel>
  );
};

export const HandoversPanel = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['assignment-handovers'], queryFn: async () => (await api.get<{ handovers: Handover[] }>('/admin/assignment/handovers')).data.handovers });
  const run = useMutation({
    mutationFn: async () => (await api.post<{ started: number; returned: number; kept: number }>('/admin/assignment/handovers/run')).data,
    onSuccess: (r) => {
      toast.success(t('automation.handovers.ran', r));
      void qc.invalidateQueries({ queryKey: ['assignment-handovers'] });
      void qc.invalidateQueries({ queryKey: ['assignment-overview'] });
    },
    onError: toastAutomationError,
  });
  const tone = toneClasses(STATUS_TONES.assignment);
  return (
    <Panel
      title={t('automation.handovers.title')}
      icon={RefreshCw}
      actions={<button type="button" className="btn-secondary btn-sm" disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />} {t('automation.handovers.runNow')}</button>}
    >
      {isLoading ? (
        <LoadingBlock className="min-h-32" />
      ) : !data?.length ? (
        <EmptyState icon={RefreshCw} title={t('automation.handovers.empty')} />
      ) : (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-2 font-medium sm:px-6">#</th>
                <th className="px-3 py-2 font-medium">{t('automation.handovers.original')}</th>
                <th className="px-3 py-2 font-medium">{t('automation.handovers.substitute')}</th>
                <th className="px-3 py-2 font-medium">{t('automation.handovers.since')}</th>
                <th className="px-3 py-2 font-medium">{t('automation.handovers.until')}</th>
                <th className="px-5 py-2 font-medium sm:px-6">{t('automation.handovers.statusCol')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((h) => (
                <tr key={h.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2 sm:px-6"><Link to={`/admin/cases/${h.caseId}`} className="font-semibold text-brand-700 hover:underline">{h.caseNumber ?? '—'}</Link></td>
                  <td className="px-3 py-2">{h.originalName ?? '—'}</td>
                  <td className="px-3 py-2">{h.substituteName ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtDate(h.startedAt)}</td>
                  <td className="px-3 py-2 tabular-nums">{h.endedAt ? `${t('automation.handovers.ended')}: ${fmtDate(h.endedAt)}` : fmtDate(h.plannedEndAt)}</td>
                  <td className="px-5 py-2 sm:px-6"><span className={clsx('badge', tone[h.status])}>{t(`automation.handovers.status.${h.status}`)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};

/** Admin → Automation → Assignment: strategy, load + rebalance, staff areas. */
export const AssignmentPanel = ({ meta }: { meta: Meta | undefined }) => {
  const { data, isLoading } = useAssignmentOverview();
  if (isLoading || !data) return <LoadingBlock />;
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <ConfigForm initial={data.config} staff={data.staff} />
        <LoadCard />
      </div>
      <StaffTable staff={data.staff} meta={meta} />
    </div>
  );
};
