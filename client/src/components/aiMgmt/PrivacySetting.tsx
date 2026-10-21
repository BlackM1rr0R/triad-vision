import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { Panel, Switch } from '@/components/admin/ui';
import './shared';

interface PrivacyFields {
  privacyMode?: boolean;
  zeroDataRetention?: boolean;
}

/** DSGVO privacy routing on /admin/ai/settings: two switches, saved right away (PUT /api/ai/settings). */
export const PrivacySetting = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ai', 'settings'], queryFn: async () => (await api.get<{ settings: PrivacyFields }>('/ai/settings')).data.settings });
  const [saving, setSaving] = useState(false);
  const s = q.data;
  if (!s) return null;

  const save = async (patch: PrivacyFields) => {
    setSaving(true);
    try {
      const { data } = await api.put<{ settings: PrivacyFields }>('/ai/settings', patch);
      qc.setQueryData(['ai', 'settings'], data.settings);
      toast.success(t('ai.settings.saved'));
    } catch (err) {
      toast.error(errorCode(err));
    } finally {
      setSaving(false);
    }
  };

  const row = (key: 'privacyMode' | 'zeroDataRetention', label: string, hint: string, checked: boolean) => (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface p-3">
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
      </div>
      <Switch checked={checked} disabled={saving} onChange={(v) => void save({ [key]: v })} label={label} />
    </div>
  );

  return (
    <Panel title={t('aiMgmt.privacy.title')} icon={ShieldCheck} className="bg-card">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {row('privacyMode', t('aiMgmt.privacy.mode'), t('aiMgmt.privacy.modeHint'), s.privacyMode !== false)}
        {row('zeroDataRetention', t('aiMgmt.privacy.zdr'), t('aiMgmt.privacy.zdrHint'), s.zeroDataRetention === true)}
      </div>
    </Panel>
  );
};
