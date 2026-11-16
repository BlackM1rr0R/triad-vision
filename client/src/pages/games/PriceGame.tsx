import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, Bus, Coins, Download, Home, Info, Landmark, Link2, Minus, Play, Plus, RotateCcw, Scissors, ShoppingBasket, Trophy, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { GameLinks } from '@/components/games/GameLinks';
import { copyLink, downloadResultCard } from '@/components/games/shareCard';
import { useEurAzn, useManat } from '@/components/tools/AznEquivalent';
import { registerCopy } from '@/i18n';
import { pagesGames } from '@/i18n/pagesGames';
import { pagesPriceGame } from '@/i18n/pagesPriceGame';
import { useBrand } from '@/lib/brand';
import { localePath } from '@/lib/localeRouter';
import { usePageTitle } from '@/lib/usePageTitle';
import { loadProgress, pickTx, saveProgress } from '@/lib/games/common';
import { PRICE_AS_OF, type PriceCategory } from '@/lib/games/price/items';
import { MAX_POINTS, ROUNDS, buildRounds, newSeed, parseSeed, pointsFor, verdictFor, type Round } from '@/lib/games/price/score';

registerCopy(pagesGames);
registerCopy(pagesPriceGame);

const PATH = '/price-game';
const BEST_KEY = 'price.best';
const ICONS: Record<PriceCategory, LucideIcon> = { food: ShoppingBasket, eatOut: UtensilsCrossed, transport: Bus, housing: Home, services: Scissors, official: Landmark };

/** Euro amount without Intl (server and browser render the same): "3,90 €" / "3.90 €"; whole euros from 100 €. */
const useEuro = () => {
  const { i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  return useMemo(() => {
    const sep = lng === 'en' ? '.' : ',';
    return (n: number) => {
      if (n >= 100) return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lng === 'en' ? ',' : ' ')} €`;
      return `${n.toFixed(2).replace('.', sep)} €`;
    };
  }, [lng]);
};

type Guess = { id: string; guess: number; points: number };

/**
 * /price-game — "Guess the price": 10 rounds from a seed (?seed= replays the same rounds, ?s= shows a friend's
 * score), a slider per item, points by closeness, the real price in euro and in manat (CBAR rate, GET /life/rate),
 * the source or "estimate" label per price, a PNG result card and the best score in localStorage.
 */
export default function PriceGamePage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('priceGame.heroTitle'));
  const lng = i18n.resolvedLanguage ?? 'az';
  const brand = useBrand();
  const euro = useEuro();
  const manat = useManat();
  const rate = useEurAzn();
  const [params, setParams] = useSearchParams();
  const sharedSeed = parseSeed(params.get('seed'));
  const sharedScore = parseSeed(params.get('s'));
  const [seed, setSeed] = useState<number>(() => sharedSeed ?? 0);
  const [phase, setPhase] = useState<'intro' | 'play' | 'done'>('intro');
  const rounds = useMemo<Round[]>(() => (seed ? buildRounds(seed) : []), [seed]);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [best, setBest] = useState(0);
  useEffect(() => setBest(loadProgress<number>(BEST_KEY, 0)), []);
  const round = rounds[index];
  const total = guesses.reduce((s, g) => s + g.points, 0);

  const start = (s: number) => {
    const rs = buildRounds(s);
    setSeed(s);
    setIndex(0);
    setGuesses([]);
    setRevealed(false);
    setValue(rs[0].start);
    setPhase('play');
    setParams(new URLSearchParams({ seed: String(s) }), { replace: true, preventScrollReset: true });
  };

  const submit = () => {
    if (!round || revealed) return;
    setGuesses((g) => [...g, { id: round.item.id, guess: value, points: pointsFor(value, round.item.price) }]);
    setRevealed(true);
  };

  const next = () => {
    if (index + 1 >= rounds.length) {
      const score = total;
      if (score > best) {
        setBest(score);
        saveProgress(BEST_KEY, score);
      }
      setPhase('done');
      return;
    }
    setIndex(index + 1);
    setValue(rounds[index + 1].start);
    setRevealed(false);
  };

  const nudge = (dir: 1 | -1) => round && setValue((v) => Math.min(round.max, Math.max(round.min, Math.round((v + dir * round.step) * 100) / 100)));

  const shareUrl = () => `${window.location.origin}${localePath(PATH)}?seed=${seed}&s=${total}`;
  const share = async () => ((await copyLink(shareUrl())) ? toast.success(t('games.common.copied')) : toast.error(t('games.common.copyFailed')));
  const spot = guesses.filter((g) => g.points === MAX_POINTS).length;
  const card = async () => {
    try {
      await downloadResultCard({
        lead: t('priceGame.result.cardLead'),
        big: t('priceGame.result.total', { score: total, max: ROUNDS * MAX_POINTS }),
        sub: t('priceGame.result.cardSub', { spot, rounds: ROUNDS }),
        lines: rounds.slice(0, 5).map((r) => `${pickTx(r.item.name, lng)}: ${euro(r.item.price)}`),
        footer: t('games.common.playAt', { domain: brand.domain, path: PATH }),
        filename: `price-game-${total}`,
      });
    } catch {
      toast.error(t('games.common.cardFailed'));
    }
  };

  const last = guesses[guesses.length - 1];
  const Icon = round ? ICONS[round.item.category] : Coins;

  return (
    <>
      <PageHero title={t('priceGame.heroTitle')} subtitle={t('priceGame.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x max-w-3xl space-y-6">
          {phase === 'intro' && (
            <div className="rounded-3xl border border-line bg-card p-5 sm:p-7">
              <h2 className="font-display text-xl font-semibold text-ink">{t('priceGame.intro.title')}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink">{t('priceGame.intro.text')}</p>
              {sharedSeed && sharedScore !== null && <p className="mt-3 rounded-2xl border border-line bg-sunken p-3 text-sm text-ink">{t('priceGame.intro.shared', { score: sharedScore })}</p>}
              {best > 0 && <p className="mt-3 flex items-center gap-1.5 text-sm text-muted"><Trophy className="size-4" aria-hidden /> {t('games.common.best', { value: best })}</p>}
              <button type="button" className={clsx(buttonClass({ size: 'lg' }), 'mt-5')} onClick={() => start(sharedSeed ?? newSeed())}>
                <Play className="size-4" aria-hidden /> {t('priceGame.intro.start')}
              </button>
              <p className="mt-3 text-xs text-muted">{t('games.common.progressNote')}</p>
            </div>
          )}

          {phase === 'play' && round && (
            <div className="rounded-3xl border border-line bg-card p-5 sm:p-7">
              <div className="flex items-center justify-between gap-3 text-sm font-semibold text-muted">
                <span>{t('priceGame.round', { n: index + 1, total: rounds.length })}</span>
                <span className="tabular-nums">
                  {t('games.common.score')}: {total}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${((index + (revealed ? 1 : 0)) / rounds.length) * 100}%` }} />
              </div>
              <div className="mt-5 flex items-start gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl chip-soft">
                  <Icon className="size-7" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-xl font-semibold text-ink sm:text-2xl" lang="de">
                    {round.item.de}
                  </p>
                  {!lng.startsWith('de') && <p className="mt-1 text-sm text-muted">{pickTx(round.item.name, lng)}</p>}
                </div>
              </div>

              <div className="mt-6">
                <label htmlFor="price-guess" className="label">
                  {t('priceGame.guessLabel')}
                </label>
                <p className="font-display text-4xl font-semibold text-ink tabular-nums" aria-hidden>
                  {euro(value)}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <button type="button" className={buttonClass({ variant: 'outline', size: 'sm' })} onClick={() => nudge(-1)} disabled={revealed} aria-label={t('priceGame.less')}>
                    <Minus className="size-4" aria-hidden />
                  </button>
                  <input
                    id="price-guess"
                    type="range"
                    className="h-11 w-full cursor-pointer accent-[var(--tv-primary,#1f4f7d)]"
                    min={round.min}
                    max={round.max}
                    step={round.step}
                    value={value}
                    disabled={revealed}
                    aria-valuetext={euro(value)}
                    onChange={(e) => setValue(Number(e.target.value))}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                  />
                  <button type="button" className={buttonClass({ variant: 'outline', size: 'sm' })} onClick={() => nudge(1)} disabled={revealed} aria-label={t('priceGame.more')}>
                    <Plus className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="flex justify-between text-xs text-muted tabular-nums" aria-hidden>
                  <span>{euro(round.min)}</span>
                  <span>{euro(round.max)}</span>
                </div>
              </div>

              <div aria-live="polite">
                {revealed && last && (
                  <div className={clsx('mt-5 rounded-2xl border p-4', last.points >= 70 ? 'border-success-border bg-success-bg' : last.points >= 30 ? 'border-warning-border bg-warning-bg' : 'border-danger-border bg-danger-bg')}>
                    <p className="text-sm font-semibold text-ink">{t(`priceGame.verdict.${verdictFor(last.guess, round.item.price)}`)} {t('priceGame.points', { n: last.points })}</p>
                    <p className="mt-2 text-xs font-semibold text-muted">{t('priceGame.actual')}</p>
                    <p className="font-display text-3xl font-semibold text-ink tabular-nums">{euro(round.item.price)}</p>
                    {rate.data && <p className="text-sm text-ink tabular-nums">{t('priceGame.azn', { value: manat(round.item.price * rate.data.rate) })}</p>}
                    <p className="mt-1 text-sm text-muted">{t('priceGame.yourGuess', { value: euro(last.guess) })}</p>
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
                      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                      {round.item.source ? (
                        round.item.source.url.startsWith('/') ? (
                          <Link to={round.item.source.url} className="font-semibold text-link hover:underline">
                            {t('priceGame.basis.source', { label: round.item.source.label, date: round.item.source.date })}
                          </Link>
                        ) : (
                          <a href={round.item.source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-link hover:underline">
                            {t('priceGame.basis.source', { label: round.item.source.label, date: round.item.source.date })}
                          </a>
                        )
                      ) : (
                        t('priceGame.basis.estimate')
                      )}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-5">
                {!revealed ? (
                  <button type="button" className={buttonClass({ size: 'lg' })} onClick={submit}>
                    {t('priceGame.submit')}
                  </button>
                ) : (
                  <button type="button" className={buttonClass({ size: 'lg' })} onClick={next} autoFocus>
                    {index + 1 >= rounds.length ? t('priceGame.finish') : t('priceGame.next')} <ArrowRight className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            </div>
          )}

          {phase === 'done' && (
            <div className="space-y-4">
              <div className="rounded-3xl border border-primary/30 bg-card p-5 shadow-[var(--tv-shadow-raised)] sm:p-7" aria-live="polite">
                <p className="text-sm font-semibold text-muted">{t('priceGame.result.title')}</p>
                <p className="mt-1 font-display text-4xl font-semibold text-ink tabular-nums">{t('priceGame.result.total', { score: total, max: ROUNDS * MAX_POINTS })}</p>
                <p className="mt-2 text-sm text-ink">{t(`priceGame.result.grade.${total >= 750 ? 'top' : total >= 450 ? 'good' : 'low'}`)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><Trophy className="size-4" aria-hidden /> {t('games.common.best', { value: best })}</p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button type="button" className={buttonClass({ size: 'lg' })} onClick={() => start(newSeed())}>
                    <RotateCcw className="size-4" aria-hidden /> {t('priceGame.result.again')}
                  </button>
                  <button type="button" className={buttonClass({ variant: 'outline', size: 'lg' })} onClick={() => start(seed)}>
                    {t('priceGame.result.replay')}
                  </button>
                  <button type="button" className={buttonClass({ variant: 'outline', size: 'lg' })} onClick={() => void card()}>
                    <Download className="size-4" aria-hidden /> {t('games.common.card')}
                  </button>
                  <button type="button" className={buttonClass({ variant: 'ghost', size: 'lg' })} onClick={() => void share()}>
                    <Link2 className="size-4" aria-hidden /> {t('games.common.share')}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-3xl border border-line bg-card">
                <table className="w-full text-sm">
                  <caption className="px-4 pt-4 text-left font-display text-lg font-semibold text-ink">{t('priceGame.result.table')}</caption>
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th scope="col" className="px-4 py-2 font-semibold">{t('priceGame.result.item')}</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">{t('priceGame.result.guess')}</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">{t('priceGame.result.price')}</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">{t('games.common.score')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rounds.map((r, i) => (
                      <tr key={r.item.id} className="border-t border-line">
                        <td className="px-4 py-2 text-ink">{pickTx(r.item.name, lng)}{r.item.basis === 'estimate' && <span className="text-muted"> *</span>}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted">{guesses[i] ? euro(guesses[i].guess) : '–'}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">{euro(r.item.price)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-ink">{guesses[i]?.points ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-4 pb-4 pt-2 text-xs text-muted">* {t('priceGame.basis.estimate')}</p>
              </div>
            </div>
          )}

          <section aria-labelledby="price-notes-h" className="space-y-2 text-sm leading-relaxed text-ink">
            <h2 id="price-notes-h" className="font-display text-lg font-semibold">
              {t('priceGame.notes.title')}
            </h2>
            <p>{t('priceGame.notes.text')}</p>
            <p className="text-xs text-muted">{t('games.common.asOf', { date: PRICE_AS_OF.split('-').reverse().join('.') })}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Link to="/budget" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                {t('priceGame.notes.budget')} <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link to="/life-in-germany" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                {t('priceGame.notes.life')} <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link to="/glossary/deutschlandticket" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                {t('games.common.glossary')}: Deutschlandticket
              </Link>
              <Link to="/glossary/warmmiete" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                {t('games.common.glossary')}: Warmmiete
              </Link>
              <Link to="/glossary/pfand" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                {t('games.common.glossary')}: Pfand
              </Link>
            </div>
          </section>

          <GameLinks current={PATH} />
        </div>
      </section>
      <RelatedGuides tool={PATH} />
    </>
  );
}
