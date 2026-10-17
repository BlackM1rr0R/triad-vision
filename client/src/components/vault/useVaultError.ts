import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorCode } from '@/lib/api';
import './api';

/** Server error → toast: vault.errors.CODE, then portal.errors.CODE, then the generic text. */
export const useVaultError = () => {
  const { t, i18n } = useTranslation();
  return useCallback(
    (err: unknown) => {
      const code = errorCode(err);
      const key = [`vault.errors.${code}`, `portal.errors.${code}`].find((k) => i18n.exists(k));
      toast.error(key ? t(key) : t('common.error'));
    },
    [t, i18n],
  );
};
