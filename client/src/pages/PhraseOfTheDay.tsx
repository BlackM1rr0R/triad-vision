import { useTranslation } from 'react-i18next';
import { PageHero } from '@/components/layout/PageHero';
import { Learning } from '@/components/illustrations';
import { PageCta } from '@/components/visa/PageCta';
import { formatDay, ListenButton, PhraseBody, PhraseOfDayCard, usePhraseDay } from '@/components/world/PhraseOfDay';
import { recentPhrases } from '@/components/world/dailyPhrase';
import { useWorldLang } from '@/components/world/locale';
import { registerCopy } from '@/i18n';
import { worldCopy } from '@/i18n/world';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(worldCopy);

const ARCHIVE_DAYS = 30;

/**
 * /phrase-of-the-day: today's German phrase and the phrases of the last 30 days (static list, picked by the day
 * in Germany — components/world/dailyPhrase.ts), server-rendered and indexable (SEO texts: seoCatalogue.ts).
 */
export default function PhraseOfTheDayPage() {
  const { t } = useTranslation();
  const lang = useWorldLang();
  usePageTitle(t('world.phrase.pageTitle'));
  const today = usePhraseDay();
  const past = recentPhrases(today, ARCHIVE_DAYS + 1).slice(1);

  return (
    <>
      <PageHero title={t('world.phrase.pageTitle')} subtitle={t('world.phrase.pageSubtitle')} illustration={<Learning className="w-full" />} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x max-w-4xl">
          <PhraseOfDayCard archiveLink={false} />
          <h2 className="mt-12 text-xl font-semibold text-ink">{t('world.phrase.recent')}</h2>
          <ol className="mt-4 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card shadow-[var(--tv-shadow-card)]">
            {past.map(({ day, phrase }) => (
              <li key={day} id={phrase.id} className="grid gap-3 p-5 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-start sm:gap-5">
                <p className="text-sm text-muted">
                  <time dateTime={day}>{formatDay(day, lang, { weekday: 'short', day: 'numeric', month: 'long' })}</time>
                  <span className="mt-1 block text-xs">{t(`world.phrase.topics.${phrase.topic}`)}</span>
                </p>
                <PhraseBody phrase={phrase} size="md" />
                <ListenButton text={phrase.de} className="justify-self-start" />
              </li>
            ))}
          </ol>
        </div>
      </section>
      <PageCta title={t('world.phrase.practice')} text={t('world.phrase.pageSubtitle')} primary={{ to: '/account/german', label: t('world.phrase.practice') }} secondary={{ to: '/booking', label: t('nav.contact') }} />
    </>
  );
}
