import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, Calculator, Gift, Map as MapIcon, Plus, Trash2 } from 'lucide-react';
import { Chip, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { Tabs } from '@/components/ui/Tabs';
import { L10nInput, emptyL10n } from '@/components/admin/L10nInput';
import { useCalcConfig } from '@/components/growth/api';
import { registerCopy } from '@/i18n';
import { pagesGrowthPlus } from '@/i18n/pagesGrowthPlus';
import { pagesMarketing } from '@/i18n/pagesMarketing';
import { CostCalculatorSettings } from '@/components/marketing/CostCalculatorSettings';
import { OriginAnalytics } from '@/components/marketing/OriginAnalytics';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { hasMinRole, type L10n } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesGrowthPlus);
registerCopy(pagesMarketing);

type R = [number, number];
interface CalcSettings {
  enabled: boolean;
  weeksPerLevel: Record<'A1' | 'A2' | 'B1' | 'B2' | 'C1', R>;
  documents: Record<'none' | 'some' | 'all', R>;
  recognition: R;
  matching: { withOffer: R; withoutOffer: R };
  embassyWait: R;
  processingFallback: R;
  travel: R;
  recognitionBySlug: Record<string, boolean>;
  verifiedAt: string;
  verifiedNote: string;
}

const RangeInput = ({ label, value, onChange, disabled }: { label: ReactNode; value: R; onChange: (v: R) => void; disabled?: boolean }) => {
  const { t } = useTranslation();
  const num = (s: string) => Math.max(0, Math.min(260, Math.round(Number(s) || 0)));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="text-sm text-ink">{label}</span>
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <input className="input w-20 py-1.5 text-right tabular-nums" type="number" min={0} max={260} aria-label={`${String(label)} ${t('gp.admin.calc.min')}`} value={value[0]} disabled={disabled} onChange={(e) => onChange([num(e.target.value), value[1]])} />
        –
        <input className="input w-20 py-1.5 text-right tabular-nums" type="number" min={0} max={260} aria-label={`${String(label)} ${t('gp.admin.calc.max')}`} value={value[1]} disabled={disabled} onChange={(e) => onChange([value[0], num(e.target.value)])} />
      </span>
    </div>
  );
};

const CalculatorTab = ({ canEdit }: { canEdit: boolean }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'growth', 'calculator'], queryFn: async () => (await api.get<{ settings: CalcSettings; defaults: CalcSettings }>('/admin/growth/calculator')).data });
  const { data: config } = useCalcConfig();
  const [s, setS] = useState<CalcSettings | null>(null);
  useEffect(() => {
    if (data && !s) setS(data.settings);
  }, [data, s]);
  const save = useMutation({
    mutationFn: (v: CalcSettings) => api.put('/admin/growth/calculator', v),
    onSuccess: () => {
      toast.success(t('gp.common.saved'));
      void qc.invalidateQueries({ queryKey: ['growth'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'growth', 'calculator'] });
    },
    onError: () => toast.error(t('gp.common.error')),
  });
  if (!s || !data) return <LoadingBlock />;
  const up = (patch: Partial<CalcSettings>) => setS({ ...s, ...patch });
  const invalid = [
    ...Object.values(s.weeksPerLevel),
    ...Object.values(s.documents),
    s.recognition,
    s.matching.withOffer,
    s.matching.withoutOffer,
    s.embassyWait,
    s.processingFallback,
    s.travel,
  ].some(([a, b]) => a > b);
  return (
    <div className="space-y-5">
      <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-bg px-4 py-3 text-sm text-ink">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-fg" aria-hidden /> {t('gp.admin.calc.verify')}
      </p>
      <Panel title={t('gp.admin.tabs.calculator')} icon={Calculator} actions={<Switch checked={s.enabled} label={t('gp.admin.calc.enabled')} disabled={!canEdit} onChange={(v) => up({ enabled: v })} />}>
        <p className="mb-3 text-sm text-muted">{t('gp.admin.calc.intro')}</p>
        <div className="grid gap-x-10 lg:grid-cols-2">
          <div className="divide-y divide-line">
            <p className="pb-1 text-xs font-bold tracking-wide text-muted uppercase">{t('gp.admin.calc.weeksPerLevel')}</p>
            {(['A1', 'A2', 'B1', 'B2', 'C1'] as const).map((l) => (
              <RangeInput key={l} label={`→ ${l}`} value={s.weeksPerLevel[l]} disabled={!canEdit} onChange={(v) => up({ weeksPerLevel: { ...s.weeksPerLevel, [l]: v } })} />
            ))}
            <p className="pt-3 pb-1 text-xs font-bold tracking-wide text-muted uppercase">{t('gp.admin.calc.documents')}</p>
            {(['none', 'some', 'all'] as const).map((d) => (
              <RangeInput key={d} label={t(`gp.calc.docNames.${d}`)} value={s.documents[d]} disabled={!canEdit} onChange={(v) => up({ documents: { ...s.documents, [d]: v } })} />
            ))}
          </div>
          <div className="divide-y divide-line">
            <RangeInput label={t('gp.admin.calc.recognition')} value={s.recognition} disabled={!canEdit} onChange={(v) => up({ recognition: v })} />
            <RangeInput label={t('gp.admin.calc.matchingWith')} value={s.matching.withOffer} disabled={!canEdit} onChange={(v) => up({ matching: { ...s.matching, withOffer: v } })} />
            <RangeInput label={t('gp.admin.calc.matchingWithout')} value={s.matching.withoutOffer} disabled={!canEdit} onChange={(v) => up({ matching: { ...s.matching, withoutOffer: v } })} />
            <RangeInput label={t('gp.admin.calc.embassyWait')} value={s.embassyWait} disabled={!canEdit} onChange={(v) => up({ embassyWait: v })} />
            <RangeInput label={t('gp.admin.calc.processingFallback')} value={s.processingFallback} disabled={!canEdit} onChange={(v) => up({ processingFallback: v })} />
            <RangeInput label={t('gp.admin.calc.travel')} value={s.travel} disabled={!canEdit} onChange={(v) => up({ travel: v })} />
          </div>
        </div>
      </Panel>
      <Panel title={t('gp.admin.calc.recognitionBySlug')}>
        <ul className="divide-y divide-line">
          {(config?.categories ?? []).map((c) => {
            const v = s.recognitionBySlug[c.slug];
            const pick = (next: boolean | undefined) => {
              const map = { ...s.recognitionBySlug };
              if (next === undefined) delete map[c.slug];
              else map[c.slug] = next;
              up({ recognitionBySlug: map });
            };
            return (
              <li key={c.slug} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm text-ink">
                  {tr(c.title)} <span className="text-xs text-muted">· {c.visaLabel}</span>
                </span>
                <span className="flex gap-1.5">
                  <Chip active={v === undefined} onClick={() => canEdit && pick(undefined)}>
                    {t('gp.admin.calc.auto')}
                  </Chip>
                  <Chip active={v === true} onClick={() => canEdit && pick(true)}>
                    {t('gp.common.yes')}
                  </Chip>
                  <Chip active={v === false} onClick={() => canEdit && pick(false)}>
                    {t('gp.common.no')}
                  </Chip>
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>
      <Panel>
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <label className="block">
            <span className="label">{t('gp.admin.calc.verifiedAt')}</span>
            <input className="input" type="date" value={s.verifiedAt} disabled={!canEdit} onChange={(e) => up({ verifiedAt: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">{t('gp.admin.calc.verifiedNote')}</span>
            <input className="input" maxLength={1000} value={s.verifiedNote} disabled={!canEdit} onChange={(e) => up({ verifiedNote: e.target.value })} />
          </label>
        </div>
        {canEdit && (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setS({ ...data.defaults, verifiedAt: s.verifiedAt, verifiedNote: s.verifiedNote })}>
              {t('gp.admin.calc.reset')}
            </button>
            <button type="button" className="btn-primary btn-sm" disabled={invalid || save.isPending} onClick={() => save.mutate(s)}>
              {t('gp.common.save')}
            </button>
          </div>
        )}
      </Panel>
    </div>
  );
};

interface MapSettings {
  enabled: boolean;
  showOnHome: boolean;
  showOnStories: boolean;
  useCases: boolean;
  minPerCity: number;
}
interface MapEntry {
  id: string;
  city: string;
  mode: 'OVERRIDE' | 'ADD' | 'HIDE';
  workers: number;
  professions: string[] | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
}
interface PreviewCity {
  city: string;
  workers: number;
  computed: number;
  professions: string[];
  source: 'computed' | 'manual' | 'mixed';
  published: boolean;
}

const MapTab = ({ canEdit }: { canEdit: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['admin', 'growth', 'map'],
    queryFn: async () => (await api.get<{ settings: MapSettings; entries: MapEntry[]; preview: PreviewCity[]; minPerCity: number }>('/admin/growth/map')).data,
  });
  const [entry, setEntry] = useState({ city: '', mode: 'OVERRIDE' as MapEntry['mode'], workers: '', professions: '', lat: '', lng: '', note: '' });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'growth', 'map'] });
    void qc.invalidateQueries({ queryKey: ['growth', 'map'] });
  };
  const saveSettings = useMutation({ mutationFn: (s: MapSettings) => api.put('/admin/growth/map/settings', s), onSuccess: refresh, onError: () => toast.error(t('gp.common.error')) });
  const addEntry = useMutation({
    mutationFn: () =>
      api.post('/admin/growth/map/entries', {
        city: entry.city.trim(),
        mode: entry.mode,
        workers: Number(entry.workers) || 0,
        professions: entry.professions.split(',').map((p) => p.trim()).filter(Boolean).slice(0, 5),
        lat: entry.lat ? Number(entry.lat) : null,
        lng: entry.lng ? Number(entry.lng) : null,
        note: entry.note.trim() || null,
      }),
    onSuccess: () => {
      toast.success(t('gp.common.saved'));
      setEntry({ city: '', mode: 'OVERRIDE', workers: '', professions: '', lat: '', lng: '', note: '' });
      refresh();
    },
    onError: (err) => toast.error(errorCode(err) === 'VALIDATION' ? t('gp.admin.errors.VALIDATION') : t('gp.common.error')),
  });
  const delEntry = useMutation({ mutationFn: (id: string) => api.delete(`/admin/growth/map/entries/${id}`), onSuccess: refresh });
  if (!data) return <LoadingBlock />;
  const s = data.settings;
  const toggle = (k: keyof Omit<MapSettings, 'minPerCity'>, label: string) => (
    <label className="flex items-center justify-between gap-3 py-2 text-sm text-ink">
      {label}
      <Switch checked={s[k]} label={label} disabled={!canEdit} onChange={(v) => saveSettings.mutate({ ...s, [k]: v })} />
    </label>
  );
  return (
    <div className="space-y-5">
      <Panel title={t('gp.admin.tabs.map')} icon={MapIcon}>
        <div className="grid gap-x-10 divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
          <div className="divide-y divide-line">
            {toggle('enabled', t('gp.admin.map.enabled'))}
            {toggle('showOnHome', t('gp.admin.map.showOnHome'))}
            {toggle('showOnStories', t('gp.admin.map.showOnStories'))}
          </div>
          <div className="divide-y divide-line">
            {toggle('useCases', t('gp.admin.map.useCases'))}
            <label className="flex items-center justify-between gap-3 py-2 text-sm text-ink">
              {t('gp.admin.map.minPerCity')}
              <input
                className="input w-20 py-1.5 text-right"
                type="number"
                min={3}
                max={100}
                defaultValue={s.minPerCity}
                disabled={!canEdit}
                onBlur={(e) => {
                  const v = Math.max(3, Math.min(100, Math.round(Number(e.target.value) || 3)));
                  if (v !== s.minPerCity) saveSettings.mutate({ ...s, minPerCity: v });
                }}
              />
            </label>
          </div>
        </div>
      </Panel>

      <Panel title={t('gp.admin.map.preview')} bodyClassName="p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-sunken text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">{t('gp.admin.map.city')}</th>
                <th className="px-4 py-2 text-right font-semibold">{t('gp.admin.map.workers')}</th>
                <th className="px-4 py-2 text-right font-semibold">{t('gp.admin.map.computed')}</th>
                <th className="px-4 py-2 font-semibold">{t('gp.admin.map.professions')}</th>
                <th className="px-4 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.preview.map((c) => (
                <tr key={c.city}>
                  <td className="px-4 py-2 font-semibold text-ink">
                    {c.city} <span className="text-xs font-normal text-muted">({t(`gp.admin.map.source.${c.source}`)})</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.workers}</td>
                  <td className="px-4 py-2 text-right text-muted tabular-nums">{c.computed}</td>
                  <td className="px-4 py-2 text-xs text-muted">{c.professions.join(', ')}</td>
                  <td className="px-4 py-2 text-xs">
                    <span className={clsx('rounded-full px-2 py-0.5 font-semibold', c.published ? 'bg-success-bg text-success-fg' : 'bg-sunken text-muted')}>
                      {c.published ? t('gp.admin.map.published') : t('gp.admin.map.hidden', { min: data.minPerCity })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={t('gp.admin.map.entries')}>
        {data.entries.length > 0 && (
          <ul className="mb-4 divide-y divide-line rounded-lg border border-line">
            {data.entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span>
                  <span className="font-semibold text-ink">{e.city}</span> · {t(`gp.admin.map.modes.${e.mode}`)}
                  {e.mode !== 'HIDE' && ` · ${e.workers}`}
                  {e.professions?.length ? <span className="text-xs text-muted"> · {e.professions.join(', ')}</span> : null}
                  {e.note && <span className="block text-xs text-muted">{e.note}</span>}
                </span>
                {canEdit && (
                  <button type="button" className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-danger-fg" aria-label={t('gp.common.delete')} onClick={() => delEntry.mutate(e.id)}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (entry.city.trim().length >= 2) addEntry.mutate();
            }}
          >
            <label className="block">
              <span className="label">{t('gp.admin.map.city')}</span>
              <input className="input" value={entry.city} onChange={(e) => setEntry({ ...entry, city: e.target.value })} required minLength={2} />
            </label>
            <label className="block">
              <span className="label">{t('gp.admin.map.mode')}</span>
              <select className="input" value={entry.mode} onChange={(e) => setEntry({ ...entry, mode: e.target.value as MapEntry['mode'] })}>
                {(['OVERRIDE', 'ADD', 'HIDE'] as const).map((m) => (
                  <option key={m} value={m}>
                    {t(`gp.admin.map.modes.${m}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">{t('gp.admin.map.workers')}</span>
              <input className="input" type="number" min={0} value={entry.workers} disabled={entry.mode === 'HIDE'} onChange={(e) => setEntry({ ...entry, workers: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">{t('gp.admin.map.professions')}</span>
              <input className="input" value={entry.professions} placeholder="LKW-Fahrer, Lager" onChange={(e) => setEntry({ ...entry, professions: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">{t('gp.admin.map.lat')}</span>
              <input className="input" type="number" step="0.001" min={47} max={55.2} value={entry.lat} onChange={(e) => setEntry({ ...entry, lat: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">{t('gp.admin.map.lng')}</span>
              <input className="input" type="number" step="0.001" min={5.8} max={15.1} value={entry.lng} onChange={(e) => setEntry({ ...entry, lng: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">{t('gp.admin.map.note')}</span>
              <input className="input" maxLength={300} value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} />
            </label>
            <p className="text-xs text-muted sm:col-span-2 lg:col-span-3">{t('gp.admin.map.coordsHint')}</p>
            <button type="submit" className="btn-primary btn-sm self-end" disabled={addEntry.isPending}>
              <Plus className="size-4" aria-hidden /> {t('gp.admin.map.addEntry')}
            </button>
          </form>
        )}
      </Panel>
    </div>
  );
};

interface RefSettings {
  enabled: boolean;
  trigger: 'VISA_APPROVED' | 'CASE_OPENED';
  kind: 'DISCOUNT' | 'PAYOUT';
  amount: number;
  currency: string;
  terms: L10n;
}
type RewardStatus = 'PENDING' | 'EARNED' | 'PAID' | 'USED' | 'CANCELLED';
interface RefRow {
  id: string;
  stage: 'REGISTERED' | 'CASE_OPENED' | 'VISA_APPROVED' | 'BLOCKED';
  blockedReason: string | null;
  createdAt: string;
  referrer: { firstName: string; lastName: string; email: string };
  referred: { firstName: string; lastName: string; email: string };
  reward: { id: string; amount: number; currency: string; kind: string; status: RewardStatus } | null;
}

const ReferralsTab = ({ canEdit }: { canEdit: boolean }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['admin', 'growth', 'referrals'],
    queryFn: async () => (await api.get<{ settings: RefSettings; referrals: RefRow[]; totals: Record<RewardStatus, number> }>('/admin/growth/referrals')).data,
  });
  const [s, setS] = useState<RefSettings | null>(null);
  useEffect(() => {
    if (data && !s) setS({ ...data.settings, terms: data.settings.terms ?? emptyL10n() });
  }, [data, s]);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin', 'growth', 'referrals'] });
  const save = useMutation({
    mutationFn: (v: RefSettings) => api.put('/admin/growth/referrals/settings', v),
    onSuccess: () => {
      toast.success(t('gp.common.saved'));
      refresh();
    },
    onError: () => toast.error(t('gp.common.error')),
  });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RewardStatus }) => api.patch(`/admin/growth/referrals/rewards/${id}`, { status }),
    onSuccess: refresh,
    onError: () => toast.error(t('gp.common.error')),
  });
  if (!data || !s) return <LoadingBlock />;
  const actions = (r: NonNullable<RefRow['reward']>) => {
    const out: { status: RewardStatus; label: string }[] = [];
    if (r.status === 'EARNED') out.push({ status: r.kind === 'PAYOUT' ? 'PAID' : 'USED', label: r.kind === 'PAYOUT' ? t('gp.admin.ref.markPaid') : t('gp.admin.ref.markUsed') });
    if (r.status === 'PENDING' || r.status === 'EARNED') out.push({ status: 'CANCELLED', label: t('gp.admin.ref.cancelReward') });
    if (r.status === 'CANCELLED') out.push({ status: 'PENDING', label: t('gp.admin.ref.restore') });
    return out;
  };
  return (
    <div className="space-y-5">
      <Panel title={t('gp.admin.ref.settings')} icon={Gift} actions={<Switch checked={s.enabled} label={t('gp.admin.ref.enabled')} disabled={!canEdit} onChange={(v) => setS({ ...s, enabled: v })} />}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="label">{t('gp.admin.ref.trigger')}</span>
            <select className="input" value={s.trigger} disabled={!canEdit} onChange={(e) => setS({ ...s, trigger: e.target.value as RefSettings['trigger'] })}>
              {(['VISA_APPROVED', 'CASE_OPENED'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`gp.admin.ref.triggers.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('gp.admin.ref.kind')}</span>
            <select className="input" value={s.kind} disabled={!canEdit} onChange={(e) => setS({ ...s, kind: e.target.value as RefSettings['kind'] })}>
              {(['DISCOUNT', 'PAYOUT'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`gp.admin.ref.kinds.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('gp.admin.ref.amount')}</span>
            <input className="input" type="number" min={0} value={s.amount} disabled={!canEdit} onChange={(e) => setS({ ...s, amount: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
          </label>
          <label className="block">
            <span className="label">{t('gp.admin.ref.currency')}</span>
            <input className="input uppercase" maxLength={3} value={s.currency} disabled={!canEdit} onChange={(e) => setS({ ...s, currency: e.target.value.toUpperCase() })} />
          </label>
        </div>
        <div className="mt-4">
          <L10nInput label={t('gp.admin.ref.terms')} value={s.terms} onChange={(v) => setS({ ...s, terms: v })} multiline rows={2} />
        </div>
        <p className="mt-3 text-xs text-muted">{t('gp.admin.ref.agentNote')}</p>
        {canEdit && (
          <div className="mt-4 flex justify-end">
            <button type="button" className="btn-primary btn-sm" disabled={save.isPending || !/^[A-Z]{3}$/.test(s.currency)} onClick={() => save.mutate(s)}>
              {t('gp.common.save')}
            </button>
          </div>
        )}
      </Panel>

      <Panel
        title={t('gp.admin.ref.ledger')}
        bodyClassName="p-0 sm:p-0"
        actions={
          <span className="text-xs text-muted">
            {(['PENDING', 'EARNED', 'PAID', 'USED'] as const).map((k) => `${t(`gp.ref.reward.${k}`)}: ${data.totals[k] ?? 0}`).join(' · ')} {s.currency}
          </span>
        }
      >
        {data.referrals.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t('gp.admin.ref.none')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-sunken text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">{t('gp.admin.ref.referrer')}</th>
                  <th className="px-4 py-2 font-semibold">{t('gp.admin.ref.referred')}</th>
                  <th className="px-4 py-2 font-semibold">{t('gp.admin.ref.stage')}</th>
                  <th className="px-4 py-2 font-semibold">{t('gp.admin.ref.reward')}</th>
                  <th className="px-4 py-2 font-semibold">{t('gp.admin.ref.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.referrals.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2">
                      <span className="font-semibold text-ink">
                        {r.referrer.firstName} {r.referrer.lastName}
                      </span>
                      <span className="block text-xs text-muted">{r.referrer.email}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-semibold text-ink">
                        {r.referred.firstName} {r.referred.lastName}
                      </span>
                      <span className="block text-xs text-muted">
                        {r.referred.email} · {date(r.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {r.stage === 'BLOCKED' ? (
                        <span className="font-semibold text-danger-fg">{t('gp.admin.ref.blocked', { reason: t(`gp.admin.ref.reasons.${r.blockedReason ?? 'SAME_EMAIL'}`) })}</span>
                      ) : (
                        t(`gp.ref.stages.${r.stage}`)
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">{r.reward ? `${r.reward.amount} ${r.reward.currency} · ${t(`gp.ref.reward.${r.reward.status}`)}` : '—'}</td>
                    <td className="px-4 py-2">
                      <span className="flex flex-wrap gap-1.5">
                        {canEdit &&
                          r.reward &&
                          actions(r.reward).map((a) => (
                            <button key={a.status} type="button" className="btn-secondary btn-sm" disabled={move.isPending} onClick={() => move.mutate({ id: r.reward!.id, status: a.status })}>
                              {a.label}
                            </button>
                          ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
};

type Tab = 'calculator' | 'costs' | 'map' | 'origins' | 'referrals';
const TABS: Tab[] = ['calculator', 'costs', 'map', 'origins', 'referrals'];

export default function AdminGrowthTools() {
  const { t } = useTranslation();
  const { user } = useAuth();
  usePageTitle(t('gp.admin.toolsTitle'));
  const [tab, setTab] = useState<Tab>('calculator');
  const canEdit = hasMinRole(user?.role, 'ADMIN');
  return (
    <div>
      <PageHead title={t('gp.admin.toolsTitle')} subtitle={t('gp.admin.toolsSubtitle')} />
      <Tabs className="mb-5" label={t('gp.admin.toolsTitle')} items={TABS.map((k) => ({ key: k, label: k === 'costs' ? t('mk.cost.admin.tab') : k === 'origins' ? t('mk.origins.admin.tab') : t(`gp.admin.tabs.${k}`) }))} value={tab} onChange={setTab} />
      {tab === 'calculator' && <CalculatorTab canEdit={canEdit} />}
      {tab === 'costs' && <CostCalculatorSettings canEdit={canEdit} />}
      {tab === 'map' && <MapTab canEdit={canEdit} />}
      {tab === 'origins' && <OriginAnalytics />}
      {tab === 'referrals' && <ReferralsTab canEdit={canEdit} />}
    </div>
  );
}
