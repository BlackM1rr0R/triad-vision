import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, Info, Lightbulb } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { GlossaryChips } from '@/components/glossary/GlossaryChips';
import { ApartmentPlan } from '@/components/apartment/ApartmentPlan';
import { HotspotMap } from '@/components/hotspots/HotspotMap';
import { registerCopy } from '@/i18n';
import { pagesApartment } from '@/i18n/pagesApartment';
import { usePageTitle } from '@/lib/usePageTitle';
import { APARTMENT_AS_OF, APARTMENT_H, APARTMENT_SOURCES, APARTMENT_W, HOTSPOTS, ROOMS, hotspotById, hotspotNumber, type Hotspot, type Room } from '@/lib/apartment/hotspots';

registerCopy(pagesApartment);

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
  const panelRef = useRef<HTMLDivElement>(null);
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
            <HotspotMap
              width={APARTMENT_W}
              height={APARTMENT_H}
              mapLabel={t('apt.mapLabel', { count: HOTSPOTS.length })}
              zoomLabels={{ in: t('apt.zoomIn'), out: t('apt.zoomOut'), reset: t('apt.zoomReset') }}
              onSelect={(id) => select(id, true)}
              spots={HOTSPOTS.map((h) => ({
                id: h.id,
                x: h.x,
                y: h.y,
                content: hotspotNumber(h.id),
                label: `${hotspotNumber(h.id)}. ${t(`apt.hotspots.${h.id}.title`)}`,
                title: t(`apt.hotspots.${h.id}.title`),
                active: selected?.id === h.id,
                hidden: room !== null && h.room !== room,
              }))}
            >
              <ApartmentPlan rooms={rooms} highlight={room} />
            </HotspotMap>

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
