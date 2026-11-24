import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, MapPin, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { buttonClass } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { useMotionOK } from '@/components/motion';
import { useHydrating } from '@/lib/ssr';
import { registerCopy } from '@/i18n';
import { worldCopy } from '@/i18n/world';
import { useGlobeMap } from './api';
import { placeCities } from './globeShared';
import { StaticGlobe } from './StaticGlobe';

registerCopy(worldCopy);

// WebGL globe (cobe): own chunk, requested only when the section comes near the viewport.
const GlobeCanvas = lazy(() => import('./GlobeCanvas'));

const MIN_PER_CITY = 3;

const webglAvailable = () => {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    // Release the probe context at once (browsers cap live contexts; cobe creates its own).
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
};

/**
 * Home: "where our workers are" — a slowly rotating 3D globe with arcs from Baku to the German cities of our
 * workers, each marker labelled with its count, next to the list of cities (the keyboard / screen-reader view of
 * the same data). Data: the placement map aggregates (GET /growth/map; cities below 3 workers are never sent).
 *
 * Performance: the panel has a fixed square size (no layout shift); the server and the hydrating render show the
 * static SVG globe; the WebGL chunk is loaded only after hydration, when the panel is within 300 px of the
 * viewport, motion is allowed (OS setting / accessibility widget) and WebGL works. The SVG stays for everyone else.
 * Hidden when staff switched the map off for the home page.
 */
export const GlobeSection = () => {
  const { t } = useTranslation();
  const { data } = useGlobeMap();
  const hydrating = useHydrating();
  const motionOK = useMotionOK();
  const panel = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  // The server never sends cities below the threshold; filtered again here so a small count can never show.
  const min = Math.max(MIN_PER_CITY, data?.minPerCity ?? MIN_PER_CITY);
  const cities = useMemo(() => placeCities(data?.enabled ? data.cities.filter((c) => c.workers >= min) : []), [data, min]);
  const interactive = !hydrating && motionOK && near && webgl === true && cities.placed.length > 0;

  useEffect(() => {
    if (hydrating || !motionOK || near) return;
    const el = panel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setWebgl(webglAvailable());
        setNear(true);
        io.disconnect();
      },
      { rootMargin: '300px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hydrating, motionOK, near]);

  useEffect(() => {
    if (!interactive) setReady(false);
  }, [interactive]);

  if (data && (!data.enabled || !data.showOnHome)) return null;
  const total = cities.all.reduce((a, c) => a + c.workers, 0);

  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('world.globe.eyebrow')} title={t('world.globe.title')} subtitle={t('world.globe.subtitle')} />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
          <div className="mx-auto w-full max-w-[540px]">
            <div
              ref={panel}
              className="relative aspect-square w-full overflow-hidden rounded-[2rem] bg-[#07122a] shadow-[var(--tv-shadow-card)]"
              role="group"
              aria-label={t('world.globe.aria')}
            >
              <div className={clsx('absolute inset-0 transition-opacity duration-500', ready && 'opacity-0')}>
                <StaticGlobe cities={cities.placed} bakuLabel={t('world.globe.baku')} label={t('world.globe.staticAria')} />
              </div>
              {interactive && (
                <Suspense fallback={null}>
                  <GlobeCanvas
                    key={cities.placed.map((c) => `${c.city}:${c.workers}`).join('|')}
                    cities={cities.placed}
                    bakuLabel={t('world.globe.baku')}
                    pauseLabel={t('world.globe.pause')}
                    playLabel={t('world.globe.play')}
                    onReady={() => setReady(true)}
                  />
                </Suspense>
              )}
            </div>
            {/* Space kept in every state (no shift when the WebGL globe arrives). */}
            <p className={clsx('mt-2 text-center text-xs text-muted', !interactive && 'invisible')} aria-hidden={!interactive}>
              {t('world.globe.hint')}
            </p>
          </div>

          <div className="min-w-0">
            {cities.all.length > 0 ? (
              <>
                <dl className="grid grid-cols-2 gap-3">
                  <div className="card rounded-2xl p-4">
                    <dt className="sr-only">{t('world.globe.totalWorkers')}</dt>
                    <dd className="font-display text-3xl font-semibold text-ink num">{total}</dd>
                    <dd className="text-sm text-muted">{t('world.globe.totalWorkers')}</dd>
                  </div>
                  <div className="card rounded-2xl p-4">
                    <dt className="sr-only">{t('world.globe.totalCities')}</dt>
                    <dd className="font-display text-3xl font-semibold text-ink num">{cities.all.length}</dd>
                    <dd className="text-sm text-muted">{t('world.globe.totalCities')}</dd>
                  </div>
                </dl>
                <h3 className="mt-5 text-sm font-semibold text-ink">{t('world.globe.listTitle')}</h3>
                <table className="mt-2 w-full overflow-hidden rounded-2xl border border-line bg-card text-sm shadow-[var(--tv-shadow-card)]">
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">{t('world.globe.listTitle')}</th>
                      <th scope="col">{t('world.globe.workersCol')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {cities.all.slice(0, 12).map((c) => (
                      <tr key={c.city}>
                        <th scope="row" className="px-4 py-2.5 text-left font-semibold text-ink">
                          <span className="inline-flex items-center gap-2">
                            <MapPin className="size-4 shrink-0 text-chart-1" aria-hidden />
                            {c.city}
                          </span>
                        </th>
                        <td className="px-4 py-2.5 text-right font-semibold text-ink tabular-nums">{c.workers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="card rounded-2xl p-5 text-sm text-muted">{t('world.globe.empty')}</p>
            )}
            <p className="mt-3 flex items-start gap-2 text-xs text-muted">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('world.globe.privacy', { min })}
            </p>
            <div className="mt-5">
              <Link to="/map" className={buttonClass({ variant: 'outline', size: 'lg' })}>
                {t('world.globe.cta')} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default GlobeSection;
