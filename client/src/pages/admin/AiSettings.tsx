import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Coins, KeyRound, Save, Sparkles, Wallet } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAi } from '@/i18n/pagesAi';
import { usePageTitle } from '@/lib/usePageTitle';
import { LoadingBlock, ErrorBlock, PageHead, Panel, StatTile, Switch, EmptyState } from '@/components/admin/ui';
import { BarList, LineChart, SERIES_COLORS } from '@/components/admin/charts';

registerCopy(pagesAi);

type Scope = 'CLIENT' | 'ADMIN';

interface Settings {
  clientEnabled: boolean;
  models: Record<Scope, string>;
  monthlyBudgetUsd: number;
  clientDailyMessages: number;
  clientDailyCostUsd: number;
  adminDailyCostUsd: number;
  maxOutputTokens: Record<Scope, number>;
  keySource: 'env' | 'settings' | 'none';
}

interface ModelItem {
  id: string;
  name: string;
  promptPerM: number | null;
  completionPerM: number | null;
}

interface Usage {
  days: { date: string; clientUsd: number; adminUsd: number; messages: number }[];
  byScope: Record<Scope, { costUsd: number; messages: number; tokensIn: number; tokensOut: number }>;
  topUsers: { userId: string; name: string; email: string | null; role: string | null; scope: Scope; costUsd: number; messages: number }[];
  month: { spentUsd: number; budgetUsd: number };
  key: { limitUsd: number | null; remainingUsd: number | null; usageUsd: number; usageMonthlyUsd: number | null } | null;
}

const usd = (n: number | null | undefined, digits = 2) => (n === null || n === undefined ? '—' : `$${n.toFixed(n !== 0 && Math.abs(n) < 0.01 ? 4 : digits)}`);

const NumberField = ({ label, hint, value, onChange, step = 1, min = 0, max }: { label: string; hint?: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) => (
  <label className="block">
    <span className="text-xs font-semibold text-ink">{label}</span>
    <input type="number" className="input mt-1" value={Number.isFinite(value) ? value : ''} step={step} min={min} max={max} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
    {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
  </label>
);

export default function AdminAiSettings() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('ai.settings.title'));
  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: ['ai', 'settings'], queryFn: async () => (await api.get<{ settings: Settings }>('/ai/settings')).data.settings });
  const modelsQ = useQuery({ queryKey: ['ai', 'models'], queryFn: async () => (await api.get<{ items: ModelItem[] }>('/ai/models')).data.items, staleTime: 10 * 60_000 });
  const [days, setDays] = useState(30);
  const usageQ = useQuery({ queryKey: ['ai', 'usage', days], queryFn: async () => (await api.get<Usage>('/ai/usage', { params: { days } })).data });

  const [form, setForm] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (settingsQ.data && !form) setForm(settingsQ.data);
  }, [settingsQ.data, form]);

  const dateFmt = useMemo(() => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'az', { day: '2-digit', month: '2-digit' }), [i18n.resolvedLanguage]);
  const longFmt = useMemo(() => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'az', { dateStyle: 'medium' }), [i18n.resolvedLanguage]);

  const save = async (patch: Partial<Settings> & { apiKey?: string }) => {
    setSaving(true);
    try {
      const { data } = await api.put<{ settings: Settings }>('/ai/settings', patch);
      setForm(data.settings);
      qc.setQueryData(['ai', 'settings'], data.settings);
      void qc.invalidateQueries({ queryKey: ['ai', 'status'] });
      setApiKey('');
      toast.success(t('ai.settings.saved'));
    } catch (err) {
      toast.error(`${t('ai.errors.generic')} (${errorCode(err)})`);
    } finally {
      setSaving(false);
    }
  };

  if (settingsQ.isLoading || !form) return settingsQ.error ? <ErrorBlock error={settingsQ.error} onRetry={() => void settingsQ.refetch()} /> : <LoadingBlock />;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const models = modelsQ.data ?? [];
  const modelLabel = (m: ModelItem) => `${m.name}${m.promptPerM !== null ? ` — $${m.promptPerM} · $${m.completionPerM}` : ''}`;
  const valid = [form.monthlyBudgetUsd, form.clientDailyMessages, form.clientDailyCostUsd, form.adminDailyCostUsd, form.maxOutputTokens.CLIENT, form.maxOutputTokens.ADMIN].every(Number.isFinite);

  const usage = usageQ.data;
  const series = [
    { key: 'client', label: t('ai.settings.client'), color: SERIES_COLORS[0] },
    { key: 'admin', label: t('ai.settings.admin'), color: SERIES_COLORS[1] },
  ];
  const remaining = usage?.key?.remainingUsd ?? null;

  return (
    <div className="space-y-6">
      <PageHead
        title={t('ai.settings.title')}
        subtitle={t('ai.settings.subtitle')}
        actions={
          <Link to="/admin/ai" className="btn btn-sm border border-line bg-card text-ink hover:bg-surface">
            <Sparkles className="size-3.5" aria-hidden /> {t('ai.settings.openChat')}
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t('ai.settings.monthSpent')}
          value={usd(usage?.month.spentUsd)}
          hint={`/ ${usd(usage?.month.budgetUsd ?? form.monthlyBudgetUsd)}`}
          tone={usage && usage.month.spentUsd >= usage.month.budgetUsd * 0.8 ? 'warn' : undefined}
          icon={Wallet}
          className="bg-card"
        />
        <StatTile
          label={t('ai.settings.remainingCredit')}
          value={usage?.key ? (remaining === null ? t('ai.settings.unlimited') : usd(remaining)) : t('ai.settings.unknown')}
          hint={usage?.key?.limitUsd ? `/ ${usd(usage.key.limitUsd)}` : undefined}
          tone={remaining !== null && remaining < 0.5 ? 'danger' : undefined}
          icon={KeyRound}
          className="bg-card"
        />
        <StatTile label={`${t('ai.settings.client')} · ${t('ai.settings.cost')}`} value={usd(usage?.byScope.CLIENT.costUsd)} hint={`${usage?.byScope.CLIENT.messages ?? 0} ${t('ai.settings.messages').toLowerCase()}`} icon={Coins} className="bg-card" />
        <StatTile label={`${t('ai.settings.admin')} · ${t('ai.settings.cost')}`} value={usd(usage?.byScope.ADMIN.costUsd)} hint={`${usage?.byScope.ADMIN.messages ?? 0} ${t('ai.settings.messages').toLowerCase()}`} icon={Coins} className="bg-card" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title={t('ai.settings.models')} className="bg-card">
          <div className="space-y-4">
            {(['CLIENT', 'ADMIN'] as const).map((s) => (
              <label key={s} className="block">
                <span className="text-xs font-semibold text-ink">{s === 'CLIENT' ? t('ai.settings.clientModel') : t('ai.settings.adminModel')}</span>
                <select className="input mt-1" value={form.models[s]} onChange={(e) => set('models', { ...form.models, [s]: e.target.value })}>
                  {!models.some((m) => m.id === form.models[s]) && <option value={form.models[s]}>{form.models[s]}</option>}
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {modelLabel(m)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <p className="text-[11px] text-muted">{t('ai.settings.priceHint')}</p>
            <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface p-3">
              <div>
                <p className="text-sm font-semibold text-ink">{t('ai.settings.clientEnabled')}</p>
                <p className="mt-0.5 text-xs text-muted">{t('ai.settings.clientEnabledHint')}</p>
              </div>
              <Switch checked={form.clientEnabled} onChange={(v) => set('clientEnabled', v)} label={t('ai.settings.clientEnabled')} />
            </div>
            <div>
              <label className="block">
                <span className="text-xs font-semibold text-ink">
                  {t('ai.settings.apiKey')} <span className="font-normal text-muted">· {t(`ai.settings.keySource.${form.keySource}`)}</span>
                </span>
                <input type="password" autoComplete="off" className="input mt-1" value={apiKey} placeholder={t('ai.settings.apiKeyPlaceholder')} onChange={(e) => setApiKey(e.target.value)} />
              </label>
              <p className="mt-1 text-[11px] text-muted">{t('ai.settings.apiKeyHint')}</p>
              {form.keySource === 'settings' && (
                <button type="button" className="mt-1 text-xs font-semibold text-danger hover:underline" disabled={saving} onClick={() => void save({ apiKey: '' })}>
                  {t('ai.settings.removeKey')}
                </button>
              )}
            </div>
          </div>
        </Panel>

        <Panel title={t('ai.settings.limits')} className="bg-card">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField label={t('ai.settings.monthlyBudget')} hint={t('ai.settings.monthlyBudgetHint')} value={form.monthlyBudgetUsd} step={0.5} onChange={(v) => set('monthlyBudgetUsd', v)} />
            <NumberField label={t('ai.settings.clientDailyMessages')} value={form.clientDailyMessages} onChange={(v) => set('clientDailyMessages', v)} max={1000} />
            <NumberField label={t('ai.settings.clientDailyCost')} value={form.clientDailyCostUsd} step={0.01} onChange={(v) => set('clientDailyCostUsd', v)} />
            <NumberField label={t('ai.settings.adminDailyCost')} value={form.adminDailyCostUsd} step={0.1} onChange={(v) => set('adminDailyCostUsd', v)} />
            <NumberField label={t('ai.settings.maxTokensClient')} value={form.maxOutputTokens.CLIENT} step={50} min={50} max={4000} onChange={(v) => set('maxOutputTokens', { ...form.maxOutputTokens, CLIENT: v })} />
            <NumberField label={t('ai.settings.maxTokensAdmin')} value={form.maxOutputTokens.ADMIN} step={50} min={50} max={8000} onChange={(v) => set('maxOutputTokens', { ...form.maxOutputTokens, ADMIN: v })} />
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={saving || !valid}
              onClick={() =>
                void save({
                  clientEnabled: form.clientEnabled,
                  models: form.models,
                  monthlyBudgetUsd: form.monthlyBudgetUsd,
                  clientDailyMessages: form.clientDailyMessages,
                  clientDailyCostUsd: form.clientDailyCostUsd,
                  adminDailyCostUsd: form.adminDailyCostUsd,
                  maxOutputTokens: form.maxOutputTokens,
                  ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
                })
              }
            >
              <Save className="size-3.5" aria-hidden /> {t('ai.settings.save')}
            </button>
          </div>
        </Panel>
      </div>

      <Panel
        title={t('ai.settings.usage')}
        className="bg-card"
        actions={
          <select className="input !w-auto !py-1.5 text-xs" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label={t('ai.settings.usage')}>
            {[7, 30, 90].map((n) => (
              <option key={n} value={n}>
                {t('ai.settings.days', { n })}
              </option>
            ))}
          </select>
        }
      >
        {usageQ.isLoading ? (
          <LoadingBlock className="min-h-40" />
        ) : usageQ.error ? (
          <ErrorBlock error={usageQ.error} onRetry={() => void usageQ.refetch()} />
        ) : usage ? (
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-semibold text-muted">{t('ai.settings.perDay')}</p>
              <LineChart
                points={usage.days.map((d) => ({ x: d.date, values: { client: Math.round(d.clientUsd * 10000) / 10000, admin: Math.round(d.adminUsd * 10000) / 10000 } }))}
                series={series}
                hidden={hidden}
                onToggle={(k) => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
                xLabel={(x) => dateFmt.format(new Date(x))}
                xTitle={(x) => longFmt.format(new Date(x))}
                ariaLabel={t('ai.settings.perDay')}
                emptyText={t('ai.settings.noUsage')}
              />
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-3 text-xs font-semibold text-muted">{t('ai.settings.perScope')}</p>
                <BarList
                  format={(v) => usd(v)}
                  rows={[
                    { key: 'client', label: `${t('ai.settings.client')} · ${usage.byScope.CLIENT.messages} · ${usage.byScope.CLIENT.tokensIn}/${usage.byScope.CLIENT.tokensOut}`, value: usage.byScope.CLIENT.costUsd, tone: 'bg-[#2f7bff]' },
                    { key: 'admin', label: `${t('ai.settings.admin')} · ${usage.byScope.ADMIN.messages} · ${usage.byScope.ADMIN.tokensIn}/${usage.byScope.ADMIN.tokensOut}`, value: usage.byScope.ADMIN.costUsd, tone: 'bg-[#eb6834]' },
                  ]}
                />
                <p className="mt-2 text-[11px] text-muted">
                  {t('ai.settings.messages')} · {t('ai.settings.tokens')}
                </p>
              </div>
              <div>
                <p className="mb-3 text-xs font-semibold text-muted">{t('ai.settings.topUsers')}</p>
                {usage.topUsers.length ? (
                  <div className="overflow-x-auto rounded-lg border border-line">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface text-muted">
                        <tr>
                          <th className="px-3 py-2 font-semibold">{t('ai.settings.user')}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t('ai.settings.messages')}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t('ai.settings.cost')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.topUsers.map((u) => (
                          <tr key={`${u.userId}-${u.scope}`} className="border-t border-line">
                            <td className="px-3 py-2">
                              <span className="block font-semibold text-ink">{u.name}</span>
                              <span className="block text-[11px] text-muted">
                                {u.email} · {u.scope === 'ADMIN' ? t('ai.settings.admin') : t('ai.settings.client')}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{u.messages}</td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums">{usd(u.costUsd, 3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState icon={Coins} title={t('ai.settings.noUsage')} />
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
