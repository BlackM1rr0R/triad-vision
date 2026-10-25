import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Globe, Save } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPublicAi } from '@/i18n/pagesPublicAi';
import { Panel, Switch } from '@/components/admin/ui';

registerCopy(pagesPublicAi);

interface DayUsage {
  usd: number;
  messages: number;
  quiz: number;
  leads: number;
}

const usd = (n: number | undefined) => (n === undefined ? '—' : `$${n.toFixed(n !== 0 && n < 0.01 ? 4 : 2)}`);

/**
 * Super-admin panel on /admin/ai/settings: on/off switch and daily dollar cap of the public (anonymous)
 * advisor, with today's and this month's aggregated usage. Saves only its own two settings fields.
 */
export const AdminPublicAdvisor = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const usage = useQuery({
    queryKey: ['public-ai', 'usage'],
    queryFn: async () => (await api.get<{ today: DayUsage; month: DayUsage; dailyCapUsd: number; enabled: boolean }>('/public-ai/usage')).data,
  });
  const [enabled, setEnabled] = useState(true);
  const [cap, setCap] = useState(0.5);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!usage.data) return;
    setEnabled(usage.data.enabled);
    setCap(usage.data.dailyCapUsd);
  }, [usage.data]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/ai/settings', { publicAdvisorEnabled: enabled, publicDailyUsd: cap });
      void qc.invalidateQueries({ queryKey: ['public-ai'] });
      void qc.invalidateQueries({ queryKey: ['ai', 'settings'] });
      toast.success(t('pai.admin.saved'));
    } catch (err) {
      toast.error(errorCode(err));
    } finally {
      setSaving(false);
    }
  };

  const d = usage.data;
  return (
    <Panel title={t('pai.admin.title')} icon={Globe} className="bg-card">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-sunken p-3">
          <div>
            <p className="text-sm font-semibold text-ink">{t('pai.admin.enabled')}</p>
            <p className="mt-0.5 text-xs text-muted">{t('pai.admin.enabledHint')}</p>
          </div>
          <Switch checked={enabled} onChange={setEnabled} label={t('pai.admin.enabled')} />
        </div>
        <label className="block">
          <span className="text-xs font-semibold text-ink">{t('pai.admin.dailyCap')}</span>
          <input type="number" className="input mt-1" min={0} max={100} step={0.05} value={Number.isFinite(cap) ? cap : ''} onChange={(e) => setCap(e.target.value === '' ? NaN : Number(e.target.value))} />
          <span className="mt-1 block text-[11px] text-muted">{t('pai.admin.dailyCapHint')}</span>
        </label>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {(['today', 'month'] as const).map((k) => (
            <div key={k} className="rounded-lg border border-line p-3">
              <dt className="text-xs text-muted">{t(`pai.admin.${k}`)}</dt>
              <dd className="mt-0.5 font-bold text-ink tabular-nums">
                {usd(d?.[k].usd)}
                {k === 'today' && d ? <span className="font-normal text-muted"> / {usd(d.dailyCapUsd)}</span> : null}
              </dd>
              <dd className="text-[11px] text-muted">
                {d?.[k].messages ?? 0} {t('pai.admin.messages')} · {d?.[k].leads ?? 0} {t('pai.admin.leads')}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex justify-end">
          <button type="button" className="btn-primary btn-sm" disabled={saving || !Number.isFinite(cap) || cap < 0 || cap > 100} onClick={() => void save()}>
            <Save className="size-3.5" aria-hidden /> {t('pai.admin.save')}
          </button>
        </div>
      </div>
    </Panel>
  );
};

export default AdminPublicAdvisor;
