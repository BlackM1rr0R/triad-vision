import type { MouseEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Info, PauseCircle, PlayCircle, X } from 'lucide-react';
import i18n, { registerCopy } from '@/i18n';
import { pagesVacancyActive } from '@/i18n/pagesVacancyActive';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmDialog } from '@/components/ui/confirmStore';
import { activeStateOf, type Toggleable } from './state';

registerCopy(pagesVacancyActive);

/**
 * Admin › Vacancies: per-vacancy "Aktiv / Deaktiv" (server routes/admin/vacancyActive.ts, lib/vacancyActive.ts).
 * POST /admin/vacancies/:id/active and POST /admin/vacancies/active (bulk); area "employers", action edit.
 * Only published vacancies (OPEN / CLOSED) can be switched; drafts and submissions go through approve / reject.
 */

const errorText = (err: unknown) => {
  const code = errorCode(err) ?? '';
  const key = `vacActive.admin.errors.${code}`;
  return i18n.exists(key) ? String(i18n.t(key)) : String(i18n.t('jobsArea.errors.generic'));
};

/** Same cache as the drive's permission checks (GET /admin/me/permissions); unknown = allowed (the server decides). */
export const useCanEditEmployers = () => {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['admin-perms', user?.id ?? 'anon'],
    queryFn: async () => (await api.get<{ matrix: Record<string, string[]>; superAdmin: boolean }>('/admin/me/permissions')).data,
    enabled: !!user,
    staleTime: 60_000,
    retry: 1,
  });
  return !q.data || q.data.superAdmin || (q.data.matrix.employers ?? []).includes('edit');
};

const useRefresh = () => {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ['admin-vacancies'] }); // list + status counts (Aktiv / Bağlı chips)
    if (id) void qc.invalidateQueries({ queryKey: ['admin-vacancy', id] });
    void qc.invalidateQueries({ queryKey: ['jobs'] });
  };
};

/** One-click switch "Aktiv / Deaktiv"; deactivating asks first. Nothing for drafts / pending ones. */
export const ActiveToggle = ({ v, className }: { v: Toggleable; className?: string }) => {
  const { t } = useTranslation();
  const can = useCanEditEmployers();
  const refresh = useRefresh();
  const state = activeStateOf(v);
  const m = useMutation({
    mutationFn: (active: boolean) => api.post(`/admin/vacancies/${v.id}/active`, { active }),
    onSuccess: (_r, active) => {
      toast.success(t(active ? 'vacActive.admin.activated' : 'vacActive.admin.deactivated'));
      refresh(v.id);
    },
    onError: (err) => toast.error(errorText(err)),
  });
  if (!state) return null;
  const on = state === 'active';
  const click = async (e: MouseEvent) => {
    e.stopPropagation();
    if (on && !(await confirmDialog({ title: t('vacActive.admin.confirmTitle'), message: t('vacActive.admin.confirmText'), confirmLabel: t('vacActive.admin.deactivate') }))) return;
    m.mutate(!on);
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={!can || m.isPending}
      title={t('vacActive.admin.toggleHint')}
      onClick={click}
      className={clsx(
        'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        on ? 'border-success-border bg-success-bg text-success-fg hover:brightness-95' : 'border-line bg-sunken text-muted hover:text-ink',
        className,
      )}
    >
      <span className={clsx('relative inline-block h-4 w-7 rounded-full transition-colors', on ? 'bg-success-fg/70' : 'bg-line-strong')} aria-hidden>
        <span className={clsx('absolute top-0.5 size-3 rounded-full bg-card shadow transition-[left]', on ? 'left-3.5' : 'left-0.5')} />
      </span>
      {t(on ? 'vacActive.admin.active' : 'vacActive.admin.inactive')}
    </button>
  );
};

type BulkResult = { results: { id: string; ok: boolean; error?: string }[]; changed: number };

/** Bar over the list while rows are selected: activate / deactivate them all, then a summary. */
export const BulkActiveBar = ({ ids, onClear, onSelectAll }: { ids: string[]; onClear: () => void; onSelectAll?: () => void }) => {
  const { t } = useTranslation();
  const can = useCanEditEmployers();
  const refresh = useRefresh();
  const m = useMutation({
    mutationFn: async (active: boolean) => (await api.post<BulkResult>('/admin/vacancies/active', { ids, active })).data,
    onSuccess: (r) => {
      toast.success(t('vacActive.admin.bulkDone', { changed: r.changed, total: r.results.length }));
      const skipped = [...new Set(r.results.filter((x) => !x.ok).map((x) => (x.error && i18n.exists(`vacActive.admin.errors.${x.error}`) ? String(i18n.t(`vacActive.admin.errors.${x.error}`)) : x.error)))];
      if (skipped.length) toast.message(t('vacActive.admin.bulkSkipped', { list: skipped.join(', ') }));
      refresh();
      onClear();
    },
    onError: (err) => toast.error(errorText(err)),
  });
  if (!ids.length) return null;
  const run = async (active: boolean) => {
    if (!active && !(await confirmDialog({ title: t('vacActive.admin.confirmBulkTitle', { count: ids.length }), message: t('vacActive.admin.confirmText'), confirmLabel: t('vacActive.admin.deactivate') }))) return;
    m.mutate(active);
  };
  return (
    <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 shadow-[var(--tv-shadow-card)]" role="region" aria-label={t('vacActive.admin.selected', { count: ids.length })}>
      <span className="text-sm font-semibold text-ink">{t('vacActive.admin.selected', { count: ids.length })}</span>
      {onSelectAll && (
        <button type="button" className="btn-ghost btn-sm" onClick={onSelectAll}>
          {t('vacActive.admin.selectAll')}
        </button>
      )}
      <span className="flex-1" />
      <button type="button" className="btn-secondary btn-sm" disabled={!can || m.isPending} onClick={() => void run(true)}>
        <PlayCircle className="size-3.5" aria-hidden /> {t('vacActive.admin.activate')}
      </button>
      <button type="button" className="btn-secondary btn-sm" disabled={!can || m.isPending} onClick={() => void run(false)}>
        <PauseCircle className="size-3.5" aria-hidden /> {t('vacActive.admin.deactivate')}
      </button>
      <button type="button" className="btn-ghost btn-sm" onClick={onClear} aria-label={t('vacActive.admin.clear')}>
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
};

/** Row checkbox (outside the row click). */
export const SelectBox = ({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) => (
  <input
    type="checkbox"
    className="size-4 shrink-0 accent-primary"
    checked={checked}
    aria-label={label}
    onClick={(e) => e.stopPropagation()}
    onChange={(e) => onChange(e.target.checked)}
  />
);

/** Under the two global "Müraciət qaydaları" switches: they are policies; per-vacancy activation is in the list. */
export const PolicyNote = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  return (
    <p className={clsx('flex items-start gap-2 text-xs leading-relaxed text-muted', className)}>
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('vacActive.admin.policyNote')}
    </p>
  );
};
