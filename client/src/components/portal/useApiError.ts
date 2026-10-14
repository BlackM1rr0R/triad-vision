import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorCode } from '@/lib/api';

/** Translated message for a server error: portal.errors.CODE when it exists, else the generic error text. */
export const useErrorMessage = () => {
  const { t, i18n } = useTranslation();
  return useCallback(
    (err: unknown) => {
      const key = `portal.errors.${errorCode(err)}`;
      return i18n.exists(key) ? t(key) : t('common.error');
    },
    [t, i18n],
  );
};

/** Shows a server error as a toast, using the translated message. */
export const useApiError = () => {
  const message = useErrorMessage();
  return useCallback((err: unknown) => toast.error(message(err)), [message]);
};
