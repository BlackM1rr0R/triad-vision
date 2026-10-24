import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { ModuleFlags, ModuleKey } from '@/components/command/navRegistry';
import { useSetModulesCache } from '@/components/command/navPrefs';

/** Saves module flags (SUPER_ADMIN) and updates the navigation cache, so menu and Ctrl+K follow at once. */
export const useSaveModules = () => {
  const { t } = useTranslation();
  const setCache = useSetModulesCache();
  return useMutation({
    mutationFn: async (patch: Partial<Record<ModuleKey, boolean>>) => (await api.put<{ modules: ModuleFlags }>('/admin/nav/modules', { modules: patch })).data.modules,
    onSuccess: (modules) => {
      setCache(modules);
      toast.success(t('anav.modulesPage.saved'));
    },
    onError: () => toast.error(t('anav.modulesPage.failed')),
  });
};
