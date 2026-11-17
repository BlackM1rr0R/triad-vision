import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesPocketGuide } from '@/i18n/pagesPocketGuide';
import { PocketDownloads } from '@/pages/tools/PocketGuide';

registerCopy(pagesPocketGuide);

/**
 * /account/pocket-guide — the personalised Germany pocket guide (GET /api/pocket-guide/mine): the client's name,
 * employer name / address and the Bürgeramt link of the city from the approved case. Built on demand, never stored.
 */
export default function AccountPocketGuide() {
  const { t } = useTranslation();
  usePageTitle(t('pocketGuide.portalTitle'));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="type-page-title flex items-center gap-2 text-ink">
          <BookOpen className="size-6 text-primary" aria-hidden /> {t('pocketGuide.portalTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('pocketGuide.portalSubtitle')}</p>
      </header>
      <section className="card card-pad rounded-3xl">
        <PocketDownloads mine />
        <p className="mt-4 text-xs text-muted">{t('pocketGuide.portalNote')}</p>
      </section>
    </div>
  );
}
