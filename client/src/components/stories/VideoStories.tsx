import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Play, Quote, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/motion';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesDiscover } from '@/i18n/pagesDiscover';
import type { Testimonial } from '@/lib/types';

registerCopy(pagesDiscover);

const COUNTRIES = ['AZ', 'TR', 'UA'];
const VISAS = ['chancenkarte', 'blue-card', 'ausbildung', '18a', '18b', '19c', 'family', 'seasonal'];

type Embed = { kind: 'iframe'; src: string; provider: 'YouTube' | 'Vimeo'; thumb: string | null } | { kind: 'file'; src: string };

/** Privacy-friendly player of a story video: YouTube (no-cookie) / Vimeo (do-not-track) or an uploaded MP4 / WebM. */
export const storyEmbed = (url: string | null | undefined): Embed | null => {
  if (!url) return null;
  if (/^\/uploads\/[\w.-]+\.(mp4|webm)$/i.test(url)) return { kind: 'file', src: url };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] || null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] ?? null;
  if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1`, provider: 'YouTube', thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const vid = u.pathname.match(/(\d{6,12})/)?.[1];
    if (vid) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vid}?dnt=1&autoplay=1`, provider: 'Vimeo', thumb: null };
  }
  return null;
};

/** Video plays only after a click: nothing is loaded from YouTube / Vimeo before that. */
const VideoPlayer = ({ item, title }: { item: Testimonial; title: string }) => {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const embed = storyEmbed(item.videoUrl);
  if (!embed) return null;
  const poster = item.posterUrl || (embed.kind === 'iframe' ? embed.thumb : null);
  if (playing) {
    return embed.kind === 'iframe' ? (
      <iframe
        src={embed.src}
        title={title}
        className="aspect-video w-full rounded-t-2xl bg-black"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    ) : (
      <video src={embed.src} poster={poster ?? undefined} controls autoPlay playsInline preload="metadata" className="aspect-video w-full rounded-t-2xl bg-black">
        <track kind="captions" />
      </video>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="group relative block aspect-video w-full overflow-hidden rounded-t-2xl bg-navy-900 text-left"
      aria-label={t('discover.stories.play', { name: title })}
    >
      {poster ? <img src={poster} alt="" loading="lazy" decoding="async" className="size-full object-cover opacity-90 transition duration-700 group-hover:scale-105" /> : null}
      <span className="absolute inset-0 bg-gradient-to-t from-navy-950/70 via-navy-950/10 to-transparent" aria-hidden />
      <span className="absolute inset-0 grid place-items-center" aria-hidden>
        <span className="grid size-16 place-items-center rounded-full bg-white/95 text-brand-700 shadow-xl transition group-hover:scale-110">
          <Play className="ml-1 size-7 fill-current" />
        </span>
      </span>
      {embed.kind === 'iframe' && <span className="absolute right-3 bottom-3 rounded bg-black/55 px-2 py-0.5 text-[11px] text-white">{t('discover.stories.playNote', { provider: embed.provider })}</span>}
    </button>
  );
};

/**
 * Success stories with filters (profession, origin country, German city, visa type): video stories play on
 * click, text testimonials of candidates fill the grid. Renders nothing when there are no stories.
 */
export const VideoStories = ({ testimonials, fallbackHeading }: { testimonials: Testimonial[]; fallbackHeading: { eyebrow: string; title: string; subtitle: string } }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const id = useId();
  const stories = useMemo(() => testimonials.filter((x) => x.kind === 'candidate' || storyEmbed(x.videoUrl)), [testimonials]);
  const [filters, setFilters] = useState({ profession: '', country: '', city: '', visa: '' });
  const options = useMemo(() => {
    const uniq = (vals: (string | null | undefined)[]) => [...new Set(vals.filter((v): v is string => !!v && !!v.trim()))].sort((a, b) => a.localeCompare(b));
    return {
      profession: uniq(stories.map((s) => s.profession)),
      country: uniq(stories.map((s) => s.country)),
      city: uniq(stories.map((s) => s.city)),
      visa: uniq(stories.map((s) => s.visaType)),
    };
  }, [stories]);
  if (!stories.length) return null;

  const hasVideo = stories.some((s) => storyEmbed(s.videoUrl));
  const list = stories
    .filter((s) => (!filters.profession || s.profession === filters.profession) && (!filters.country || s.country === filters.country) && (!filters.city || s.city === filters.city) && (!filters.visa || s.visaType === filters.visa))
    // Videos first, then text stories, keeping the CMS order inside each group.
    .sort((a, b) => Number(!!storyEmbed(b.videoUrl)) - Number(!!storyEmbed(a.videoUrl)));
  const countryLabel = (c: string) => (COUNTRIES.includes(c) ? t(`discover.stories.countries.${c}`) : c === 'other' ? t('discover.stories.countries.other') : c);
  const visaLabel = (v: string) => (VISAS.includes(v) || v === 'other' ? t(`discover.stories.visas.${v}`) : v);
  const active = Object.values(filters).some(Boolean);
  const filterKeys = (['profession', 'country', 'city', 'visa'] as const).filter((k) => options[k].length > 1 || (options[k].length === 1 && stories.length > 1));
  const heading = hasVideo ? { eyebrow: t('discover.stories.eyebrow'), title: t('discover.stories.title'), subtitle: t('discover.stories.subtitle') } : fallbackHeading;

  return (
    <section className="section" aria-label={heading.title}>
      <div className="container-x">
        <SectionHeading eyebrow={heading.eyebrow} title={heading.title} subtitle={heading.subtitle} />
        {filterKeys.length > 0 && (
          <div className="mb-8 flex flex-wrap items-end gap-3" role="group" aria-label={t('discover.stories.filters.label')}>
            {filterKeys.map((k) => (
              <div key={k} className="min-w-[10rem] flex-1 sm:flex-none">
                <label htmlFor={`${id}-${k}`} className="label">
                  {t(`discover.stories.filters.${k}`)}
                </label>
                <select id={`${id}-${k}`} className="input" value={filters[k]} onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))}>
                  <option value="">{t('discover.stories.filters.all')}</option>
                  {options[k].map((v) => (
                    <option key={v} value={v}>
                      {k === 'country' ? countryLabel(v) : k === 'visa' ? visaLabel(v) : v}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {active && (
              <button type="button" className="btn-ghost btn-sm mb-0.5" onClick={() => setFilters({ profession: '', country: '', city: '', visa: '' })}>
                <RotateCcw className="size-4" aria-hidden /> {t('discover.stories.filters.reset')}
              </button>
            )}
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {t('discover.stories.count', { count: list.length })}
        </p>
        {list.length === 0 ? (
          <p className="card card-pad text-center text-sm text-muted">{t('discover.stories.noMatch')}</p>
        ) : (
          <ul className="grid-cards md:grid-cols-2 xl:grid-cols-3">
            {list.map((s, i) => {
              const name = tr(s.author);
              const video = !!storyEmbed(s.videoUrl);
              const chips = [s.profession, s.city && s.city, s.country && countryLabel(s.country), s.visaType && visaLabel(s.visaType)].filter((x): x is string => !!x);
              return (
                <li key={s.id}>
                  <Reveal delay={(i % 3) * 0.08}>
                    <figure className={clsx('card flex h-full flex-col overflow-hidden', !video && 'p-0')}>
                      {video && <VideoPlayer item={s} title={[name, tr(s.role)].filter(Boolean).join(' — ')} />}
                      <div className="flex flex-1 flex-col p-6">
                        {!video && <Quote className="size-8 text-brand-500" aria-hidden />}
                        <blockquote className={clsx('flex-1 text-[0.97rem] leading-relaxed text-navy-900/85', !video && 'mt-3')}>„{tr(s.quote)}“</blockquote>
                        <figcaption className="mt-5 border-t border-line pt-4">
                          <span className="block text-sm font-bold text-navy-900">{name}</span>
                          {tr(s.role) && <span className="block text-xs text-muted">{tr(s.role)}</span>}
                          {chips.length > 0 && (
                            <span className="mt-3 flex flex-wrap gap-1.5">
                              {chips.map((c, ci) => (
                                <span key={`${c}-${ci}`} className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-navy-900">
                                  {c === s.city && <MapPin className="size-3 text-brand-600" aria-hidden />} {c}
                                </span>
                              ))}
                            </span>
                          )}
                        </figcaption>
                      </div>
                    </figure>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
