import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Mail, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { Panel, Switch } from '@/components/admin/ui';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from '@/components/admin/labels';
import './shared';

interface BriefingState {
  enabled: boolean;
  canTest: boolean;
}
const KEY = ['ai-staff', 'briefing'];

const useBriefing = () => {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<BriefingState>('/admin/ai-staff/briefing')).data });
  const [saving, setSaving] = useState(false);
  const set = async (enabled: boolean, t: (k: string) => string) => {
    setSaving(true);
    try {
      const res = (await api.put<{ enabled: boolean }>('/admin/ai-staff/briefing', { enabled })).data;
      qc.setQueryData<BriefingState>(KEY, (old) => ({ canTest: old?.canTest ?? false, enabled: res.enabled }));
      toast.success(res.enabled ? t('aiStaff.briefing.on') : t('aiStaff.briefing.off'));
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };
  return { ...q, saving, set };
};

/** Small opt-in switch (dashboard widget footer; ADMIN / SUPER_ADMIN only). */
export const BriefingToggle = ({ compact }: { compact?: boolean }) => {
  const { t } = useTranslation();
  const { data, saving, set } = useBriefing();
  if (!data) return null;
  return (
    <span className="flex items-center gap-2 text-xs text-muted">
      <Mail className="size-3.5" aria-hidden />
      {compact ? t('aiStaff.briefing.toggle') : t('aiStaff.briefing.title')}
      <Switch checked={data.enabled} disabled={saving} onChange={(v) => void set(v, t)} label={t('aiStaff.briefing.toggle')} />
    </span>
  );
};

/** Card on the AI settings page: opt-in + "send me a test briefing now" for the super admin. */
export const BriefingSettings = () => {
  const { t } = useTranslation();
  const { data, saving, set } = useBriefing();
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      const res = (await api.post<{ sent: boolean; intro: boolean }>('/admin/ai-staff/briefing/test')).data;
      toast.success(res.intro ? t('aiStaff.briefing.testSent') : t('aiStaff.briefing.testNoIntro'));
    } catch (err) {
      toastError(err);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Panel title={t('aiStaff.briefing.title')} icon={Mail} className="bg-card">
      <p className="text-sm text-muted">{t('aiStaff.briefing.description')}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          {t('aiStaff.briefing.toggle')}
          {data && <Switch checked={data.enabled} disabled={saving} onChange={(v) => void set(v, t)} label={t('aiStaff.briefing.toggle')} />}
        </span>
        {data?.canTest && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => void test()} disabled={testing}>
            {testing ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />} {t('aiStaff.briefing.test')}
          </button>
        )}
      </div>
    </Panel>
  );
};
