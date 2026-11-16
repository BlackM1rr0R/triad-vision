import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Code2 } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesEmbeds } from '@/i18n/pagesEmbeds';

registerCopy(pagesEmbeds);

/** "Add these tools to your website" — link to the widget configurator (/widgets), used under the tools hub. */
export const WidgetsLink = () => {
  const { t } = useTranslation();
  return (
    <p className="mb-6 text-center">
      <Link to="/widgets" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link hover:underline">
        <Code2 className="size-4" aria-hidden /> {t('embeds.toolsLink')}
      </Link>
    </p>
  );
};
