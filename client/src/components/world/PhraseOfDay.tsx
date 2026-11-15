import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Languages, Square, Volume2 } from 'lucide-react';
import clsx from 'clsx';
import { isHydrating } from '@/lib/ssr';
import { registerCopy } from '@/i18n';
import { worldCopy } from '@/i18n/world';
import { berlinDay, isDay, phraseForDay } from './dailyPhrase';
import type { Phrase } from './phrases';
import { INTL_LOCALE, useWorldLang, type WorldLang } from './locale';

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

/** The browser's German voice (speechSynthesis), or null — then the "listen" button stays hidden. */
const useGermanVoice = () => {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    const pick = () => {
      const voices = synth.getVoices();
      setVoice(voices.find((v) => v.lang?.toLowerCase().replace('_', '-') === 'de-de') ?? voices.find((v) => v.lang?.toLowerCase().startsWith('de')) ?? null);
    };
    pick();
    synth.addEventListener?.('voiceschanged', pick);
    return () => {
      synth.removeEventListener?.('voiceschanged', pick);
      synth.cancel();
    };
  }, []);
  return voice;
};

/** "Listen": reads the German phrase with a German voice. Keeps its space when there is none (no layout shift). */
export const ListenButton = ({ text, className }: { text: string; className?: string }) => {
  const { t } = useTranslation();
  const voice = useGermanVoice();
  const [speaking, setSpeaking] = useState(false);
  const toggle = useCallback(() => {
    const synth = window.speechSynthesis;
    if (!voice || !synth) return;
    synth.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text.replace(/…/g, ''));
    u.voice = voice;
    u.lang = voice.lang || 'de-DE';
    u.rate = 0.85;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(u);
  }, [speaking, text, voice]);

  return (
    <button
      type="button"
      onClick={toggle}
      className={clsx(
        'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-card px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-sunken',
        !voice && 'invisible',
        className,
      )}
      aria-pressed={speaking}
    >
      {speaking ? <Square className="size-3.5" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
      {t(speaking ? 'world.phrase.stop' : 'world.phrase.listen')}
    </button>
  );
};

/** Pronunciation aid shown in the site language: Latin (az) for az / tr readers, Cyrillic for ru / uk readers. */
export const pronFor = (p: Phrase, lang: WorldLang): string | null => (lang === 'az' || lang === 'tr' ? p.pron.az : lang === 'ru' || lang === 'uk' ? p.pron.ru : null);

/** Meaning in the site language (German visitors get the German explanation). */
export const meaningFor = (p: Phrase, lang: WorldLang): string => (lang === 'de' ? p.deNote : p[lang]);

export const formatDay = (day: string, lang: WorldLang, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) =>
  new Intl.DateTimeFormat(INTL_LOCALE[lang], { ...opts, timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

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
