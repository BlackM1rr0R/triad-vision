import { useL10n } from '@/lib/l10n';
import { PreviewTranslation } from './PartyThread';
import { LANGS, type Lang } from './useTranslations';

/**
 * Staff composing in the case chat: "preview translation" into the client's language, shown only when
 * the client reads another language than the staff member writes in.
 */
export const CaseDraftPreview = ({ text, clientLocale }: { text: string; clientLocale: string }) => {
  const { locale } = useL10n();
  const target = (LANGS as string[]).includes(clientLocale) ? (clientLocale as Lang) : null;
  if (!target || target === locale) return null;
  return (
    <div className="px-3 pt-2 sm:px-4">
      <PreviewTranslation text={text} defaultTarget={target} />
    </div>
  );
};
