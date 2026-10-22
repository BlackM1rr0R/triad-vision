import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ScanSearch } from 'lucide-react';
import { errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesUploadAi } from '@/i18n/pagesUploadAi';
import { Panel, Switch } from '@/components/admin/ui';
import { fetchUploadAiSettings, saveUploadAiSettings, uploadAiKeys, type UploadAiSettings } from './api';

registerCopy(pagesUploadAi);

const THRESHOLDS = [0.8, 0.85, 0.9, 0.95] as const;
const ACTIONS = ['rename', 'link', 'move', 'expiry'] as const;

/** Super admin, /admin/ai/settings: smart-upload switches (saved on click) and the auto-apply rules. */
export const UploadAiSettingsPanel = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: uploadAiKeys.settings, queryFn: fetchUploadAiSettings });
  const [saving, setSaving] = useState(false);
  const s = q.data;
  if (!s) return null;

  const save = async (patch: Parameters<typeof saveUploadAiSettings>[0]) => {
    setSaving(true);
    try {
      qc.setQueryData(uploadAiKeys.settings, await saveUploadAiSettings(patch));
      toast.success(t('uploadAi.settings.saved'));
    } catch (err) {
      toast.error(errorCode(err));
    } finally {
      setSaving(false);
    }
  };

  const row = (key: keyof Omit<UploadAiSettings, 'autoApply'>, label: string) => (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface p-3">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <Switch checked={s[key]} disabled={saving} onChange={(v) => void save({ [key]: v })} label={label} />
    </div>
  );

  return (
    <Panel title={t('uploadAi.settings.title')} icon={ScanSearch} className="bg-card">
      <p className="mb-3 text-xs text-muted">{t('uploadAi.settings.intro')}</p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {row('enabled', t('uploadAi.settings.enabled'))}
        {row('aiEnabled', t('uploadAi.settings.aiEnabled'))}
        {row('qualityEnabled', t('uploadAi.settings.qualityEnabled'))}
      </div>
      <div className="mt-3 rounded-lg border border-line bg-surface p-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink">{t('uploadAi.settings.autoApply')}</p>
            <p className="mt-0.5 text-xs text-muted">{t('uploadAi.settings.autoApplyHint')}</p>
          </div>
          <Switch checked={s.autoApply.enabled} disabled={saving} onChange={(v) => void save({ autoApply: { enabled: v } })} label={t('uploadAi.settings.autoApply')} />
        </div>
        {s.autoApply.enabled && (
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-ink">{t('uploadAi.settings.threshold')}</p>
              <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('uploadAi.settings.threshold')}>
                {THRESHOLDS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={Math.abs(s.autoApply.threshold - v) < 0.001}
                    disabled={saving}
                    onClick={() => void save({ autoApply: { threshold: v } })}
                    className={clsx(
                      'min-h-9 rounded-lg border px-3 text-xs font-semibold tabular-nums transition lg:min-h-8',
                      Math.abs(s.autoApply.threshold - v) < 0.001 ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-card text-ink hover:bg-brand-50 dark:hover:bg-white/5',
                    )}
                  >
                    {Math.round(v * 100)}%
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ACTIONS.map((a) => (
                <div key={a} className="flex items-center justify-between gap-3 rounded-md border border-line bg-card px-3 py-2">
                  <span className="text-xs text-ink">{t(`uploadAi.settings.actions.${a}`)}</span>
                  <Switch checked={s.autoApply[a]} disabled={saving} onChange={(v) => void save({ autoApply: { [a]: v } })} label={t(`uploadAi.settings.actions.${a}`)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
};

export default UploadAiSettingsPanel;
