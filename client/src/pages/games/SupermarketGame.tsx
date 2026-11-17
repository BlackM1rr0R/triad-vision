import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, CheckCircle2, CreditCard, Download, ExternalLink, Link2, Play, Receipt, RotateCcw, ShoppingCart, Square, Timer, Trophy, Volume2, XCircle } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { GameLinks } from '@/components/games/GameLinks';
import { copyLink, downloadResultCard } from '@/components/games/shareCard';
import { useSpeak } from '@/components/games/useSpeak';
import { ProductIcon } from '@/components/supermarket/ProductIcon';
import { registerCopy } from '@/i18n';
import { pagesGames } from '@/i18n/pagesGames';
import { pagesSupermarket } from '@/i18n/pagesSupermarket';
import { useBrand } from '@/lib/brand';
import { localePath } from '@/lib/localeRouter';
import { usePageTitle } from '@/lib/usePageTitle';
import { loadProgress, mmss, pickTx, saveProgress, seededRandom, shuffle } from '@/lib/games/common';
import { SUPERMARKET_BEST_KEY } from '@/lib/games/street/progress';
import { useReadyReport } from '@/lib/readyProgress/sync';
import { AISLES, AISLE_DE, BAG_PRICE, PFAND_OPTIONS, SUPERMARKET_AS_OF, SUPERMARKET_SOURCES, productsIn, type Aisle, type Product } from '@/lib/games/supermarket/items';
import { ROUND_SECONDS, buildReceipt, buildRound, cashFor, maxPoints, newSeed, parseSeed, pick, summarize, type Bag, type PickResult } from '@/lib/games/supermarket/game';

registerCopy(pagesGames);
registerCopy(pagesSupermarket);

const PATH = '/supermarket-game';
type Phase = 'intro' | 'pfand' | 'shop' | 'checkout' | 'done';
const eur = (n: number) => `${n < 0 ? '-' : ''}${Math.abs(n).toFixed(2).replace('.', ',')} €`;

const SpeakBtn = ({ id, text, label }: { id: string; text: string; label: string }) => {
  const { available, speaking, speak, stop } = useSpeak();
  if (!available) return null;
  const on = speaking === id;
  return (
    <button type="button" onClick={() => (on ? stop() : speak(id, text, 0.9))} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink" aria-label={`${label}: ${text}`} aria-pressed={on}>
      {on ? <Square className="size-3.5" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
    </button>
  );
};

/**
 * /supermarket-game — a German shopping trip: the deposit machine at the entrance (guess each empty's Pfand, get
 * a Leergutbon), a shopping list of 5–8 products (seeded: ?seed= replays it) to find on self-drawn shelves by aisle
 * against the clock (wrong picks explained: Quark ≠ Joghurt, Hackfleisch gemischt = with pork, Mehl Type 405 …),
 * then the till: "Tüte?", card or cash, and the receipt (Kassenbon) with Pfand lines and the VAT split.
 * Prices align with the price game where the product is the same. Best score in localStorage.
 */
export default function SupermarketGamePage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('market.heroTitle'));
  const lng = i18n.resolvedLanguage ?? 'az';
  const isDe = lng.startsWith('de');
  const brand = useBrand();
  const [params, setParams] = useSearchParams();
  const sharedSeed = parseSeed(params.get('seed'));
  const [seed, setSeed] = useState(() => sharedSeed ?? 0);
  const round = useMemo(() => (seed ? buildRound(seed) : null), [seed]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [best, setBest] = useState(0);
  useEffect(() => setBest(loadProgress<number>(SUPERMARKET_BEST_KEY, 0) || 0), []);
  const report = useReadyReport();

  // deposit machine
  const [pfandIdx, setPfandIdx] = useState(0);
  const [pfandAnswers, setPfandAnswers] = useState<number[]>([]);
  // shop
  const [aisle, setAisle] = useState<Aisle>('obst');
  const [cart, setCart] = useState<string[]>([]);
  const [wrong, setWrong] = useState(0);
  const [last, setLast] = useState<PickResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  // checkout
  const [bag, setBag] = useState<Bag | null>(null);
  const [plasticAsked, setPlasticAsked] = useState(false);
  const [payment, setPayment] = useState<'card' | 'cash' | null>(null);

  const shelf = useMemo(() => (seed ? shuffle(productsIn(aisle), seededRandom(seed + AISLES.indexOf(aisle))) : productsIn(aisle)), [seed, aisle]);

  useEffect(() => {
    if (phase !== 'shop') return;
    const id = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [phase]);
  useEffect(() => {
    if (phase === 'shop' && secondsLeft === 0) {
      toast.info(t('market.shop.timeUp'));
      setPhase('checkout');
    }
  }, [secondsLeft, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (s: number) => {
    setSeed(s);
    setPhase('pfand');
    setPfandIdx(0);
    setPfandAnswers([]);
    setAisle('obst');
    setCart([]);
    setWrong(0);
    setLast(null);
    setSecondsLeft(ROUND_SECONDS);
    setBag(null);
    setPlasticAsked(false);
    setPayment(null);
    setParams(new URLSearchParams({ seed: String(s) }), { replace: true, preventScrollReset: true });
  };

  const empties = round?.empties ?? [];
  const list = round?.list ?? [];
  const pfandRight = pfandAnswers.filter((a, i) => empties[i] && a === empties[i].pfand).length;
  const voucher = Math.round(empties.reduce((s, e) => s + e.pfand, 0) * 100) / 100;
  const found = list.filter((p) => cart.includes(p.id));
  const summary = summarize({ found: found.length, listSize: list.length, wrong, pfandRight, secondsLeft, bag });
  const receipt = buildReceipt(found, bag, voucher);

  const onPick = (id: string) => {
    const r = pick(list, cart, id);
    if (!r) return;
    setLast(r);
    if (r.kind === 'found') {
      const next = [...cart, id];
      setCart(next);
      if (list.every((p) => next.includes(p.id))) {
        toast.success(t('market.shop.allFound'));
        setPhase('checkout');
      }
    } else if (r.kind === 'wrong') setWrong((w) => w + 1);
  };

  const finish = () => {
    setPhase('done');
    // "Germany ready" progress (lib/readyProgress, maxScore 1000): the round's points scaled to 0–1000.
    const max = maxPoints(list.length);
    report({ activityId: 'supermarket-game', item: 'round', score: Math.round((summary.points / max) * 1000), max: 1000 });
    if (summary.points > best) {
      setBest(summary.points);
      saveProgress(SUPERMARKET_BEST_KEY, summary.points);
    }
  };

  const share = async () => ((await copyLink(`${window.location.origin}${localePath(PATH)}?seed=${seed}`)) ? toast.success(t('games.common.copied')) : toast.error(t('games.common.copyFailed')));
  const card = async () => {
    try {
      await downloadResultCard({
        lead: t('market.result.cardLead'),
        big: t('market.result.points', { n: summary.points }),
        sub: t('market.result.cardSub', { found: found.length, total: list.length, wrong }),
        lines: list.map((p) => `${cart.includes(p.id) ? '✓' : '✗'} ${p.de}`),
        footer: t('games.common.playAt', { domain: brand.domain, path: PATH }),
        filename: `supermarket-${summary.points}`,
      });
    } catch {
      toast.error(t('games.common.cardFailed'));
    }
  };

  const name = (p: Product) => (isDe ? null : pickTx(p.name, lng));
  const explain = (p: Product) => (p.note ? pickTx(p.note, lng) : null);
  const stepIdx = ['pfand', 'shop', 'checkout'].indexOf(phase);

  return (
    <>
      <PageHero title={t('market.heroTitle')} subtitle={t('market.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-6">
          {stepIdx >= 0 && (
            <ol className="flex flex-wrap gap-2 text-xs font-semibold" aria-label={t('market.stepsLabel')}>
              {(['pfand', 'shop', 'checkout'] as const).map((s, i) => (
                <li key={s} aria-current={i === stepIdx ? 'step' : undefined} className={clsx('rounded-full px-3 py-1', i === stepIdx ? 'bg-primary text-primary-contrast' : i < stepIdx ? 'bg-success-bg text-success-fg' : 'bg-sunken text-muted')}>
                  {i + 1}. {t(`market.steps.${s}`)}
                </li>
              ))}
            </ol>
          )}

          {phase === 'intro' && (
            <div className="max-w-3xl rounded-3xl border border-line bg-card p-5 sm:p-7">
              <h2 className="font-display text-xl font-semibold text-ink">{t('market.intro.title')}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink">{t('market.intro.text', { seconds: ROUND_SECONDS })}</p>
              {best > 0 && (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
                  <Trophy className="size-4" aria-hidden /> {t('games.common.best', { value: best })}
                </p>
              )}
              <button type="button" className={clsx(buttonClass({ size: 'lg' }), 'mt-5')} onClick={() => start(sharedSeed ?? newSeed())}>
                <Play className="size-4" aria-hidden /> {t('market.intro.start')}
              </button>
              <p className="mt-3 text-xs text-muted">{t('games.common.progressNote')}</p>
            </div>
          )}

          {phase === 'pfand' && round && (
            <div className="max-w-3xl rounded-3xl border border-line bg-card p-5 sm:p-7">
              <h2 className="font-display text-xl font-semibold text-ink">{t('market.pfand.title')}</h2>
              <p className="mt-1 text-sm text-muted">{t('market.pfand.text')}</p>
              {pfandIdx < empties.length ? (
                <div className="mt-5" aria-live="polite">
                  <p className="text-xs font-semibold text-muted">{t('market.pfand.count', { n: pfandIdx + 1, total: empties.length })}</p>
                  <div className="mt-2 flex items-center gap-4">
                    <ProductIcon shape={empties[pfandIdx].shape} colour={empties[pfandIdx].colour} className="size-20 shrink-0" />
                    <p className="font-display text-lg font-semibold text-ink" lang="de">
                      {empties[pfandIdx].de}
                    </p>
                  </div>
                  <p className="mt-4 text-sm font-semibold text-ink">{t('market.pfand.question')}</p>
                  {pfandAnswers.length <= pfandIdx ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {PFAND_OPTIONS.map((o) => (
                        <button key={o} type="button" className={buttonClass({ variant: 'outline', size: 'md' })} onClick={() => setPfandAnswers((a) => [...a, o])}>
                          {o === 0 ? t('market.pfand.none') : eur(o)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    (() => {
                      const e = empties[pfandIdx];
                      const ok = pfandAnswers[pfandIdx] === e.pfand;
                      return (
                        <div className={clsx('mt-3 rounded-2xl border p-4 text-sm', ok ? 'border-success-border bg-success-bg' : 'border-danger-border bg-danger-bg')}>
                          <p className="flex items-center gap-1.5 font-semibold text-ink">
                            {ok ? <CheckCircle2 className="size-4 text-success-fg" aria-hidden /> : <XCircle className="size-4 text-danger-fg" aria-hidden />}
                            {ok ? t('games.common.correct') : t('games.common.wrong')} — {e.pfand === 0 ? t('market.pfand.noDeposit') : t('market.pfand.deposit', { amount: eur(e.pfand) })}
                          </p>
                          <p className="mt-1 text-ink">{e.pfand === 0 ? t(`market.pfand.rejected.${e.bin ?? 'glas'}`) : t(e.pfand === 0.25 ? 'market.pfand.einweg' : 'market.pfand.mehrweg')}</p>
                          <button type="button" className={clsx(buttonClass({ size: 'md' }), 'mt-3')} onClick={() => setPfandIdx((i) => i + 1)} autoFocus>
                            {t('games.common.next')} <ArrowRight className="size-4" aria-hidden />
                          </button>
                        </div>
                      );
                    })()
                  )}
                </div>
              ) : (
                <div className="mt-5">
                  <div className="mx-auto w-56 rounded-md border border-slate-300 bg-[#fffdf5] p-3 font-mono text-xs text-slate-900 shadow" lang="de">
                    <p className="text-center font-bold">LEERGUTBON</p>
                    {empties
                      .filter((e) => e.pfand > 0)
                      .map((e) => (
                        <p key={e.id} className="flex justify-between">
                          <span>{e.pfand === 0.25 ? 'Einweg' : 'Mehrweg'}</span>
                          <span>{eur(e.pfand)}</span>
                        </p>
                      ))}
                    <p className="mt-1 flex justify-between border-t border-dashed border-slate-400 pt-1 font-bold">
                      <span>Summe</span>
                      <span>{eur(voucher)}</span>
                    </p>
                  </div>
                  <p className="mt-3 text-sm text-ink">{t('market.pfand.voucher', { amount: eur(voucher), right: pfandRight, total: empties.length })}</p>
                  <button type="button" className={clsx(buttonClass({ size: 'lg' }), 'mt-4')} onClick={() => setPhase('shop')} autoFocus>
                    <ShoppingCart className="size-4" aria-hidden /> {t('market.pfand.go')}
                  </button>
                </div>
              )}
            </div>
          )}

          {phase === 'shop' && round && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
              <aside className="rounded-3xl border border-line bg-[#fffbea] p-4 text-slate-900 shadow-sm dark:bg-card dark:text-ink lg:sticky lg:top-24" aria-labelledby="sm-list">
                <div className="flex items-center justify-between">
                  <h2 id="sm-list" className="font-display text-lg font-semibold">
                    {t('market.shop.list')}
                  </h2>
                  <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums', secondsLeft <= 30 ? 'bg-danger-bg text-danger-fg' : 'bg-sunken text-ink')} role="timer" aria-label={t('games.common.time')}>
                    <Timer className="size-4" aria-hidden /> {mmss(secondsLeft)}
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {list.map((p) => {
                    const got = cart.includes(p.id);
                    return (
                      <li key={p.id} className="flex items-center gap-2">
                        {got ? <CheckCircle2 className="size-5 shrink-0 text-success-fg" aria-hidden /> : <span className="size-5 shrink-0 rounded border-2 border-slate-400" aria-hidden />}
                        <span className={clsx('min-w-0 flex-1 text-sm', got && 'line-through opacity-60')}>
                          <span className="font-semibold" lang="de">
                            {p.de}
                          </span>
                          {name(p) && <span className="block text-xs opacity-75">{name(p)}</span>}
                          <span className="sr-only">{got ? t('market.shop.inCart') : ''}</span>
                        </span>
                        <SpeakBtn id={`l-${p.id}`} text={p.de} label={t('games.common.listen')} />
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs opacity-75">{t('market.shop.progress', { found: found.length, total: list.length, wrong })}</p>
                <button type="button" className={clsx(buttonClass({ variant: 'outline', size: 'md' }), 'mt-3 w-full')} onClick={() => setPhase('checkout')}>
                  {t('market.shop.toCheckout')} <ArrowRight className="size-4" aria-hidden />
                </button>
              </aside>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-2" role="group" aria-label={t('market.shop.aisles')}>
                  {AISLES.map((a) => (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={aisle === a}
                      onClick={() => setAisle(a)}
                      className={clsx('min-h-10 rounded-lg border px-3 text-left text-sm font-semibold transition-colors', aisle === a ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-primary')}
                    >
                      <span lang="de">{AISLE_DE[a]}</span>
                      {!isDe && <span className="block text-[11px] font-normal opacity-80">{t(`market.aisles.${a}`)}</span>}
                    </button>
                  ))}
                </div>

                <div aria-live="polite">
                  {last && (
                    <div className={clsx('rounded-2xl border p-3 text-sm', last.kind === 'found' ? 'border-success-border bg-success-bg' : last.kind === 'again' ? 'border-line bg-sunken' : 'border-danger-border bg-danger-bg')}>
                      {last.kind === 'found' && (
                        <p className="font-semibold text-success-fg">
                          {t('market.shop.found', { name: last.product.de })}
                        </p>
                      )}
                      {last.kind === 'again' && <p className="text-ink">{t('market.shop.again', { name: last.product.de })}</p>}
                      {last.kind === 'wrong' && (
                        <>
                          <p className="font-semibold text-danger-fg">
                            {t('market.shop.wrong', { name: last.product.de })}
                            {!isDe && ` (${pickTx(last.product.name, lng)})`}
                          </p>
                          {(explain(last.product) || (last.meant && explain(last.meant))) && <p className="mt-1 text-ink">{explain(last.product) ?? (last.meant ? explain(last.meant) : '')}</p>}
                          {last.meant && (
                            <p className="mt-1 text-ink">
                              {t('market.shop.meant', { name: last.meant.de, aisle: AISLE_DE[last.meant.aisle] })}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* The shelf: three boards, products as buttons. */}
                <div className="rounded-3xl border-4 border-amber-900/60 bg-[linear-gradient(#f5f0e6_0_31%,#a16207_31%_33%,#f5f0e6_33%_64%,#a16207_64%_66%,#f5f0e6_66%_97%,#a16207_97%)] p-3 dark:brightness-90">
                  <p className="mb-2 inline-block rounded bg-white px-2 py-0.5 text-xs font-bold text-slate-800 shadow" lang="de">
                    {AISLE_DE[aisle]}
                  </p>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {shelf.map((p) => {
                      const got = cart.includes(p.id);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => onPick(p.id)}
                            className={clsx(
                              'flex h-full w-full flex-col items-center rounded-xl border-2 bg-white/90 p-2 text-center text-slate-900 transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                              got ? 'border-success-border opacity-60' : 'border-transparent',
                            )}
                            aria-label={`${p.de}, ${p.unit}`}
                          >
                            <ProductIcon shape={p.shape} colour={p.colour} className="size-14" />
                            <span className="mt-1 text-xs font-semibold leading-tight" lang="de">
                              {p.de}
                            </span>
                            <span className="text-[11px] text-slate-600">
                              {p.unit} · {eur(p.price)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {phase === 'checkout' && round && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
              <div className="space-y-4 rounded-3xl border border-line bg-card p-5 sm:p-6">
                <h2 className="font-display text-xl font-semibold text-ink">{t('market.checkout.title')}</h2>
                <div>
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    <span lang="de">„Brauchen Sie eine Tüte?“</span>
                    <SpeakBtn id="bag-q" text="Brauchen Sie eine Tüte?" label={t('games.common.listen')} />
                  </p>
                  {!isDe && <p className="text-sm text-muted">{t('market.checkout.bagQ')}</p>}
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {(['own', 'paper', 'plastic'] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        aria-pressed={bag === b}
                        onClick={() => (b === 'plastic' ? (setPlasticAsked(true), setBag(null)) : setBag(b))}
                        className={clsx('min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-semibold', bag === b ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-primary')}
                      >
                        <span lang="de">{t(`market.checkout.bagsDe.${b}`)}</span>
                        {!isDe && <span className="block text-xs font-normal opacity-80">{t(`market.checkout.bags.${b}`)}</span>}
                      </button>
                    ))}
                  </div>
                  {(bag || plasticAsked) && <p className="mt-2 rounded-xl bg-sunken p-3 text-sm text-ink">{t(`market.checkout.bagInfo.${bag ?? 'plastic'}`, { price: eur(BAG_PRICE) })}</p>}
                </div>

                {bag && (
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-ink">
                      <span lang="de">„Mit Karte oder bar?“</span>
                      <SpeakBtn id="pay-q" text="Zahlen Sie mit Karte oder bar?" label={t('games.common.listen')} />
                    </p>
                    {!isDe && <p className="text-sm text-muted">{t('market.checkout.payQ')}</p>}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button type="button" aria-pressed={payment === 'card'} onClick={() => setPayment('card')} className={clsx('inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border text-sm font-semibold', payment === 'card' ? 'border-primary bg-primary text-primary-contrast' : 'border-line text-ink hover:border-primary')}>
                        <CreditCard className="size-4" aria-hidden /> <span lang="de">Mit Karte</span>
                      </button>
                      <button type="button" aria-pressed={payment === 'cash'} onClick={() => setPayment('cash')} className={clsx('min-h-12 rounded-xl border text-sm font-semibold', payment === 'cash' ? 'border-primary bg-primary text-primary-contrast' : 'border-line text-ink hover:border-primary')}>
                        <span lang="de">Bar</span>
                      </button>
                    </div>
                    {payment && (
                      <p className="mt-2 rounded-xl bg-sunken p-3 text-sm text-ink">
                        {payment === 'card' ? t('market.checkout.cardInfo') : t('market.checkout.cashInfo', { given: eur(cashFor(receipt.total).given), change: eur(cashFor(receipt.total).change) })}
                      </p>
                    )}
                  </div>
                )}

                {payment && (
                  <button type="button" className={buttonClass({ size: 'lg' })} onClick={finish} autoFocus>
                    {t('market.checkout.finish')} <ArrowRight className="size-4" aria-hidden />
                  </button>
                )}
              </div>

              <ReceiptView receipt={receipt} payment={payment} />
            </div>
          )}

          {phase === 'done' && round && (
            <div className="space-y-4">
              <div className="rounded-3xl border border-primary/30 bg-card p-5 shadow-[var(--tv-shadow-raised)] sm:p-7" aria-live="polite">
                <p className="text-sm font-semibold text-muted">{t('market.result.title')}</p>
                <p className="mt-1 font-display text-4xl font-semibold text-ink tabular-nums">{t('market.result.points', { n: summary.points })}</p>
                <p className="mt-1 text-sm text-muted">{t('market.result.max', { max: maxPoints(list.length) })}</p>
                <p className="mt-2 text-sm text-ink">{t('market.result.detail', { found: found.length, total: list.length, wrong, pfand: pfandRight, empties: empties.length })}</p>
                <p className="mt-1 text-sm text-ink">{t(`market.result.grade.${found.length === list.length && wrong <= 1 ? 'top' : found.length >= list.length - 1 ? 'good' : 'low'}`)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                  <Trophy className="size-4" aria-hidden /> {t('games.common.best', { value: best })}
                </p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button type="button" className={buttonClass({ size: 'lg' })} onClick={() => start(newSeed())}>
                    <RotateCcw className="size-4" aria-hidden /> {t('market.result.again')}
                  </button>
                  <button type="button" className={buttonClass({ variant: 'outline', size: 'lg' })} onClick={() => start(seed)}>
                    {t('market.result.replay')}
                  </button>
                  <button type="button" className={buttonClass({ variant: 'outline', size: 'lg' })} onClick={() => void card()}>
                    <Download className="size-4" aria-hidden /> {t('games.common.card')}
                  </button>
                  <button type="button" className={buttonClass({ variant: 'ghost', size: 'lg' })} onClick={() => void share()}>
                    <Link2 className="size-4" aria-hidden /> {t('games.common.share')}
                  </button>
                </div>
              </div>
              <section aria-labelledby="sm-review" className="rounded-3xl border border-line bg-card p-5">
                <h2 id="sm-review" className="font-display text-lg font-semibold text-ink">
                  {t('market.result.review')}
                </h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {list.map((p) => (
                    <li key={p.id} className="flex items-start gap-3 rounded-xl bg-sunken p-3 text-sm">
                      <ProductIcon shape={p.shape} colour={p.colour} className="size-10 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-semibold text-ink">
                          {cart.includes(p.id) ? <CheckCircle2 className="size-4 text-success-fg" aria-hidden /> : <XCircle className="size-4 text-danger-fg" aria-hidden />}
                          <span lang="de">{p.de}</span>
                        </span>
                        {name(p) && <span className="block text-muted">{name(p)}</span>}
                        <span className="block text-xs text-muted" lang="de">
                          {AISLE_DE[p.aisle]} · {p.unit} · {eur(p.price)}
                          {p.basis === 'estimate' ? ' *' : ''}
                        </span>
                        {explain(p) && <span className="mt-1 block text-ink/85">{explain(p)}</span>}
                      </span>
                      <SpeakBtn id={`r-${p.id}`} text={p.de} label={t('games.common.listen')} />
                    </li>
                  ))}
                </ul>
              </section>
              <ReceiptView receipt={receipt} payment={payment} />
            </div>
          )}

          <section aria-labelledby="sm-notes" className="max-w-3xl space-y-2 text-sm leading-relaxed text-ink">
            <h2 id="sm-notes" className="font-display text-lg font-semibold">
              {t('market.notes.title')}
            </h2>
            <p>{t('market.notes.text')}</p>
            <p className="text-xs text-muted">* {t('market.notes.estimate')}</p>
            <p className="text-xs text-muted">{t('games.common.asOf', { date: SUPERMARKET_AS_OF.split('-').reverse().join('.') })}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {SUPERMARKET_SOURCES.map((s) => (
                <li key={s.key}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                    {t(`market.sources.${s.key}`)} <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </li>
              ))}
              <li>
                <Link to="/glossary/pfand" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                  {t('games.common.glossary')}: Pfand
                </Link>
              </li>
              <li>
                <Link to="/glossary/mehrwertsteuer" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                  {t('games.common.glossary')}: Mehrwertsteuer
                </Link>
              </li>
              <li>
                <Link to="/price-game" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                  {t('games.items.price.title')} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
              <li>
                <Link to="/german-street" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                  {t('games.items.street.title')} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
            </ul>
          </section>

          <GameLinks current={PATH} />
        </div>
      </section>
      <RelatedGuides tool={PATH} />
    </>
  );
}

/** The Kassenbon: fictional shop, product lines with VAT code, Pfand, bag, deposit voucher, total and VAT split. */
const ReceiptView = ({ receipt, payment }: { receipt: ReturnType<typeof buildReceipt>; payment: 'card' | 'cash' | null }) => {
  const { t } = useTranslation();
  const cash = cashFor(receipt.total);
  return (
    <figure className="mx-auto w-full max-w-sm">
      <div className="rounded-md border border-slate-300 bg-[#fffdf5] p-4 font-mono text-[12px] leading-snug text-slate-900 shadow-lg" lang="de">
        <p className="text-center font-bold">TESTMARKT</p>
        <p className="text-center text-[10px]">Musterstraße 1 · 12345 Musterstadt</p>
        <p className="mb-2 text-center text-[10px]">— Trainingsbeleg —</p>
        {receipt.lines.length === 0 && <p className="text-center">—</p>}
        {receipt.lines.map((l, i) => (
          <p key={i} className="flex justify-between gap-2">
            <span className="min-w-0 truncate">{l.text}</span>
            <span className="shrink-0 tabular-nums">
              {eur(l.amount)} {l.code ?? ' '}
            </span>
          </p>
        ))}
        <p className="mt-2 flex justify-between border-t border-dashed border-slate-400 pt-1 text-sm font-bold">
          <span>SUMME EUR</span>
          <span className="tabular-nums">{eur(receipt.total)}</span>
        </p>
        {payment === 'card' && <p className="flex justify-between"><span>Kartenzahlung</span><span>{eur(receipt.total)}</span></p>}
        {payment === 'cash' && (
          <>
            <p className="flex justify-between"><span>Bar</span><span>{eur(cash.given)}</span></p>
            <p className="flex justify-between"><span>Rückgeld</span><span>{eur(cash.change)}</span></p>
          </>
        )}
        {receipt.vat.length > 0 && (
          <div className="mt-2 border-t border-dashed border-slate-400 pt-1 text-[10px]">
            <p className="flex justify-between"><span>MwSt</span><span>Netto</span><span>Steuer</span><span>Brutto</span></p>
            {receipt.vat.map((v) => (
              <p key={v.code} className="flex justify-between tabular-nums">
                <span>{v.code} {v.rate} %</span>
                <span>{v.net.toFixed(2).replace('.', ',')}</span>
                <span>{v.tax.toFixed(2).replace('.', ',')}</span>
                <span>{v.gross.toFixed(2).replace('.', ',')}</span>
              </p>
            ))}
          </div>
        )}
        <p className="mt-2 text-center text-[10px]">Vielen Dank für Ihren Einkauf!</p>
      </div>
      <figcaption className="mt-2 flex items-start gap-1.5 text-xs text-muted">
        <Receipt className="mt-px size-3.5 shrink-0" aria-hidden /> {t('market.checkout.receiptNote')}
      </figcaption>
    </figure>
  );
};
