import { toast } from 'sonner';
import i18n from 'i18next';
import { errorCode } from '@/lib/api';

/** Error text of the team features (codes under team.errors.*, generic fallback). */
export const teamErrorText = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`team.errors.${code}`) ? i18n.t(`team.errors.${code}`) : i18n.t('team.errors.generic');
};

export const toastTeamError = (err: unknown) => {
  toast.error(teamErrorText(err));
};
