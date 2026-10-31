import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Mail, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesStaffOps } from '@/i18n/pagesStaffOps';
import { Panel, Switch } from '@/components/admin/ui';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from '@/components/admin/labels';
import { DIGEST_KEY, useDigest, type DigestState } from './api';

registerCopy(pagesStaffOps);

/** Own morning digest e-mail (lib/staffDigest): opt-out switch + "send it to me now" (Admin → Security). */
export const DigestCard = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useDigest();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const set = async (enabled: boolean) => {
    setSaving(true);
    try {
      const res = (await api.put<{ enabled: boolean }>('/admin/staff-ops/digest', { enabled })).data;
      qc.setQueryData<DigestState>(DIGEST_KEY, (old) => ({ emailNotifications: old?.emailNotifications ?? true, enabled: res.enabled }));
      toast.success(res.enabled ? t('staffOps.digest.on') : t('staffOps.digest.off'));
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = (await api.post<{ sent: boolean; total: number }>('/admin/staff-ops/digest/test')).data;
      toast.success(t('staffOps.digest.testSent', { count: res.total }));
    } catch (err) {
      toastError(err);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Panel title={t('staffOps.digest.title')} icon={Mail}>
      <p className="text-sm text-muted">{t('staffOps.digest.text')}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          {t('staffOps.digest.toggle')}
          {data && <Switch checked={data.enabled} disabled={saving} onChange={(v) => void set(v)} label={t('staffOps.digest.toggle')} />}
        </span>
        <button type="button" className="btn-secondary btn-sm" onClick={() => void test()} disabled={testing}>
          {testing ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />} {t('staffOps.digest.test')}
        </button>
      </div>
      {data && !data.emailNotifications && (
        <p className="mt-4 rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-sm leading-relaxed text-warning-fg">{t('staffOps.digest.emailOff')}</p>
      )}
    </Panel>
  );
};
