import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Languages } from 'lucide-react';
import clsx from 'clsx';
import { isHydrating } from '@/lib/ssr';
import { registerCopy } from '@/i18n';
import { worldCopy } from '@/i18n/world';
import { berlinDay, isDay, phraseForDay } from './dailyPhrase';
import type { Phrase } from './phrases';
import { INTL_LOCALE, useWorldLang, type WorldLang } from './locale';
import { formatAzDayUtc } from '@/lib/azIntl';
import { ListenButton } from './ListenButton';

export { ListenButton };

registerCopy(worldCopy);

/**
 * Today's day in Germany ("YYYY-MM-DD"), fixed for the lifetime of the component. While a server-rendered page is
 * hydrated it takes the day the server rendered (data-phrase-day in the markup), so a page rendered just before
 * midnight and hydrated just after it never mismatches; afterwards it is the browser's day in Europe/Berlin.
 */
export const usePhraseDay = (): string => {
  const [day] = useState(() => {
    if (!import.meta.env.SSR && isHydrating() && typeof document !== 'undefined') {
      const rendered = document.querySelector('[data-phrase-day]')?.getAttribute('data-phrase-day');
      if (isDay(rendered)) return rendered;
    }
    return berlinDay(new Date());
  });
  return day;
};

/** Pronunciation aid shown in the site language: Latin (az) for az / tr readers, Cyrillic for ru / uk readers. */
export const pronFor = (p: Phrase, lang: WorldLang): string | null => (lang === 'az' || lang === 'tr' ? p.pron.az : lang === 'ru' || lang === 'uk' ? p.pron.ru : null);

/** Meaning in the site language (German visitors get the German explanation). */
export const meaningFor = (p: Phrase, lang: WorldLang): string => (lang === 'de' ? p.deNote : p[lang]);

export const formatDay = (day: string, lang: WorldLang, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) => {
  const d = new Date(`${day}T12:00:00Z`);
  // Azerbaijani: written out by hand, so the server (Node ICU) and Chrome (lib/azIntl polyfill) print the same text.
  if (lang === 'az' && (opts.month === 'long' || opts.month === 'short') && (opts.weekday === undefined || opts.weekday === 'long' || opts.weekday === 'short'))
    return formatAzDayUtc(d, { weekday: opts.weekday as 'long' | 'short' | undefined, month: opts.month, year: !!opts.year });
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], { ...opts, timeZone: 'UTC' }).format(d);
};

/** One phrase: German (lang="de"), pronunciation, meaning, German hint, topic, listen. */
export const PhraseBody = ({ phrase, size = 'lg' }: { phrase: Phrase; size?: 'lg' | 'md' }) => {
  const { t } = useTranslation();
  const lang = useWorldLang();
  const pron = pronFor(phrase, lang);
  return (
    <div className="min-w-0">
      <p lang="de" className={clsx('font-display font-semibold text-ink', size === 'lg' ? 'text-2xl leading-tight sm:text-3xl' : 'text-lg leading-snug')}>
        {phrase.de}
      </p>
      {pron && (
        <p className="mt-1 text-sm text-muted">
          <span className="sr-only">{t('world.phrase.pron')}: </span>[{pron}]
        </p>
      )}
      <p className={clsx('text-ink', size === 'lg' ? 'mt-3 text-base' : 'mt-1.5 text-sm')}>{meaningFor(phrase, lang)}</p>
      {lang !== 'de' && (
        <p lang="de" className="mt-1 text-xs text-muted">
          {phrase.deNote}
        </p>
      )}
    </div>
  );
};

/**
 * Home / portal card: today's German phrase (chosen by the day in Germany, the same for every visitor and for
 * the server render), with "listen" (browser voice, only when a German voice exists) and the archive link.
 */
export const PhraseOfDayCard = ({ className, archiveLink = true }: { className?: string; archiveLink?: boolean }) => {
  const { t } = useTranslation();
  const lang = useWorldLang();
  const day = usePhraseDay();
  const phrase = phraseForDay(day);
  return (
    <div className={clsx('card flex h-full flex-col rounded-3xl p-5 sm:p-6', className)} data-phrase-day={day}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="eyebrow flex items-center gap-2">
          <Languages className="size-3.5" aria-hidden /> {t('world.phrase.eyebrow')}
        </h2>
        <span className="badge shrink-0 bg-sunken text-muted">{t(`world.phrase.topics.${phrase.topic}`)}</span>
      </div>
      <p className="mt-1 text-xs text-muted">{formatDay(day, lang)}</p>
      <div className="mt-4">
        <PhraseBody phrase={phrase} />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
        <ListenButton text={phrase.de} />
        {archiveLink && (
          <Link to="/phrase-of-the-day" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-link hover:underline">
            {t('world.phrase.archive')} <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
};

export default PhraseOfDayCard;
