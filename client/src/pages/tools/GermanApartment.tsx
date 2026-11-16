import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, Info, Lightbulb, Minus, Plus, RotateCcw } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { GlossaryChips } from '@/components/glossary/GlossaryChips';
import { ApartmentPlan } from '@/components/apartment/ApartmentPlan';
import { registerCopy } from '@/i18n';
import { pagesApartment } from '@/i18n/pagesApartment';
import { usePageTitle } from '@/lib/usePageTitle';
import { APARTMENT_AS_OF, APARTMENT_H, APARTMENT_SOURCES, APARTMENT_W, HOTSPOTS, ROOMS, hotspotById, hotspotNumber, type Hotspot, type Room } from '@/lib/apartment/hotspots';

registerCopy(pagesApartment);

const ZOOMS = [1, 1.5, 2, 2.5] as const;

const Detail = ({ spot }: { spot: Hotspot }) => {
  const { t } = useTranslation();
  const k = (f: string) => t(`apt.hotspots.${spot.id}.${f}`);
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t(`apt.rooms.${spot.room}`)} · {t('apt.point', { n: hotspotNumber(spot.id), total: HOTSPOTS.length })}
      </p>
      <h2 className="font-display text-xl font-semibold text-ink">{k('title')}</h2>
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Info className="size-4 text-info-fg" aria-hidden /> {t('apt.labels.what')}
        </h3>
        <p className="mt-1 text-sm text-ink/85">{k('what')}</p>
      </div>
      <div className="rounded-xl border border-success-border bg-success-bg p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-success-fg">
          <Lightbulb className="size-4" aria-hidden /> {t('apt.labels.tip')}
        </h3>
        <p className="mt-1 text-sm text-success-fg">{k('tip')}</p>
      </div>
      <div className="rounded-xl border border-danger-border bg-danger-bg p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-danger-fg">
          <AlertTriangle className="size-4" aria-hidden /> {t('apt.labels.mistake')}
        </h3>
        <p className="mt-1 text-sm text-danger-fg">{k('mistake')}</p>
      </div>
      {spot.glossary.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink">{t('apt.labels.glossary')}</h3>
          <GlossaryChips slugs={spot.glossary} className="mt-1.5 flex flex-wrap gap-2" />
        </div>
      )}
    </div>
  );
};

/**
 * /german-apartment — virtual German apartment: a self-drawn floor plan (components/apartment/ApartmentPlan) with
 * numbered hotspot buttons (keyboard: Tab / Enter, arrow keys in the detail panel), a room filter, zoom with
 * native scrolling for panning on phones, and the full list of points below (crawlable, works without the plan).
 * The selected point lives in the URL (?spot=heizkoerper) so it can be shared.
 */
export default function GermanApartmentPage() {
  const { t } = useTranslation();
  usePageTitle(t('apt.heroTitle'));
  const [params, setParams] = useSearchParams();
  const selected = hotspotById(params.get('spot'));
  const [room, setRoom] = useState<Room | null>(null);
  const [zoom, setZoom] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rooms = Object.fromEntries(ROOMS.map((r) => [r, t(`apt.rooms.${r}`)])) as Record<Room, string>;
  const visible = room ? HOTSPOTS.filter((h) => h.room === room) : HOTSPOTS;

  const select = (id: string, focusPanel = false) => {
    const p = new URLSearchParams(params);
    p.set('spot', id);
    setParams(p, { replace: true, preventScrollReset: true });
    if (focusPanel) requestAnimationFrame(() => panelRef.current?.focus());
  };
  const step = (dir: 1 | -1) => {
    const list = visible;
    const i = selected ? list.findIndex((h) => h.id === selected.id) : -1;
    const next = list[(i + dir + list.length) % list.length];
    if (next) select(next.id);
  };

  // Keep the selected hotspot in view when zoomed in.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || !selected || zoom === 0) return;
    const x = (selected.x / APARTMENT_W) * box.scrollWidth - box.clientWidth / 2;
    const y = (selected.y / APARTMENT_H) * box.scrollHeight - box.clientHeight / 2;
    box.scrollTo({ left: x, top: y, behavior: 'smooth' });
  }, [selected, zoom]);

  const scale = ZOOMS[zoom];

  return (
    <>
      <PageHero title={t('apt.heroTitle')} subtitle={t('apt.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-4">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('apt.roomFilter')}>
            {[null, ...ROOMS].map((r) => (
              <button
                key={r ?? 'all'}
                type="button"
                aria-pressed={room === r}
                onClick={() => setRoom(r)}
                className={clsx('min-h-10 rounded-full border px-3.5 text-sm font-semibold transition-colors', room === r ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink/80 hover:border-primary')}
              >
                {r ? rooms[r] : t('apt.allRooms')}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">{t('apt.howTo')}</p>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
            <div className="relative rounded-3xl border border-line bg-card p-2 sm:p-3">
              <div className="absolute top-4 right-4 z-10 flex flex-col gap-1 rounded-xl border border-line bg-card/95 p-1 shadow-sm">
                <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-sunken disabled:opacity-40" onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1} aria-label={t('apt.zoomIn')}>
                  <Plus className="size-4" aria-hidden />
                </button>
                <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-sunken disabled:opacity-40" onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} aria-label={t('apt.zoomOut')}>
                  <Minus className="size-4" aria-hidden />
                </button>
                <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-sunken disabled:opacity-40" onClick={() => setZoom(0)} disabled={zoom === 0} aria-label={t('apt.zoomReset')}>
                  <RotateCcw className="size-4" aria-hidden />
                </button>
              </div>
              <div ref={scrollRef} className="overflow-auto rounded-2xl overscroll-contain" style={{ touchAction: 'pan-x pan-y' }}>
                <div className="relative" style={{ width: `${scale * 100}%` }} role="group" aria-label={t('apt.mapLabel', { count: HOTSPOTS.length })}>
                  <ApartmentPlan rooms={rooms} highlight={room} />
                  {HOTSPOTS.map((h) => {
                    const n = hotspotNumber(h.id);
                    const active = selected?.id === h.id;
                    const hidden = room !== null && h.room !== room;
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => select(h.id, true)}
                        aria-pressed={active}
                        aria-label={`${n}. ${t(`apt.hotspots.${h.id}.title`)}`}
                        title={t(`apt.hotspots.${h.id}.title`)}
                        tabIndex={hidden ? -1 : 0}
                        className={clsx(
                          'absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-xs font-bold shadow-md transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none sm:size-8 sm:text-sm',
                          active ? 'scale-125 border-white bg-highlight text-highlight-contrast' : 'border-white bg-primary text-primary-contrast hover:scale-110',
                          hidden && 'pointer-events-none opacity-25',
                        )}
                        style={{ left: `${(h.x / APARTMENT_W) * 100}%`, top: `${(h.y / APARTMENT_H) * 100}%` }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div
              ref={panelRef}
              tabIndex={-1}
              aria-live="polite"
              className="rounded-3xl border border-line bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-focus sm:p-5 lg:sticky lg:top-24"
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') step(1);
                if (e.key === 'ArrowLeft') step(-1);
              }}
            >
              {selected ? <Detail spot={selected} /> : <p className="text-sm text-muted">{t('apt.empty')}</p>}
              <div className="mt-4 flex justify-between gap-2 border-t border-line pt-3">
                <button type="button" onClick={() => step(-1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-ink/80 hover:bg-sunken">
                  <ChevronLeft className="size-4" aria-hidden /> {t('apt.prev')}
                </button>
                <button type="button" onClick={() => step(1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-ink/80 hover:bg-sunken">
                  {t('apt.next')} <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            </div>
          </div>

          {/* All points, grouped by room (also the crawlable / no-plan version) */}
          <section aria-labelledby="apt-list" className="pt-4">
            <h2 id="apt-list" className="font-display text-2xl font-semibold text-ink">
              {t('apt.listTitle')}
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {ROOMS.map((r) => (
                <div key={r} className="rounded-2xl border border-line bg-card p-4">
                  <h3 className="font-semibold text-ink">{rooms[r]}</h3>
                  <ul className="mt-2 space-y-1.5">
                    {HOTSPOTS.filter((h) => h.room === r).map((h) => (
                      <li key={h.id}>
                        <details className="group rounded-lg bg-sunken px-3 py-2" open={selected?.id === h.id || undefined}>
                          <summary className="cursor-pointer text-sm font-semibold text-ink marker:text-muted">
                            {hotspotNumber(h.id)}. {t(`apt.hotspots.${h.id}.title`)}
                          </summary>
                          <p className="mt-2 text-sm text-ink/85">{t(`apt.hotspots.${h.id}.what`)}</p>
                          <p className="mt-1.5 text-sm text-success-fg">
                            <strong>{t('apt.labels.tip')}:</strong> {t(`apt.hotspots.${h.id}.tip`)}
                          </p>
                          <p className="mt-1.5 text-sm text-danger-fg">
                            <strong>{t('apt.labels.mistake')}:</strong> {t(`apt.hotspots.${h.id}.mistake`)}
                          </p>
                        </details>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="apt-sources" className="rounded-3xl border border-line bg-card p-4 sm:p-5">
            <h2 id="apt-sources" className="font-display text-lg font-semibold text-ink">
              {t('apt.sourcesTitle')}
            </h2>
            <p className="mt-2 text-sm text-ink/85">{t('apt.sourcesText', { asOf: APARTMENT_AS_OF })}</p>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {APARTMENT_SOURCES.map((s) => (
                <li key={s.key}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link underline hover:text-link-hover">
                    {t(`apt.sources.${s.key}`)} <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>
      <RelatedGuides tool="/german-apartment" />
    </>
  );
}
