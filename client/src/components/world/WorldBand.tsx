import { ClockWeather } from './ClockWeather';
import { PhraseOfDayCard } from './PhraseOfDay';

/** Min height of each card of the band; WorldBandPlaceholder (Home.tsx) keeps the same so nothing shifts. */
export const WORLD_BAND_CARD = 'grid min-h-[22rem] sm:min-h-[20rem]';

/**
 * Home band right under the stats: Baku ↔ Berlin clock and weather next to the German phrase of the day.
 * Text and SVG only (never the LCP element); the server renders it, times and weather appear after hydration.
 */
export const WorldBand = () => (
  <section className="py-8 sm:py-10">
    <div className="container-x grid gap-4 md:grid-cols-2 md:gap-6">
      <div className={WORLD_BAND_CARD}>
        <ClockWeather />
      </div>
      <div className={WORLD_BAND_CARD}>
        <PhraseOfDayCard />
      </div>
    </div>
  </section>
);

export default WorldBand;
