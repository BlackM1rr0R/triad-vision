import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { HeartHandshake, RefreshCw, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { Panel, Switch } from '@/components/admin/ui';
import { fmtDateTime, toastError } from '@/components/admin/labels';
import { registerCopy } from '@/i18n';
import { pagesLife } from '@/i18n/pagesLife';
import { lifeHomeCopy } from '@/i18n/lifeHome';
import type { EurAzn, LifeProfession, LiveNumbers } from '@/components/life/api';

registerCopy(pagesLife);
registerCopy(lifeHomeCopy);

interface LifeSettings {
  board: { enabled: boolean; showOnHome: boolean; showOnAbout: boolean };
  baku: {
    enabled: boolean;
    nationalAverage: { grossAzn: number | null; year: number; source: string };
    professions: Partial<Record<LifeProfession, { grossAzn: number | null; note: string }>>;
  };
}
interface AdminLife {
  settings: LifeSettings;
  professions: LifeProfession[];
  rate: Omit<EurAzn, 'stale' | 'source'> | null;
  board: LiveNumbers['data'];
  minCount: number;
  /** EUR → AZN rate alerts (lib/rateAlerts): counts only. */
  rateAlerts?: { active: number; paused: number; pending: number };
}

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')) || null);

/**
 * Admin → Settings: "Life in Germany" — live numbers board on/off (home, about), the Baku salary reference of the
 * simulator (national average + optional staff estimates per profession, always shown as estimates) and the
 * stored CBAR EUR→AZN rate with a manual refresh (GET/PUT /api/admin/life/settings, POST /rate/refresh).
 */
export const LifeSettingsPanel = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-life'], queryFn: async () => (await api.get<AdminLife>('/admin/life/settings')).data });
  const [v, setV] = useState<LifeSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (data) setV(data.settings);
  }, [data]);
  if (!data || !v) return null;

  const setBoard = (patch: Partial<LifeSettings['board']>) => setV({ ...v, board: { ...v.board, ...patch } });
  const setBaku = (patch: Partial<LifeSettings['baku']>) => setV({ ...v, baku: { ...v.baku, ...patch } });
  const setProf = (p: LifeProfession, patch: Partial<{ grossAzn: number | null; note: string }>) =>
    setBaku({ professions: { ...v.baku.professions, [p]: { grossAzn: null, note: '', ...v.baku.professions[p], ...patch } } });

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/admin/life/settings', v);
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin-life'] }), qc.invalidateQueries({ queryKey: ['live-numbers'] })]);
      toast.success(t('life.admin.saved'));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = (await api.post<{ rate: EurAzn | null }>('/admin/life/rate/refresh')).data.rate;
      await qc.invalidateQueries({ queryKey: ['admin-life'] });
      if (r && !r.stale) toast.success(t('life.admin.refreshed'));
      else toast.error(t('life.admin.refreshFailed'));
    } catch (err) {
      toastError(err);
    } finally {
      setRefreshing(false);
    }
  };

  const b = data.board;
  const summary = b
    ? [b.visas != null && `${b.visas} ${t('life.live.visas')}`, b.arrivals != null && `${b.arrivals} ${t('life.live.arrivals')}`, ...b.professions.map((p) => `${p.labels.en} ${p.count}`), ...b.cities.map((c) => `${c.city} ${c.count}`)]
        .filter(Boolean)
        .join(' · ') + ` (${b.month})`
    : '';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Panel
        title={t('life.admin.title')}
        icon={HeartHandshake}
        actions={
          <button type="submit" className="btn-primary btn-sm" disabled={busy}>
            {busy ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />} {t('life.admin.save')}
          </button>
        }
      >
        <p className="text-sm text-muted">{t('life.admin.subtitle')}</p>

        <fieldset className="mt-5 space-y-3">
          <legend className="font-semibold text-ink">{t('life.admin.board')}</legend>
          <Switch checked={v.board.enabled} onChange={(x) => setBoard({ enabled: x })} label={t('life.admin.boardEnabled')} />
          <Switch checked={v.board.showOnHome} onChange={(x) => setBoard({ showOnHome: x })} label={t('life.admin.showOnHome')} disabled={!v.board.enabled} />
          <Switch checked={v.board.showOnAbout} onChange={(x) => setBoard({ showOnAbout: x })} label={t('life.admin.showOnAbout')} disabled={!v.board.enabled} />
          <p className="text-xs text-muted">{b ? t('life.admin.preview', { summary }) : t('life.admin.previewNone', { n: data.minCount })}</p>
        </fieldset>

        <fieldset className="mt-6 space-y-3">
          <legend className="font-semibold text-ink">{t('life.admin.baku')}</legend>
          <Switch checked={v.baku.enabled} onChange={(x) => setBaku({ enabled: x })} label={t('life.admin.bakuEnabled')} />
          <div className="grid gap-3 sm:grid-cols-[10rem_6rem_minmax(0,1fr)]">
            <div>
              <label htmlFor="life-nat" className="label">
                {t('life.admin.national')}
              </label>
              <input
                id="life-nat"
                className="input tabular-nums"
                inputMode="decimal"
                value={v.baku.nationalAverage.grossAzn ?? ''}
                onChange={(e) => setBaku({ nationalAverage: { ...v.baku.nationalAverage, grossAzn: num(e.target.value) } })}
              />
            </div>
            <div>
              <label htmlFor="life-nat-year" className="label">
                {t('life.admin.nationalYear')}
              </label>
              <input
                id="life-nat-year"
                className="input tabular-nums"
                inputMode="numeric"
                value={v.baku.nationalAverage.year}
                onChange={(e) => setBaku({ nationalAverage: { ...v.baku.nationalAverage, year: Number(e.target.value.replace(/\D/g, '').slice(0, 4)) || 0 } })}
              />
            </div>
            <div>
              <label htmlFor="life-nat-src" className="label">
                {t('life.admin.nationalSource')}
              </label>
              <input id="life-nat-src" className="input" maxLength={200} value={v.baku.nationalAverage.source} onChange={(e) => setBaku({ nationalAverage: { ...v.baku.nationalAverage, source: e.target.value } })} />
            </div>
          </div>
          <p className="text-sm font-semibold text-ink">{t('life.admin.perProfession')}</p>
          <div className="space-y-2">
            {data.professions.map((p) => (
              <div key={p} className="grid items-center gap-2 sm:grid-cols-[12rem_8rem_minmax(0,1fr)]">
                <label htmlFor={`life-p-${p}`} className="text-sm text-ink">
                  {t(`life.form.professions.${p}`)}
                </label>
                <input
                  id={`life-p-${p}`}
                  className="input tabular-nums"
                  inputMode="decimal"
                  placeholder="—"
                  value={v.baku.professions[p]?.grossAzn ?? ''}
                  onChange={(e) => setProf(p, { grossAzn: num(e.target.value) })}
                />
                <input
                  className="input"
                  maxLength={200}
                  aria-label={`${t(`life.form.professions.${p}`)}: ${t('life.admin.note')}`}
                  placeholder={t('life.admin.note')}
                  value={v.baku.professions[p]?.note ?? ''}
                  onChange={(e) => setProf(p, { note: e.target.value })}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">{t('life.admin.estimateHint')}</p>
        </fieldset>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-sunken px-4 py-3">
          <div className="text-sm">
            <p className="font-semibold text-ink">{t('life.admin.rate')}</p>
            <p className="text-muted tabular-nums">
              {data.rate ? t('life.admin.rateValue', { rate: data.rate.rate, date: data.rate.date, fetched: fmtDateTime(data.rate.fetchedAt) }) : t('life.admin.rateNone')}
            </p>
            {data.rateAlerts && <p className="text-muted tabular-nums">{t('life.admin.rateAlerts', data.rateAlerts)}</p>}
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" aria-hidden />} {t('life.admin.refresh')}
          </button>
        </div>
      </Panel>
    </form>
  );
};
