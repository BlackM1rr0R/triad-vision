import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { Switch } from '@/components/admin/ui';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from '@/components/admin/labels';
import { l10n, type L10n } from './api';

type VisaType = 'WORK' | 'AUSBILDUNG' | 'WEITERBILDUNG' | 'JOB_SEEKER' | 'STUDY' | 'FAMILY' | 'TOURIST';
const VISA_TYPES: VisaType[] = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'];
const LANGS = ['az', 'de', 'en', 'ru'] as const;

interface Item {
  key: string;
  requirementKey?: string | null;
  label: L10n;
}

interface Settings {
  enabled: boolean;
  minimumWage: Record<string, number>;
  blueCard: Record<string, { standard: number; shortage: number }>;
  olderWorker: Record<string, number>;
  checklists: Record<VisaType, Item[]>;
  defaults: { minimumWage: Record<string, number>; blueCard: Record<string, { standard: number; shortage: number }>; olderWorker: Record<string, number> };
}

const sortedYears = (o: Record<string, unknown>) => Object.keys(o).sort();

/** Thresholds (verify yearly) and embassy checklists of the case AI checks. Editable by admins only. */
export const SettingsModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['case-ai', 'settings'],
    queryFn: async () => (await api.get<{ settings: Settings; canEdit: boolean }>('/admin/case-ai/settings')).data,
    enabled: open,
  });
  const [s, setS] = useState<Settings | null>(null);
  const [visa, setVisa] = useState<VisaType>('WORK');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setS(structuredClone(q.data.settings));
  }, [q.data]);
  const canEdit = !!q.data?.canEdit;

  const save = async () => {
    if (!s) return;
    setBusy(true);
    try {
      const res = await api.put<{ settings: Settings; canEdit: boolean }>('/admin/case-ai/settings', {
        enabled: s.enabled,
        minimumWage: s.minimumWage,
        blueCard: s.blueCard,
        olderWorker: s.olderWorker,
        checklists: s.checklists,
      });
      qc.setQueryData(['case-ai', 'settings'], res.data);
      void qc.invalidateQueries({ queryKey: ['case-ai'] });
      toast.success(t('aiCase.settings.saved'));
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(',', '.')));
  const addYear = (table: 'minimumWage' | 'olderWorker' | 'blueCard') =>
    setS((x) => {
      if (!x) return x;
      const years = sortedYears(x[table]);
      const next = String((Number(years[years.length - 1]) || new Date().getFullYear()) + 1);
      const last = years.length ? x[table][years[years.length - 1]] : table === 'blueCard' ? { standard: 0, shortage: 0 } : 0;
      return { ...x, [table]: { ...x[table], [next]: structuredClone(last) } };
    });
  const removeYear = (table: 'minimumWage' | 'olderWorker' | 'blueCard', y: string) =>
    setS((x) => {
      if (!x) return x;
      const copy = { ...x[table] } as Record<string, unknown>;
      delete copy[y];
      return { ...x, [table]: copy } as Settings;
    });
  const setItem = (i: number, patch: Partial<Item>) => setS((x) => (x ? { ...x, checklists: { ...x.checklists, [visa]: x.checklists[visa].map((it, n) => (n === i ? { ...it, ...patch } : it)) } } : x));

  const YearTable = ({ table }: { table: 'minimumWage' | 'olderWorker' }) => (
    <div className="space-y-1.5">
      {s &&
        sortedYears(s[table]).map((y) => (
          <div key={y} className="flex items-center gap-2">
            <span className="w-12 text-sm font-semibold text-navy-900 tabular-nums">{y}</span>
            <input className="input w-32" inputMode="decimal" disabled={!canEdit} defaultValue={String(s[table][y])} aria-label={`${t(`aiCase.settings.${table === 'minimumWage' ? 'wage' : 'older'}`)} ${y}`} onBlur={(e) => setS((x) => (x ? { ...x, [table]: { ...x[table], [y]: num(e.target.value) } } : x))} />
            {canEdit && (
              <button type="button" className="grid size-8 place-items-center rounded-md text-muted hover:text-danger" onClick={() => removeYear(table, y)} aria-label={t('aiCase.settings.remove')}>
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        ))}
      {canEdit && (
        <button type="button" className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => addYear(table)}>
          + {t('aiCase.settings.addYear')}
        </button>
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('aiCase.settings.title')}
      footer={
        canEdit ? (
          <>
            <button type="button" className="btn-white btn-sm border border-line" onClick={onClose}>
              {t('aiCase.actions.cancel')}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => void save()} disabled={busy || !s}>
              {busy && <Spinner className="size-3.5" />} {t('aiCase.settings.save')}
            </button>
          </>
        ) : undefined
      }
    >
      {!s ? (
        <div className="grid min-h-40 place-items-center text-brand-600">
          <Spinner className="size-6" />
        </div>
      ) : (
        <div className="space-y-6">
          {!canEdit && <p className="text-xs text-muted">{t('aiCase.settings.readOnly')}</p>}
          <div className="flex items-start gap-3">
            <Switch checked={s.enabled} disabled={!canEdit} onChange={(v) => setS({ ...s, enabled: v })} label={t('aiCase.settings.enabled')} />
            <div>
              <p className="text-sm font-semibold text-navy-900">{t('aiCase.settings.enabled')}</p>
              <p className="text-xs text-muted">{t('aiCase.settings.enabledHint')}</p>
            </div>
          </div>
          <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> {t('aiCase.settings.verify')}
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h4 className="mb-2 text-sm font-semibold text-navy-900">{t('aiCase.settings.wage')}</h4>
              <YearTable table="minimumWage" />
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-navy-900">{t('aiCase.settings.older')}</h4>
              <YearTable table="olderWorker" />
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold text-navy-900">{t('aiCase.settings.blueCard')}</h4>
            <div className="space-y-1.5">
              {sortedYears(s.blueCard).map((y) => (
                <div key={y} className="flex flex-wrap items-center gap-2">
                  <span className="w-12 text-sm font-semibold text-navy-900 tabular-nums">{y}</span>
                  {(['standard', 'shortage'] as const).map((k) => (
                    <input key={k} className="input w-32" inputMode="decimal" disabled={!canEdit} defaultValue={String(s.blueCard[y][k])} aria-label={`${y} ${k}`} onBlur={(e) => setS((x) => (x ? { ...x, blueCard: { ...x.blueCard, [y]: { ...x.blueCard[y], [k]: num(e.target.value) } } } : x))} />
                  ))}
                  {canEdit && (
                    <button type="button" className="grid size-8 place-items-center rounded-md text-muted hover:text-danger" onClick={() => removeYear('blueCard', y)} aria-label={t('aiCase.settings.remove')}>
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              ))}
              {canEdit && (
                <button type="button" className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => addYear('blueCard')}>
                  + {t('aiCase.settings.addYear')}
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h4 className="min-w-0 flex-1 text-sm font-semibold text-navy-900">{t('aiCase.settings.checklists')}</h4>
              <select className="input w-auto" value={visa} onChange={(e) => setVisa(e.target.value as VisaType)} aria-label={t('aiCase.settings.visaType')}>
                {VISA_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {t(`aiCase.visaTypes.${v}`)}
                  </option>
                ))}
              </select>
            </div>
            <p className="mb-2 text-[11px] text-muted">{t('aiCase.settings.verifyEmbassy')}</p>
            <ul className="space-y-2">
              {s.checklists[visa].map((it, i) => (
                <li key={`${visa}-${i}`} className="rounded-lg border border-line p-2.5">
                  {canEdit ? (
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {LANGS.map((l) => (
                        <input key={l} className="input" value={it.label[l]} maxLength={300} aria-label={`${l.toUpperCase()} ${i + 1}`} placeholder={l.toUpperCase()} onChange={(e) => setItem(i, { label: { ...it.label, [l]: e.target.value } })} />
                      ))}
                      <div className="flex items-center gap-2 sm:col-span-2">
                        <input className="input w-48" value={it.requirementKey ?? ''} maxLength={40} placeholder={t('aiCase.settings.requirementKey')} aria-label={t('aiCase.settings.requirementKey')} onChange={(e) => setItem(i, { requirementKey: e.target.value.trim().toUpperCase() || null })} />
                        <span className="flex-1" />
                        <button type="button" className="btn-white btn-sm border border-line" onClick={() => setS({ ...s, checklists: { ...s.checklists, [visa]: s.checklists[visa].filter((_, n) => n !== i) } })}>
                          <Trash2 className="size-3.5" aria-hidden /> {t('aiCase.settings.remove')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-ink">{l10n(it.label)}</p>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-white btn-sm border border-line"
                  onClick={() => setS({ ...s, checklists: { ...s.checklists, [visa]: [...s.checklists[visa], { key: `item${Date.now().toString(36)}`, requirementKey: null, label: { az: '', de: '', en: '', ru: '' } }] } })}
                >
                  <Plus className="size-3.5" aria-hidden /> {t('aiCase.settings.addItem')}
                </button>
                <button type="button" className="btn-white btn-sm border border-line" onClick={() => setS({ ...s, checklists: { ...s.checklists, [visa]: [] } })}>
                  <RotateCcw className="size-3.5" aria-hidden /> {t('aiCase.settings.reset')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};
