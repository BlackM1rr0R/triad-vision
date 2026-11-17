import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Circle, Eye, Square, Volume2, X } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { GlossaryChips } from '@/components/glossary/GlossaryChips';
import { GameLinks } from '@/components/games/GameLinks';
import { useSpeak } from '@/components/games/useSpeak';
import { StreetScene } from '@/components/street/StreetScene';
import { registerCopy } from '@/i18n';
import { pagesGames } from '@/i18n/pagesGames';
import { pagesGermanStreet } from '@/i18n/pagesGermanStreet';
import { usePageTitle } from '@/lib/usePageTitle';
import { pickTx } from '@/lib/games/common';
import { GROUND_Y, PLACES, STREET_H, STREET_W, placeById, type Building, type BuildingId } from '@/lib/games/street/buildings';
import { markVisited, storageReader, streetStates, streetSummary, type PlaceState } from '@/lib/games/street/progress';
import { useReadyReport } from '@/lib/readyProgress/sync';

registerCopy(pagesGames);
registerCopy(pagesGermanStreet);

const PATH = '/german-street';
/** Top of the clickable area per place (viewBox y); everything ends at the pavement. */
const TOP: Partial<Record<BuildingId, number>> = { muell: GROUND_Y - 120, schilder: 270, baustelle: 70, krankenhaus: 90, sprachschule: 40, bahnhof: 100 };

const StateIcon = ({ state, className }: { state: PlaceState; className?: string }) =>
  state === 'done' ? <CheckCircle2 className={clsx('text-success-fg', className)} aria-hidden /> : state === 'visited' ? <Eye className={clsx('text-info-fg', className)} aria-hidden /> : <Circle className={clsx('text-muted', className)} aria-hidden />;

const Panel = ({ place, state, onClose }: { place: Building; state: PlaceState; onClose: () => void }) => {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'az';
  const { available, speaking, speak, stop } = useSpeak();
  const playing = speaking === place.id;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <StateIcon state={state} className="size-3.5" /> {t(`street.state.${state}`)}
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-ink" lang="de">
            {place.de}
          </h2>
        </div>
        <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunken" aria-label={t('street.close')}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {available && (
        <button
          type="button"
          onClick={() => (playing ? stop() : speak(place.id, place.de, 0.9))}
          aria-pressed={playing}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-semibold text-ink hover:bg-sunken"
        >
          {playing ? <Square className="size-3.5" aria-hidden /> : <Volume2 className="size-4" aria-hidden />} {playing ? t('games.common.stop') : t('games.common.listen')}
        </button>
      )}
      <p className="text-sm leading-relaxed text-ink/85">{pickTx(place.intro, lng)}</p>
      <ul className="space-y-2">
        {place.links.map((l, i) => (
          <li key={l.to}>
            <Link
              to={l.to}
              className={clsx(
                'flex min-h-11 items-center justify-between gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40',
                i === 0 ? 'bg-primary text-primary-contrast hover:opacity-90' : 'border border-line text-ink hover:bg-sunken',
              )}
            >
              <span>
                {i === 0 && <span className="sr-only">{t('street.goIn')}: </span>}
                {t(`street.links.${l.kind}`)}
              </span>
              <ArrowRight className="size-4 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {place.glossary.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink">{t('street.glossary')}</h3>
          <GlossaryChips slugs={place.glossary} className="mt-1.5 flex flex-wrap gap-2" />
        </div>
      )}
    </div>
  );
};

/**
 * /german-street — a virtual German street: a self-drawn panorama (components/street/StreetScene) with every
 * building as a button (keyboard: Tab / Enter, arrows in the panel). The panel gives a short intro in the visitor's
 * language, the German name with article and audio, and "go in" links to the matching game, simulator scene,
 * work scene or explainer. Badges show progress from the games' own localStorage keys (lib/games/street/progress).
 * Phones: the street pans sideways (native scrolling + arrow buttons); the full list below is the fallback.
 * The selected place lives in the URL (?place=bank).
 */
export default function GermanStreetPage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('street.heroTitle'));
  const lng = i18n.resolvedLanguage ?? 'az';
  const [params, setParams] = useSearchParams();
  const selected = placeById(params.get('place'));
  const [states, setStates] = useState<Record<BuildingId, PlaceState> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const report = useReadyReport();

  // Badges only after mount (server render and first paint: no badges, so nothing mismatches).
  useEffect(() => setStates(streetStates(storageReader)), []);

  const select = (id: BuildingId | null, focusPanel = false) => {
    const p = new URLSearchParams(params);
    if (id) p.set('place', id);
    else p.delete('place');
    setParams(p, { replace: true, preventScrollReset: true });
    if (id) {
      markVisited(id);
      setStates(streetStates(storageReader));
      if (focusPanel) requestAnimationFrame(() => panelRef.current?.focus());
    }
  };
  const step = (dir: 1 | -1) => {
    const i = selected ? PLACES.findIndex((p) => p.id === selected.id) : -1;
    const next = PLACES[(i + dir + PLACES.length) % PLACES.length];
    select(next.id);
  };
  const pan = (dir: 1 | -1) => {
    const box = scrollRef.current;
    if (!box) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    box.scrollBy({ left: dir * box.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' });
  };

  // Keep the selected building in view on phones.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || !selected || box.scrollWidth <= box.clientWidth) return;
    const center = ((selected.x + selected.w / 2) / STREET_W) * box.scrollWidth;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    box.scrollTo({ left: center - box.clientWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = states ? streetSummary(states) : null;

  // "Germany ready" progress (lib/readyProgress): once every place of the street has been visited or completed.
  const explored = !!summary && summary.seen >= summary.total;
  useEffect(() => {
    if (explored && summary) report({ activityId: 'german-street', item: 'explored', score: summary.seen, max: summary.total, dedupeKey: 'german-street:explored' });
  }, [explored]); // eslint-disable-line react-hooks/exhaustive-deps
  const stateOf = (id: BuildingId): PlaceState => states?.[id] ?? 'new';

  return (
    <>
      <PageHero title={t('street.heroTitle')} subtitle={t('street.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">{t('street.howTo')}</p>
            {summary && (
              <p className="rounded-full bg-sunken px-3 py-1 text-xs font-semibold text-ink" aria-live="polite">
                {t('street.progress', { done: summary.done, trackable: summary.trackable, seen: summary.seen, total: summary.total })}
              </p>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] lg:items-start">
            <div className="relative rounded-3xl border border-line bg-card p-2 sm:p-3">
              <div className="absolute top-4 right-4 z-10 flex gap-1 rounded-xl border border-line bg-card/95 p-1 shadow-sm lg:hidden">
                <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-sunken" onClick={() => pan(-1)} aria-label={t('street.panLeft')}>
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-sunken" onClick={() => pan(1)} aria-label={t('street.panRight')}>
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
              <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain rounded-2xl" style={{ touchAction: 'pan-x pan-y' }}>
                <div className="relative w-[1500px] dark:brightness-90 sm:w-[1900px] lg:w-full" role="group" aria-label={t('street.mapLabel', { count: PLACES.length })}>
                  <StreetScene />
                  {PLACES.map((p) => {
                    const top = TOP[p.id] ?? 110;
                    const s = stateOf(p.id);
                    const active = selected?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => select(p.id, true)}
                        aria-pressed={active}
                        aria-label={`${p.de} — ${t(`street.state.${s}`)}`}
                        title={p.de}
                        className={clsx(
                          'group absolute rounded-xl border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none',
                          active ? 'border-highlight bg-highlight/15' : 'border-transparent hover:border-white/90 hover:bg-white/15',
                        )}
                        style={{ left: `${(p.x / STREET_W) * 100}%`, width: `${(p.w / STREET_W) * 100}%`, top: `${(top / STREET_H) * 100}%`, height: `${((GROUND_Y - top) / STREET_H) * 100}%` }}
                      >
                        {states && (
                          <span className="absolute -top-2 left-1/2 grid size-6 -translate-x-1/2 place-items-center rounded-full bg-card shadow ring-1 ring-line">
                            <StateIcon state={s} className="size-4" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="mt-2 px-1 text-xs text-muted lg:hidden">{t('street.panTip')}</p>
            </div>

            <div
              ref={panelRef}
              tabIndex={-1}
              aria-live="polite"
              className="rounded-3xl border border-line bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-focus sm:p-5 lg:sticky lg:top-24"
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') step(1);
                if (e.key === 'ArrowLeft') step(-1);
                if (e.key === 'Escape') select(null);
              }}
            >
              {selected ? <Panel place={selected} state={stateOf(selected.id)} onClose={() => select(null)} /> : <p className="text-sm text-muted">{t('street.empty')}</p>}
              <div className="mt-4 flex justify-between gap-2 border-t border-line pt-3">
                <button type="button" onClick={() => step(-1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-ink/80 hover:bg-sunken">
                  <ChevronLeft className="size-4" aria-hidden /> {t('street.prev')}
                </button>
                <button type="button" onClick={() => step(1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-ink/80 hover:bg-sunken">
                  {t('street.next')} <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            </div>
          </div>

          {/* Every place as a list: the crawlable / no-picture version and the phone fallback. */}
          <section aria-labelledby="street-list" className="pt-4">
            <h2 id="street-list" className="font-display text-2xl font-semibold text-ink">
              {t('street.listTitle')}
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PLACES.map((p) => (
                <li key={p.id} className="flex flex-col rounded-2xl border border-line bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => select(p.id, true)} className="text-left font-semibold text-ink hover:underline" lang="de">
                      {p.de}
                    </button>
                    {states && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted">
                        <StateIcon state={stateOf(p.id)} className="size-3.5" /> {t(`street.state.${stateOf(p.id)}`)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-ink/80">{pickTx(p.intro, lng)}</p>
                  <div className="mt-auto flex flex-wrap gap-x-3 pt-2">
                    {p.links.map((l) => (
                      <Link key={l.to} to={l.to} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-link hover:underline">
                        {t(`street.links.${l.kind}`)} <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">{t('street.progressNote')}</p>
          </section>

          <GameLinks current={PATH} />
        </div>
      </section>
      <RelatedGuides tool={PATH} />
    </>
  );
}
