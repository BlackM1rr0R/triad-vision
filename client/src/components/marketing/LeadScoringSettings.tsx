import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/admin/ui';
import { api } from '@/lib/api';
import { EVENT_KEYS, SOURCE_KEYS, useLeadScoring, type LeadScoringSettings } from './api';

const Num = ({ label, value, onChange, min = -100, max = 100, step = 1, disabled }: { label: ReactNode; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; disabled?: boolean }) => (
  <label className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink">
    <span className="min-w-0">{label}</span>
    <input
      type="number"
      className="input w-20 shrink-0 py-1.5 text-right tabular-nums"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
    />
  </label>
);

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className="rounded-lg border border-line p-3">
    <legend className="px-1 text-xs font-bold tracking-wide text-muted uppercase">{title}</legend>
    <div className="divide-y divide-line">{children}</div>
  </fieldset>
);

/** Admin drawer with the lead score rules (Setting `leadScoring`). STAFF see the rules read-only. */
export const LeadScoringSettingsDrawer = ({ open, onClose, canEdit }: { open: boolean; onClose: () => void; canEdit: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useLeadScoring();
  const [s, setS] = useState<LeadScoringSettings | null>(null);
  useEffect(() => {
    if (open && data) setS(data.settings);
  }, [open, data]);

  const save = useMutation({
    mutationFn: (v: LeadScoringSettings) => api.put('/admin/marketing/lead-scoring', v),
    onSuccess: () => {
      toast.success(t('mk.common.saved'));
      void qc.invalidateQueries({ queryKey: ['admin', 'lead-scoring'] });
    },
    onError: () => toast.error(t('mk.common.error')),
  });
  const rescore = useMutation({
    mutationFn: async () => (await api.post<{ count: number }>('/admin/marketing/lead-scoring/rescore', { days: 90 })).data,
    onSuccess: (r) => {
      toast.success(t('mk.lead.settings.rescored', { count: r.count }));
      void qc.invalidateQueries({ queryKey: ['admin-inquiries'] });
    },
    onError: () => toast.error(t('mk.common.error')),
  });

  const up = (patch: Partial<LeadScoringSettings>) => s && setS({ ...s, ...patch });
  const invalid = !!s && s.thresholds.warm >= s.thresholds.hot;
  const ro = !canEdit;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t('mk.lead.settings.title')}
      description={t('mk.lead.settings.intro')}
      width="lg"
      footer={
        canEdit && s ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" icon={RefreshCw} loading={rescore.isPending} onClick={() => rescore.mutate()}>
              {t('mk.lead.settings.rescore')}
            </Button>
            <span className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => data && setS({ ...data.defaults, notifyUserIds: s.notifyUserIds })}>
                {t('mk.common.reset')}
              </Button>
              <Button size="sm" loading={save.isPending} disabled={invalid} onClick={() => save.mutate(s)}>
                {t('mk.common.save')}
              </Button>
            </span>
          </div>
        ) : undefined
      }
    >
      {!s || !data ? null : (
        <div className="space-y-4">
          {ro && <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">{t('mk.lead.settings.adminOnly')}</p>}
          <label className="flex items-center justify-between gap-3 text-sm font-semibold text-ink">
            {t('mk.lead.settings.enabled')}
            <Switch checked={s.enabled} label={t('mk.lead.settings.enabled')} disabled={ro} onChange={(v) => up({ enabled: v })} />
          </label>

          <Group title={t('mk.lead.settings.thresholds')}>
            <Num label={t('mk.lead.settings.warm')} value={s.thresholds.warm} min={1} max={100} disabled={ro} onChange={(v) => up({ thresholds: { ...s.thresholds, warm: v } })} />
            <Num label={t('mk.lead.settings.hot')} value={s.thresholds.hot} min={1} max={100} disabled={ro} onChange={(v) => up({ thresholds: { ...s.thresholds, hot: v } })} />
            {invalid && <p className="py-1.5 text-xs text-danger">{t('mk.lead.settings.invalid')}</p>}
          </Group>

          <div className="grid gap-4 sm:grid-cols-2">
            <Group title={t('mk.lead.settings.sources')}>
              {SOURCE_KEYS.map((k) => (
                <Num key={k} label={t(`mk.lead.reasons.source.${k}`)} value={s.sources[k]} disabled={ro} onChange={(v) => up({ sources: { ...s.sources, [k]: v } })} />
              ))}
            </Group>
            <div className="space-y-4">
              <Group title={t('mk.lead.settings.events')}>
                {EVENT_KEYS.map((k) => (
                  <Num key={k} label={t(`mk.lead.reasons.event.${k}`, { n: 1 }).replace(/\s*\(×1\)$/, '')} value={s.events[k]} disabled={ro} onChange={(v) => up({ events: { ...s.events, [k]: v } })} />
                ))}
                <Num label={t('mk.lead.settings.eventRepeat')} value={s.eventRepeat} min={1} max={10} disabled={ro} onChange={(v) => up({ eventRepeat: v })} />
                <Num label={t('mk.lead.settings.pageView')} value={s.pageView} disabled={ro} onChange={(v) => up({ pageView: v })} />
                <Num label={t('mk.lead.settings.pageViewCap')} value={s.pageViewCap} min={0} disabled={ro} onChange={(v) => up({ pageViewCap: v })} />
                <Num label={t('mk.lead.settings.visitorCap')} value={s.visitorCap} min={0} disabled={ro} onChange={(v) => up({ visitorCap: v })} />
              </Group>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Group title={t('mk.lead.settings.quiz')}>
              {(['high', 'medium', 'low'] as const).map((k) => (
                <Num key={k} label={t(`mk.lead.reasons.quiz.${k}`)} value={s.quiz[k]} disabled={ro} onChange={(v) => up({ quiz: { ...s.quiz, [k]: v } })} />
              ))}
            </Group>
            <Group title={t('mk.lead.settings.company')}>
              <Num label={t('mk.lead.settings.companyBase')} value={s.company.base} disabled={ro} onChange={(v) => up({ company: { ...s.company, base: v } })} />
              <Num label={t('mk.lead.settings.companyPerWorker')} value={s.company.perWorker} min={0} max={20} step={0.5} disabled={ro} onChange={(v) => up({ company: { ...s.company, perWorker: v } })} />
              <Num label={t('mk.lead.settings.companyCap')} value={s.company.cap} min={0} disabled={ro} onChange={(v) => up({ company: { ...s.company, cap: v } })} />
            </Group>
            <Group title={t('mk.lead.settings.recency')}>
              {(['d1', 'd7', 'd30', 'older'] as const).map((k) => (
                <Num key={k} label={t(`mk.lead.reasons.recency.${k}`)} value={s.recency[k]} disabled={ro} onChange={(v) => up({ recency: { ...s.recency, [k]: v } })} />
              ))}
            </Group>
            <Group title={t('mk.lead.settings.contact')}>
              {(['phone', 'email', 'message'] as const).map((k) => (
                <Num key={k} label={t(`mk.lead.reasons.contact.${k}`)} value={s.contact[k]} disabled={ro} onChange={(v) => up({ contact: { ...s.contact, [k]: v } })} />
              ))}
              <Num label={t('mk.lead.settings.estimate')} value={s.estimate} disabled={ro} onChange={(v) => up({ estimate: v })} />
            </Group>
          </div>

          <Group title={t('mk.lead.settings.notify')}>
            <label className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink">
              {t('mk.lead.settings.notify')}
              <Switch checked={s.notifyHot} label={t('mk.lead.settings.notify')} disabled={ro} onChange={(v) => up({ notifyHot: v })} />
            </label>
            <div className="py-2">
              <p className="mb-1.5 text-xs text-muted">{t('mk.lead.settings.notifyUsers')}</p>
              <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {data.staff.map((u) => {
                  const on = s.notifyUserIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      disabled={ro || (!on && s.notifyUserIds.length >= 20)}
                      aria-pressed={on}
                      className={on ? 'rounded-full border border-brand-600 bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white' : 'rounded-full border border-line bg-card px-2.5 py-1 text-xs text-ink hover:border-brand-500'}
                      onClick={() => up({ notifyUserIds: on ? s.notifyUserIds.filter((x) => x !== u.id) : [...s.notifyUserIds, u.id] })}
                    >
                      {u.firstName} {u.lastName}
                    </button>
                  );
                })}
              </div>
            </div>
          </Group>
        </div>
      )}
    </Drawer>
  );
};
