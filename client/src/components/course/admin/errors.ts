import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorCode } from '@/lib/api';

/** Toast for a course-admin API error: courseAdmin.errors.CODE, then admin.errors.CODE, then the generic text. */
export const useCourseError = () => {
  const { t, i18n } = useTranslation();
  return (err: unknown) => {
    const code = errorCode(err);
    toast.error(i18n.exists(`courseAdmin.errors.${code}`) ? t(`courseAdmin.errors.${code}`) : i18n.exists(`admin.errors.${code}`) ? t(`admin.errors.${code}`) : t('common.error'));
  };
};
