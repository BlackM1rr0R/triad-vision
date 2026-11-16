import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Pencil, Plus, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesEmployerChecklistAdmin } from '@/i18n/pagesEmployerChecklistAdmin';
import { pagesEmployerExtras } from '@/i18n/pagesEmployerExtras';
import { PageHeader } from '@/components/ui/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Switch } from '@/components/ui/Switch';
import { ErrorState } from '@/components/ui/ErrorState';
import { toastJobsError } from '@/components/jobs/labels';

registerCopy(pagesEmployerChecklistAdmin);
registerCopy(pagesEmployerExtras);

type Anchor = 'ARRIVAL' | 'FIRST_DAY';
interface Template {
  key: string;
  builtIn: boolean;
  labels: { de: string | null; en: string | null; az: string | null; ru: string | null } | null;
  anchor: Anchor;
  offsetDays: number | null;
  visibleToWorker: boolean;
  active: boolean;
  sortOrder: number;
}
interface Draft {
  key: string;
  labelDe: string;
  labelEn: string;
  labelAz: string;
  labelRu: string;
  anchor: Anchor;
  offsetDays: string;
  visibleToWorker: boolean;
  active: boolean;
  sortOrder: string;
}

const QK = ['admin-employer-checklist-templates'];
const LOCALES = ['de', 'en', 'az', 'ru'] as const;

const TemplateForm = ({ initial, isNew, onDone }: { initial: Draft; isNew: boolean; onDone: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [d, setD] = useState(initial);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const save = useMutation({
    mutationFn: () =>
      api.put(`/admin/employer-checklist/templates/${encodeURIComponent(d.key.trim().toUpperCase())}`, {
        labelDe: d.labelDe.trim(),
        labelEn: d.labelEn.trim() || null,
        labelAz: d.labelAz.trim() || null,
        labelRu: d.labelRu.trim() || null,
        anchor: d.anchor,
        offsetDays: d.offsetDays.trim() === '' ? null : Number(d.offsetDays),
        visibleToWorker: d.visibleToWorker,
        active: d.active,
        sortOrder: Number(d.sortOrder) || 0,
      }),
    onSuccess: () => {
      toast.success(t('ectpl.saved'));
      void qc.invalidateQueries({ queryKey: QK });
      onDone();
    },
    onError: toastJobsError,
  });
  const locked = d.key === 'FIRST_DAY'; // always the first work day itself
  return (
    <form
      className="mt-3 grid gap-3 rounded-2xl border border-line bg-sunken/40 p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (d.labelDe.trim() && d.key.trim()) save.mutate();
      }}
    >
      {isNew && (
        <label className="text-sm sm:col-span-2">
          <span className="label">{t('ectpl.key')}</span>
          <input className="input font-mono uppercase" required maxLength={30} pattern="[A-Za-z][A-Za-z0-9_]{2,29}" value={d.key} onChange={(e) => set({ key: e.target.value })} />
          <span className="mt-1 block text-[11px] text-muted">{t('ectpl.keyHint')}</span>
        </label>
      )}
      {LOCALES.map((l) => {
        const k = `label${l[0].toUpperCase()}${l[1]}` as 'labelDe' | 'labelEn' | 'labelAz' | 'labelRu';
        return (
          <label key={l} className="text-sm">
            <span className="label">{t(`ectpl.${k}`)}</span>
            <input className="input" required={l === 'de'} maxLength={200} value={d[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<Draft>)} />
          </label>
        );
      })}
      <label className="text-sm">
        <span className="label">{t('ectpl.anchor')}</span>
        <select className="input" value={d.anchor} disabled={locked} onChange={(e) => set({ anchor: e.target.value as Anchor })}>
          {(['ARRIVAL', 'FIRST_DAY'] as const).map((a) => (
            <option key={a} value={a}>
              {t(`ectpl.anchors.${a}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="label">{t('ectpl.offset')}</span>
        <input className="input tabular-nums" inputMode="numeric" disabled={locked} value={d.offsetDays} onChange={(e) => set({ offsetDays: e.target.value.replace(/[^\d-]/g, '') })} placeholder="—" />
      </label>
      <label className="text-sm">
        <span className="label">{t('ectpl.sort')}</span>
        <input className="input tabular-nums" inputMode="numeric" value={d.sortOrder} onChange={(e) => set({ sortOrder: e.target.value.replace(/\D/g, '') })} />
      </label>
      <div className="flex flex-col justify-end gap-2">
        <Switch size="sm" showLabel checked={d.visibleToWorker} onChange={(v) => set({ visibleToWorker: v })} label={t('ectpl.visible')} />
        <Switch size="sm" showLabel checked={d.active} onChange={(v) => set({ active: v })} label={t('ectpl.active')} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
          {save.isPending && <Spinner className="size-3.5" />} {t('ectpl.save')}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>
          {t('ectpl.cancel')}
        </button>
      </div>
    </form>
  );
};

/**
 * /admin/employer-checklist-templates — templates of the employer arrival checklist (lib/employerArrivalTemplates):
 * built-ins (overridable, resettable) and items added by admins. STAFF read, ADMIN+ edit.
 */
export default function AdminEmployerChecklistTemplates() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('ectpl.title'));
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2) as (typeof LOCALES)[number];
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const q = useQuery({ queryKey: QK, queryFn: async () => (await api.get<{ templates: Template[] }>('/admin/employer-checklist/templates')).data.templates });
  const reset = useMutation({
    mutationFn: (key: string) => api.delete(`/admin/employer-checklist/templates/${key}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QK }),
    onError: toastJobsError,
  });
  const labelOf = (tp: Template) => tp.labels?.[lng] ?? tp.labels?.de ?? t(`employerChecklist.item.${tp.key}`, { defaultValue: tp.key });
  const draftOf = (tp: Template | null): Draft => ({
    key: tp?.key ?? '',
    labelDe: tp?.labels?.de ?? (tp ? i18n.t(`employerChecklist.item.${tp.key}`, { lng: 'de', defaultValue: '' }) : ''),
    labelEn: tp?.labels?.en ?? (tp ? i18n.t(`employerChecklist.item.${tp.key}`, { lng: 'en', defaultValue: '' }) : ''),
    labelAz: tp?.labels?.az ?? (tp ? i18n.t(`employerChecklist.item.${tp.key}`, { lng: 'az', defaultValue: '' }) : ''),
    labelRu: tp?.labels?.ru ?? (tp ? i18n.t(`employerChecklist.item.${tp.key}`, { lng: 'ru', defaultValue: '' }) : ''),
    anchor: tp?.anchor ?? 'ARRIVAL',
    offsetDays: tp?.offsetDays == null ? '' : String(tp.offsetDays),
    visibleToWorker: tp?.visibleToWorker ?? true,
    active: tp?.active ?? true,
    sortOrder: String(tp?.sortOrder ?? 100),
  });

  return (
    <div>
      <PageHeader
        title={t('ectpl.title')}
        subtitle={t('ectpl.subtitle')}
        actions={
          canEdit && (
            <button type="button" className="btn-primary btn-sm" onClick={() => setEditing('__new')}>
              <Plus className="size-4" aria-hidden /> {t('ectpl.add')}
            </button>
          )
        }
      />
      {!canEdit && <p className="mb-4 text-sm text-muted">{t('ectpl.readOnly')}</p>}
      {editing === '__new' && (
        <div className="card mb-4 p-4">
          <TemplateForm initial={draftOf(null)} isNew onDone={() => setEditing(null)} />
        </div>
      )}
      {q.isLoading ? (
        <Spinner />
      ) : q.isError || !q.data ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : (
        <ul className="space-y-2">
          {q.data.map((tp) => (
            <li key={tp.key} className={clsx('card p-4', !tp.active && 'opacity-70')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{labelOf(tp)}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                    <span className="font-mono">{tp.key}</span>
                    <span>· {tp.builtIn ? t('ectpl.builtIn') : t('ectpl.custom')}</span>
                    {!tp.active && <span className="font-semibold text-warning-fg">· {t('ectpl.inactive')}</span>}
                    <span>· {tp.offsetDays == null ? t('ectpl.noDate') : t('ectpl.rule', { days: tp.offsetDays > 0 ? `+${tp.offsetDays}` : tp.offsetDays, anchor: t(`ectpl.anchors.${tp.anchor}`) })}</span>
                    {tp.visibleToWorker && <span>· {t('ectpl.visible')}</span>}
                    {tp.builtIn && !tp.labels && <span>· {t('ectpl.defaultLabel')}</span>}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(editing === tp.key ? null : tp.key)}>
                      <Pencil className="size-3.5" aria-hidden /> {t('ectpl.edit')}
                    </button>
                    {tp.builtIn && tp.labels && (
                      <button type="button" className="btn-ghost btn-sm" disabled={reset.isPending} onClick={() => reset.mutate(tp.key)}>
                        <RotateCcw className="size-3.5" aria-hidden /> {t('ectpl.reset')}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {editing === tp.key && <TemplateForm initial={draftOf(tp)} isNew={false} onDone={() => setEditing(null)} />}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted">{t('ectpl.note')}</p>
    </div>
  );
}
