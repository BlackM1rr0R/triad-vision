import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { Switch } from '@/components/admin/ui';
import { toastError } from '@/components/admin/labels';
import { useAiStatus } from './shared';

/** ADMIN+: whether employers may use the AI vacancy writer in their portal (Setting "ai.employerTools"). */
export const EmployerAiToggle = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const status = useAiStatus('staff');
  if (!hasMinRole(user?.role, 'ADMIN') || !status.data) return null;
  const set = async (companyEnabled: boolean) => {
    try {
      await api.put('/admin/ai/employer/settings', { companyEnabled });
      qc.setQueryData(['ai-employer-status', 'staff'], { ...status.data, companyEnabled });
      toast.success(t('aiEmployer.settings.saved'));
    } catch (err) {
      toastError(err);
    }
  };
  return (
    <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-white px-2.5 text-xs text-ink/80">
      <Sparkles className="size-3.5 text-brand-600" aria-hidden />
      <span className="hidden sm:inline">{t('aiEmployer.settings.companyToggle')}</span>
      <Switch checked={!!status.data.companyEnabled} onChange={(v) => void set(v)} label={t('aiEmployer.settings.companyToggle')} />
    </span>
  );
};
