import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import clsx from 'clsx';
import { Download, Share2, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getBrand } from '@/lib/brand';
import { usePageTitle } from '@/lib/usePageTitle';
import { useMotionOK } from '@/components/motion';
import { Spinner } from '@/components/ui/Spinner';
import { StoryNumber, StoryPlayer, type StorySlide } from '@/components/story/StoryPlayer';
import { registerCopy } from '@/i18n';
import { pagesVisaStory } from '@/i18n/pagesVisaStory';

registerCopy(pagesVisaStory);

/** GET /api/account/visa-story/:caseId (server lib/visaStory/service.ts). */
interface VisaStoryData {
  caseId: string;
  firstName: string | null;
  registeredAt: string;
  approvedAt: string;
  /** Signing date of the work contract (null while unknown). */
  contractSignedAt?: string | null;
  days: number;
  profession: string | null;
  visaLine: string;
  documents: { uploaded: number; approved: number };
  messages: { total: number; fromYou: number; fromTeam: number };
  staffFirstName: string | null;
  destination: { city: string | null; km: number | null };
  german: { from: string | null; to: string | null; steps: number; wordsLearned: number; reviews: number; bestStreak: number };
  funFact:
    | { key: 'words'; perWeek: number; words: number }
    | { key: 'walk'; walkDays: number; km: number }
    | { key: 'messages'; perWeek: number; messages: number }
    | { key: 'docs'; docs: number }
    | { key: 'days'; weekends: number; days: number };
}

const LANGS = ['az', 'de', 'en', 'ru'] as const;
type Lang = (typeof LANGS)[number];
const LANG_NAMES: Record<Lang, string> = { az: 'Azərbaycanca', de: 'Deutsch', en: 'English', ru: 'Русский' };
const ANON: Record<Lang, string> = { az: 'Triad Vision müştərisi', de: 'Ein Triad Vision Kunde', en: 'A Triad Vision client', ru: 'Клиент Triad Vision' };
type NameStyle = 'first' | 'initials' | 'anonymous';

/** Interview-prep "practised" marks of this browser (components/prep/usePractised, same key). */
const practisedCount = () => {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem('tv.interviewPrep.practised.v1') ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').length : 0;
  } catch {
    return 0;
  }
};

const Kicker = ({ children }: { children: React.ReactNode }) => <p className="text-sm font-bold uppercase tracking-widest text-amber-300">{children}</p>;
const Big = ({ value, unit }: { value: number; unit: string }) => (
  <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
    <StoryNumber value={value} duration={1200} className="font-display text-7xl font-extrabold tabular-nums leading-none sm:text-8xl" />
    <span className="text-2xl font-semibold text-white/90">{unit}</span>
  </p>
);

/** The journey film: the recap lines appear one after the other (all at once with reduced motion). */
const FilmSteps = ({ steps }: { steps: { label: string; value?: string }[] }) => {
  const motionOK = useMotionOK();
  return (
    <ol className="mt-6 space-y-4">
      {steps.map((s, i) => (
        <motion.li
          key={s.label}
          initial={motionOK ? { opacity: 0, x: -24 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: motionOK ? 0.5 + i * 0.9 : 0, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-4"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/20 text-sm font-bold" aria-hidden>
            {i + 1}
          </span>
          <span className="min-w-0">
            {s.value ? (
              <>
                <span className="block text-sm text-white/80">{s.label}</span>
                <span className="block font-display text-2xl font-bold leading-tight">{s.value}</span>
              </>
            ) : (
              <span className="block font-display text-2xl font-bold leading-tight">{s.label}</span>
            )}
          </span>
        </motion.li>
      ))}
    </ol>
  );
};

/** Decorative flight from Baku to the destination (static with reduced motion). */
const FlightArc = ({ city }: { city: string }) => {
  const motionOK = useMotionOK();
  return (
    <svg viewBox="0 0 320 160" className="mt-6 w-full" aria-hidden>
      <motion.path
        d="M290 130 C 220 20, 110 10, 30 60"
        fill="none"
        stroke="white"
        strokeOpacity="0.7"
        strokeWidth="3"
        strokeDasharray="6 8"
        strokeLinecap="round"
        initial={motionOK ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.6, ease: 'easeInOut' }}
      />
      <circle cx="290" cy="130" r="7" fill="#fbbf24" />
      <circle cx="30" cy="60" r="7" fill="#f472b6" />
      <text x="290" y="154" textAnchor="middle" fontSize="13" fill="white" fontWeight="700">
        Bakı
      </text>
      <text x="30" y="88" textAnchor="middle" fontSize="13" fill="white" fontWeight="700">
        {city}
      </text>
      <text x="160" y="40" textAnchor="middle" fontSize="26">
        ✈
      </text>
    </svg>
  );
};

/** Last slide: the private share card (server-rendered PNG, nothing public). */
const ShareSlide = ({ caseId }: { caseId: string }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const p = (k: string, o?: Record<string, unknown>) => String(t(`vstory.share.${k}`, o));
  const ui = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const [format, setFormat] = useState<'story' | 'square'>('story');
  const [nameStyle, setNameStyle] = useState<NameStyle>('first');
  const [lang, setLang] = useState<Lang>((LANGS as readonly string[]).includes(ui) ? (ui as Lang) : 'en');
  const [image, setImage] = useState<{ url: string; blob: Blob; key: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const ids = { name: useId(), lang: useId() };
  const key = `${format}:${nameStyle}:${lang}`;
  useEffect(() => () => (image ? URL.revokeObjectURL(image.url) : undefined), [image]);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/account/visa-story/${encodeURIComponent(caseId)}/card/${format}.png?name=${nameStyle}&lang=${lang}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      setImage({ url: URL.createObjectURL(blob), blob, key });
    } catch {
      toast.error(p('error'));
    } finally {
      setLoading(false);
    }
  };
  const fileName = `triad-vision-visa-story-${format}.png`;
  const file = image ? new File([image.blob], fileName, { type: 'image/png' }) : null;
  const canShare = !!file && typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] });
  const download = () => {
    if (!image) return;
    const a = document.createElement('a');
    a.href = image.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: getBrand().name, text: p('shareText') });
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') toast.error(p('error'));
    }
  };
  const first = user?.firstName.trim().split(/\s+/)[0] ?? '';
  const initials = [user?.firstName ?? '', user?.lastName ?? '']
    .map((s) => s.trim()[0]?.toLocaleUpperCase(lang))
    .filter(Boolean)
    .map((c) => `${c}.`)
    .join(' ');
  const stale = !image || image.key !== key;
  const pill = (on: boolean) => clsx('min-h-10 rounded-full px-4 text-sm font-semibold', on ? 'bg-white text-violet-900' : 'text-white/85 hover:text-white');

  return (
    <div className="space-y-4">
      <Kicker>{p('kicker')}</Kicker>
      <h2 className="font-display text-3xl font-bold">{p('title')}</h2>
      <p className="text-white/85">{p('text')}</p>
      <div role="group" aria-label={p('format')} className="inline-flex rounded-full bg-white/15 p-1">
        {(['story', 'square'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)} className={pill(format === f)}>
            {p(f)}
          </button>
        ))}
      </div>
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm font-semibold">{p('name')}</legend>
        {(
          [
            ['first', p('nameFirst', { name: first })],
            ['initials', p('nameInitials', { name: initials })],
            ['anonymous', p('nameAnonymous', { name: ANON[lang] })],
          ] as const
        ).map(([v, label]) => (
          <label key={v} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name={ids.name} checked={nameStyle === v} onChange={() => setNameStyle(v)} className="size-4 accent-amber-400" />
            {label}
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor={ids.lang} className="mb-1 block text-sm font-semibold">
          {p('language')}
        </label>
        <select id={ids.lang} value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="min-h-11 w-full rounded-xl border border-white/30 bg-white/10 px-3 text-white [&>option]:text-black">
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {LANG_NAMES[l]}
            </option>
          ))}
        </select>
      </div>
      <p className="rounded-xl bg-black/20 p-3 text-xs text-white/85">{p('privacy')}</p>
      <div className="flex flex-wrap gap-2">
        {stale ? (
          <button type="button" onClick={() => void generate()} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-400 px-5 font-semibold text-violet-950 hover:bg-amber-300 disabled:opacity-60">
            {loading ? <Spinner className="size-4" /> : <Sparkles className="size-4" aria-hidden />} {loading ? p('loading') : p('generate')}
          </button>
        ) : (
          <>
            {canShare && (
              <button type="button" onClick={() => void share()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-400 px-5 font-semibold text-violet-950 hover:bg-amber-300">
                <Share2 className="size-4" aria-hidden /> {p('share')}
              </button>
            )}
            <button type="button" onClick={download} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/15 px-5 font-semibold hover:bg-white/25">
              <Download className="size-4" aria-hidden /> {p('download')}
            </button>
          </>
        )}
      </div>
      {image && <img src={image.url} alt={p('previewAlt')} width={1080} height={image.key.startsWith('story') ? 1920 : 1080} className={clsx('h-auto rounded-xl shadow-lg', image.key.startsWith('story') ? 'w-40' : 'w-56', stale && 'opacity-50')} />}
    </div>
  );
};

/**
 * /account/visa-story/:caseId — "Your visa story" (Triad Wrapped): full-screen slides from the client's real numbers
 * (server lib/visaStory) once the visa is approved. Closing goes back to the application.
 */
export default function VisaStoryPage() {
  const { caseId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  usePageTitle(t('vstory.pageTitle'));
  const lang = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['account', 'visa-story', caseId, lang],
    queryFn: async () => (await api.get<VisaStoryData>(`/account/visa-story/${encodeURIComponent(caseId)}`, { params: { lang: (LANGS as readonly string[]).includes(lang) ? lang : 'en' } })).data,
    retry: false,
  });
  const [prep] = useState(practisedCount);
  const close = () => navigate(`/account/cases/${encodeURIComponent(caseId)}`);

  const slides = useMemo<StorySlide[]>(() => {
    if (!data) return [];
    const date = (iso: string) => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'az', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
    const v = (k: string, o?: Record<string, unknown>) => String(t(`vstory.${k}`, o));
    const city = data.destination.city;
    const out: StorySlide[] = [
      {
        key: 'intro',
        bg: 'from-indigo-800 via-violet-700 to-fuchsia-600',
        content: (
          <>
            <Kicker>{v('intro.kicker')}</Kicker>
            <h2 className="mt-3 font-display text-4xl font-extrabold leading-tight sm:text-5xl">{v('intro.title', { name: data.firstName ?? '' })}</h2>
            <p className="mt-4 text-lg text-white/90">{[data.visaLine, data.profession].filter(Boolean).join(' · ')}</p>
            <p className="mt-8 text-sm text-white/75">{v('intro.subtitle')}</p>
          </>
        ),
      },
      {
        key: 'days',
        bg: 'from-sky-700 via-indigo-700 to-violet-800',
        content: (
          <>
            <Kicker>{v('days.kicker')}</Kicker>
            <Big value={data.days} unit={v('days.unit')} />
            <p className="mt-4 text-lg text-white/90">{v('days.text', { from: date(data.registeredAt), to: date(data.approvedAt) })}</p>
            {data.days >= 14 && <p className="mt-3 text-white/80">{v('days.weeks', { weeks: Math.round(data.days / 7) })}</p>}
          </>
        ),
      },
      {
        key: 'docs',
        bg: 'from-emerald-700 via-teal-700 to-cyan-800',
        content: (
          <>
            <Kicker>{v('docs.kicker')}</Kicker>
            <Big value={data.documents.uploaded} unit={v('docs.unit')} />
            {data.documents.approved > 0 && <p className="mt-4 text-lg text-white/90">{v('docs.approved', { count: data.documents.approved })}</p>}
          </>
        ),
      },
      {
        key: 'messages',
        bg: 'from-rose-700 via-pink-700 to-orange-600',
        content: (
          <>
            <Kicker>{v('messages.kicker')}</Kicker>
            <Big value={data.messages.total} unit={v('messages.unit')} />
            {data.messages.total > 0 && <p className="mt-4 text-lg text-white/90">{v('messages.split', { you: data.messages.fromYou, team: data.messages.fromTeam })}</p>}
            <p className="mt-6 rounded-2xl bg-white/15 p-4 text-lg font-semibold">{data.staffFirstName ? v('messages.staff', { name: data.staffFirstName }) : v('messages.noStaff')}</p>
          </>
        ),
      },
      {
        key: 'distance',
        bg: 'from-blue-800 via-sky-700 to-amber-600',
        content:
          data.destination.km !== null && city ? (
            <>
              <Kicker>{v('distance.kicker')}</Kicker>
              <Big value={data.destination.km} unit={v('distance.unit')} />
              <p className="mt-4 text-lg text-white/90">{v('distance.text', { city })}</p>
              <FlightArc city={city} />
            </>
          ) : (
            <>
              <Kicker>{v('distance.kicker')}</Kicker>
              <h2 className="mt-3 font-display text-4xl font-extrabold">{v('distance.noCity')}</h2>
              <p className="mt-4 text-white/85">{v('distance.noCityText')}</p>
            </>
          ),
      },
      {
        key: 'german',
        bg: 'from-neutral-900 via-red-800 to-amber-600',
        content: (
          <>
            <Kicker>{v('german.kicker')}</Kicker>
            {data.german.to ? (
              <p className="mt-3 font-display text-6xl font-extrabold">{data.german.from && data.german.from !== data.german.to ? v('german.levels', { from: data.german.from, to: data.german.to }) : v('german.level', { to: data.german.to })}</p>
            ) : (
              <h2 className="mt-3 font-display text-3xl font-bold">{v('german.none')}</h2>
            )}
            <ul className="mt-6 space-y-2 text-lg">
              {data.german.wordsLearned > 0 && <li>📚 {v('german.words', { count: data.german.wordsLearned })}</li>}
              {data.german.bestStreak > 1 && <li>🔥 {v('german.streak', { count: data.german.bestStreak })}</li>}
            </ul>
          </>
        ),
      },
    ];
    if (prep > 0) {
      out.push({
        key: 'prep',
        bg: 'from-violet-800 via-purple-700 to-indigo-700',
        content: (
          <>
            <Kicker>{v('prep.kicker')}</Kicker>
            <Big value={prep} unit={v('prep.unit')} />
            <p className="mt-4 text-white/85">{v('prep.text')}</p>
          </>
        ),
      });
    }
    const f = data.funFact;
    const funText =
      f.key === 'walk' ? (city ? v('fun.walk', { walkDays: f.walkDays, city }) : v('fun.walkNoCity', { walkDays: f.walkDays })) : f.key === 'words' ? v('fun.words', f) : f.key === 'messages' ? v('fun.messages', f) : f.key === 'docs' ? v('fun.docs', f) : v('fun.days', f);
    out.push(
      {
        key: 'fun',
        bg: 'from-amber-500 via-orange-600 to-pink-600',
        content: (
          <>
            <Kicker>{v('fun.kicker')}</Kicker>
            <p className="mt-4 font-display text-3xl font-bold leading-snug sm:text-4xl">{funText}</p>
          </>
        ),
      },
      {
        key: 'film',
        bg: 'from-slate-900 via-indigo-900 to-violet-800',
        content: (
          <>
            <Kicker>{v('film.kicker')}</Kicker>
            <FilmSteps
              steps={[
                { label: v('film.registered'), value: date(data.registeredAt) },
                { label: v('film.docs', { count: data.documents.uploaded }) },
                ...(data.contractSignedAt ? [{ label: v('film.contract'), value: date(data.contractSignedAt) }] : []),
                { label: v('film.visa'), value: date(data.approvedAt) },
                { label: v('film.total', { count: data.days }) },
              ]}
            />
          </>
        ),
      },
      { key: 'share', bg: 'from-indigo-900 via-violet-800 to-fuchsia-700', interactive: true, content: <ShareSlide caseId={data.caseId} /> },
    );
    return out;
  }, [data, prep, t, i18n.resolvedLanguage]);

  if (isLoading)
    return (
      <p className="flex items-center gap-2 p-6 text-muted" role="status">
        <Spinner className="size-4" /> {t('vstory.loading')}
      </p>
    );
  if (isError || !data)
    return (
      <div className="space-y-3 p-6">
        <p className="text-danger">{t('vstory.error')}</p>
        <Link to="/account/cases" className="text-primary underline">
          {t('vstory.back')}
        </Link>
      </div>
    );
  return (
    <>
      <p className="p-6 text-muted">
        <Link to={`/account/cases/${encodeURIComponent(caseId)}`} className="text-primary underline">
          {t('vstory.back')}
        </Link>
      </p>
      <StoryPlayer slides={slides} label={t('vstory.pageTitle')} onClose={close} />
    </>
  );
}
