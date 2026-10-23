import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Globe, Pause, Play } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesMessagingPlus } from '@/i18n/pagesMessagingPlus';
import { translatableText, voiceUrl, type MessageTranslations, type VoiceInfo } from './useTranslations';

registerCopy(pagesMessagingPlus);

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * A message text in the reader's language with the "🌐 Translated · Show original" toggle. With
 * "show originals" on (or no translation yet) the original is shown, with "Translate" on demand.
 */
export const TranslatedText = ({
  id,
  text,
  lang,
  tx,
  onDark,
  className,
}: {
  id: string;
  text: string;
  lang: string | null | undefined;
  tx?: MessageTranslations;
  onDark?: boolean;
  className?: string;
}) => {
  const { t } = useTranslation();
  const translation = tx?.translations[id];
  const differs = !!translation && translation.text.trim() !== text.trim();
  const [original, setOriginal] = useState<boolean | null>(null);
  const showOriginal = original ?? !!tx?.showOriginals;
  const canRequest = !!tx && !translation && tx.needs({ id, text, lang: lang as never }) && (tx.showOriginals || !!tx.unavailable);
  const meta = clsx('mt-1 inline-flex flex-wrap items-center gap-1 text-[11px]', onDark ? 'text-white/75' : 'text-muted');
  const link = clsx('font-semibold underline-offset-2 hover:underline', onDark ? 'text-white' : 'text-brand-700');
  return (
    <div className={className}>
      <p className="break-words whitespace-pre-wrap" lang={differs && !showOriginal ? translation!.lang : (lang ?? undefined)}>
        {differs && !showOriginal ? translation!.text : text}
      </p>
      {differs && (
        <p className={meta}>
          <Globe className="size-3" aria-hidden />
          {showOriginal ? t('msgPlus.tr.original', { lang: t(`msgPlus.tr.lang.${lang ?? 'az'}`) }) : t('msgPlus.tr.translated')} ·
          <button type="button" className={link} onClick={() => setOriginal(!showOriginal)} aria-pressed={showOriginal}>
            {showOriginal ? t('msgPlus.tr.showTranslation') : t('msgPlus.tr.showOriginal')}
          </button>
        </p>
      )}
      {canRequest && (
        <p className={meta}>
          <Globe className="size-3" aria-hidden />
          <button
            type="button"
            className={link}
            onClick={() => {
              setOriginal(false);
              tx!.request(id);
            }}
          >
            {t('msgPlus.tr.translate')}
          </button>
        </p>
      )}
    </div>
  );
};

/** Deterministic bar heights for the "waveform-lite" of a clip. */
const barsFor = (id: string, n = 28) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: n }, (_, i) => {
    h = (h * 1103515245 + 12345 + i) >>> 0;
    return 30 + (h % 70);
  });
};

/** Voice message: play/pause, simple bar waveform with progress, duration. */
export const VoicePlayer = ({ voice, onDark }: { voice: VoiceInfo; onDark?: boolean }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const bars = useMemo(() => barsFor(voice.id), [voice.id]);
  const total = voice.durationMs;
  const progress = total ? Math.min(1, pos / total) : 0;

  useEffect(() => {
    const a = ref.current;
    return () => a?.pause();
  }, []);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setPlaying(false));
    else a.pause();
  };

  return (
    <div className="flex min-w-[13rem] items-center gap-2.5" role="group" aria-label={t('msgPlus.voice.label')}>
      <button
        type="button"
        onClick={toggle}
        className={clsx('grid size-9 shrink-0 place-items-center rounded-full', onDark ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-brand-600 text-white hover:bg-brand-700')}
        aria-label={playing ? t('msgPlus.voice.pause') : t('msgPlus.voice.play')}
      >
        {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
      </button>
      <div
        className="flex h-7 flex-1 cursor-pointer items-center gap-[2px]"
        onClick={(e) => {
          const a = ref.current;
          if (!a || !total) return;
          const r = e.currentTarget.getBoundingClientRect();
          a.currentTime = ((e.clientX - r.left) / r.width) * (total / 1000);
        }}
        aria-hidden
      >
        {bars.map((h, i) => (
          <span
            key={i}
            className={clsx('w-[3px] flex-1 rounded-full', i / bars.length < progress ? (onDark ? 'bg-white' : 'bg-brand-600') : onDark ? 'bg-white/40' : 'bg-slate-300')}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <span className={clsx('w-9 shrink-0 text-right text-[11px] tabular-nums', onDark ? 'text-white/80' : 'text-muted')}>{fmt(playing || pos ? pos : total)}</span>
      <audio
        ref={ref}
        src={voice.url ?? voiceUrl(voice)}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPos(0);
        }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime * 1000)}
      />
    </div>
  );
};

/** Text and / or voice of a chat message, translated for the reader. */
export const MessageBody = ({
  m,
  tx,
  onDark,
}: {
  m: { id: string; body?: string | null; lang?: string | null; voice?: VoiceInfo | null };
  tx?: MessageTranslations;
  onDark?: boolean;
}) => {
  const { t } = useTranslation();
  const v = m.voice;
  if (!v) return <TranslatedText id={m.id} text={m.body ?? ''} lang={m.lang} tx={tx} onDark={onDark} />;
  const transcript = translatableText({ voice: v });
  const status = v.transcriptStatus;
  return (
    <div className="space-y-1.5">
      <VoicePlayer voice={v} onDark={onDark} />
      {transcript ? (
        <TranslatedText id={m.id} text={transcript} lang={m.lang ?? v.transcriptLang} tx={tx} onDark={onDark} className="text-[13px] italic" />
      ) : (
        <p className={clsx('text-[11px]', onDark ? 'text-white/70' : 'text-muted')}>
          {status === 'PENDING'
            ? t('msgPlus.voice.transcriptPending')
            : status === 'NOT_CONFIGURED'
              ? t('msgPlus.voice.transcriptOff')
              : status === 'EMPTY'
                ? t('msgPlus.voice.transcriptEmpty')
                : t('msgPlus.voice.transcriptFailed')}
        </p>
      )}
      {m.body ? <TranslatedText id={m.id} text={m.body} lang={m.lang} tx={tx} onDark={onDark} /> : null}
    </div>
  );
};

/** Subtle note shown once per thread when the AI cannot translate right now. */
export const TranslationNote = ({ tx }: { tx: MessageTranslations }) => {
  const { t } = useTranslation();
  if (!tx.unavailable || tx.showOriginals) return null;
  return (
    <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted" role="status">
      <Globe className="size-3" aria-hidden /> {t('msgPlus.tr.unavailable')}
    </p>
  );
};

/** "Show messages in their original language" switch (per user). */
export const ShowOriginalsToggle = ({ tx, setter }: { tx: MessageTranslations; setter: (v: boolean) => void }) => {
  const { t } = useTranslation();
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-muted" title={t('msgPlus.tr.showOriginalsHint')}>
      <input type="checkbox" className="size-3.5 accent-brand-600" checked={tx.showOriginals} onChange={(e) => setter(e.target.checked)} />
      {t('msgPlus.tr.showOriginalsPref')}
    </label>
  );
};
