import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, Briefcase, Building, Download, Link2, MapPin, RotateCcw, Sparkles } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Germany } from '@/components/illustrations';
import { buttonClass } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Accordion } from '@/components/visa/Accordion';
import { FaqJsonLd } from '@/components/seo/FaqJsonLd';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { EmailResult } from '@/components/tools/EmailResult';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesWhichCity } from '@/i18n/pagesWhichCity';
import { useBrand } from '@/lib/brand';
import { useL10n } from '@/lib/l10n';
import { localePath } from '@/lib/localeRouter';
import { usePageTitle } from '@/lib/usePageTitle';
import type { City } from '@/lib/cities/data';
import { DEFAULT_ANSWERS, QUESTION_KEYS, QUESTIONS, decodeAnswers, encodeAnswers, quizCity, rankCities, type Answers, type CityScore, type QuestionKey } from '@/lib/cityQuiz/score';

registerCopy(pagesWhichCity);

const TOTAL = QUESTION_KEYS.length;

/** Wraps `text` into lines of at most `max` px for the canvas card. */
const wrap = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
};

/** The shareable result card as a 1080×1350 PNG (Instagram portrait), drawn in the browser. */
const downloadCard = async (opts: { lead: string; city: string; match: string; reasons: string[]; footer: string; slug: string }) => {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('NO_CANVAS');
  if (document.fonts?.ready) await document.fonts.ready;
  const font = (weight: number, size: number) => `${weight} ${size}px Onest, system-ui, -apple-system, "Segoe UI", sans-serif`;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0f2742');
  g.addColorStop(1, '#1f4f7d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // German flag stripe
  ['#111111', '#dd0000', '#ffce00'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, i * 18, W, 18);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.arc(W - 120, 300, 320, 0, Math.PI * 2);
  ctx.fill();
  const x = 96;
  ctx.fillStyle = '#f5b544';
  ctx.font = font(600, 48);
  ctx.fillText(opts.lead, x, 220);
  ctx.fillStyle = '#ffffff';
  let size = 150;
  ctx.font = font(700, size);
  while (ctx.measureText(opts.city).width > W - 2 * x && size > 70) {
    size -= 6;
    ctx.font = font(700, size);
  }
  ctx.fillText(opts.city, x, 220 + size + 20);
  let y = 220 + size + 110;
  ctx.font = font(600, 40);
  ctx.fillStyle = '#9fd3a8';
  ctx.fillText(opts.match, x, y);
  y += 90;
  ctx.font = font(400, 38);
  for (const r of opts.reasons.slice(0, 4)) {
    const lines = wrap(ctx, r, W - 2 * x - 60);
    ctx.fillStyle = '#f5b544';
    ctx.beginPath();
    ctx.arc(x + 12, y - 12, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (const l of lines) {
      ctx.fillText(l, x + 50, y);
      y += 52;
    }
    y += 26;
    if (y > H - 200) break;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = font(500, 32);
  for (const [i, l] of wrap(ctx, opts.footer, W - 2 * x).entries()) ctx.fillText(l, x, H - 110 + i * 44);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('NO_BLOB');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `my-german-city-${opts.slug}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const Result = ({ city, score, runnersUp, answers, onRetake }: { city: City; score: CityScore | null; runnersUp: CityScore[]; answers: Answers | null; onRetake: () => void }) => {
  const { t } = useTranslation();
  const { locale } = useL10n();
  const brand = useBrand();
  const name = city.name[locale] || city.name.en;
  const reasons = answers && score ? score.reasons.map((q) => t(`whichCity.reasons.${q}.${answers[q]}`, { city: name })).filter(Boolean).slice(0, 4) : [];
  const shown = reasons.length ? reasons : [city.description[locale] || city.description.en];
  const matchText = score ? t('whichCity.result.match', { pct: score.match }) : `${city.state}`;
  const query = `r=${city.slug}${answers ? `&a=${encodeAnswers(answers)}` : ''}`;
  const share = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${localePath('/which-city')}?${query}`);
      toast.success(t('whichCity.result.copied'));
    } catch {
      toast.error(t('whichCity.result.copyFailed'));
    }
  };
  const download = async () => {
    try {
      await downloadCard({ lead: t('whichCity.card.lead'), city: name, match: matchText, reasons: shown, footer: t('whichCity.card.footer', { domain: brand.domain }), slug: city.slug });
    } catch {
      toast.error(t('whichCity.result.copyFailed'));
    }
  };
  return (
    <div className="space-y-5" aria-live="polite">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f2742] to-[#1f4f7d] p-6 text-white shadow-[var(--tv-shadow-raised)] sm:p-9">
        <div className="absolute inset-x-0 top-0 flex h-2" aria-hidden>
          <span className="flex-1 bg-black" />
          <span className="flex-1 bg-[#dd0000]" />
          <span className="flex-1 bg-[#ffce00]" />
        </div>
        <p className="text-sm font-semibold text-[#f5b544]">{t('whichCity.result.lead')}</p>
        <h2 className="mt-1 flex items-center gap-3 font-display text-4xl font-semibold sm:text-6xl">
          <MapPin className="size-9 shrink-0 text-[#f5b544]" aria-hidden /> {name}
        </h2>
        <p className="mt-2 text-sm font-semibold text-[#9fd3a8]">
          {matchText} · {city.state}
        </p>
        <h3 className="mt-5 text-sm font-semibold text-white/80">{t('whichCity.result.why')}</h3>
        <ul className="mt-2 space-y-2">
          {shown.map((r) => (
            <li key={r} className="flex gap-3 text-base leading-snug">
              <span className="mt-2 size-2 shrink-0 rounded-full bg-[#f5b544]" aria-hidden /> {r}
            </li>
          ))}
        </ul>
      </section>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Link to={`/jobs/germany?where=${encodeURIComponent(city.name.de)}`} className={buttonClass({ size: 'lg' })}>
          <Briefcase className="size-4" aria-hidden /> {t('whichCity.result.jobs', { city: name })}
        </Link>
        <button type="button" className={buttonClass({ variant: 'outline', size: 'lg' })} onClick={() => void download()}>
          <Download className="size-4" aria-hidden /> {t('whichCity.result.download')}
        </button>
        <button type="button" className={buttonClass({ variant: 'outline', size: 'lg' })} onClick={() => void share()}>
          <Link2 className="size-4" aria-hidden /> {t('whichCity.result.share')}
        </button>
        <Link to="/cities" className={buttonClass({ variant: 'ghost', size: 'lg' })}>
          <Building className="size-4" aria-hidden /> {t('whichCity.result.cityGuide')}
        </Link>
      </div>
      {answers && (
        <EmailResult
          tool="which-city"
          countUse="mount"
          summary={[
            { label: t('whichCity.result.lead'), value: `${name} · ${matchText} · ${city.state}` },
            ...shown.map((reason) => ({ label: t('whichCity.result.why'), value: reason })),
            ...(runnersUp.length ? [{ label: t('whichCity.result.runnersUp'), value: runnersUp.map((r) => `${r.city.name[locale] || r.city.name.en} (${t('whichCity.result.match', { pct: r.match })})`).join(', ') }] : []),
          ]}
        />
      )}
      {!answers && <p className="rounded-2xl border border-line bg-sunken p-3 text-sm text-ink">{t('whichCity.result.shared')}</p>}
      {runnersUp.length > 0 && (
        <section aria-labelledby="wc-runners-h">
          <h3 id="wc-runners-h" className="font-display text-lg font-semibold text-ink">
            {t('whichCity.result.runnersUp')}
          </h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {runnersUp.map((r) => (
              <li key={r.city.slug} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card p-3">
                <span className="font-semibold text-ink">{r.city.name[locale] || r.city.name.en}</span>
                <span className="text-sm text-muted tabular-nums">{t('whichCity.result.match', { pct: r.match })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <button type="button" onClick={onRetake} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link hover:underline">
        <RotateCcw className="size-4" aria-hidden /> {answers ? t('whichCity.result.retake') : t('whichCity.result.start')}
      </button>
    </div>
  );
};

/**
 * /which-city — "Which German city suits you?": eight questions one at a time, deterministic scoring
 * (lib/cityQuiz/score.ts). The result lives in the URL (?r=<city>&a=<answers>), so a shared link renders the
 * same card server-side; the card downloads as a PNG drawn on a canvas in the browser.
 */
export default function WhichCityPage() {
  const { t } = useTranslation();
  usePageTitle(t('whichCity.heroTitle'));
  const [params, setParams] = useSearchParams();
  const urlAnswers = useMemo(() => decodeAnswers(params.get('a')), [params]);
  const urlCity = quizCity(params.get('r'));
  const ranking = useMemo(() => (urlAnswers ? rankCities(urlAnswers) : null), [urlAnswers]);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Answers>(DEFAULT_ANSWERS);
  const faq = t('whichCity.faq.items', { returnObjects: true }) as unknown as { q: string; a: string }[];

  const top = ranking ? ranking[0] : null;
  const city = top?.city ?? urlCity;
  const showResult = !!city && (!!ranking || !!urlCity);

  const choose = <K extends QuestionKey>(q: K, v: Answers[K]) => {
    const next = { ...draft, [q]: v };
    setDraft(next);
    if (step < TOTAL - 1) setStep(step + 1);
    else {
      const best = rankCities(next)[0];
      setParams(new URLSearchParams({ r: best.city.slug, a: encodeAnswers(next) }), { replace: false, preventScrollReset: true });
    }
  };
  const retake = () => {
    setDraft(DEFAULT_ANSWERS);
    setStep(0);
    setParams(new URLSearchParams(), { replace: false, preventScrollReset: true });
  };

  const q = QUESTION_KEYS[step];
  return (
    <>
      <PageHero title={t('whichCity.heroTitle')} subtitle={t('whichCity.heroSubtitle')} illustration={<Germany />} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x max-w-3xl">
          {showResult && city ? (
            <Result city={city} score={top} runnersUp={ranking ? ranking.slice(1, 5) : []} answers={urlAnswers} onRetake={retake} />
          ) : (
            <form className="rounded-3xl border border-line bg-card p-5 sm:p-7" onSubmit={(e) => e.preventDefault()} aria-labelledby="wc-q-h">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
                <span>{t('whichCity.progress', { n: step + 1, total: TOTAL })}</span>
                {step > 0 && (
                  <button type="button" onClick={() => setStep(step - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-muted hover:bg-sunken hover:text-ink">
                    <ArrowLeft className="size-3.5" aria-hidden /> {t('whichCity.back')}
                  </button>
                )}
              </div>
              <div className="mt-2 h-2 rounded-full bg-sunken" aria-hidden>
                <div className="h-2 rounded-full bg-primary transition-[width]" style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
              </div>
              <fieldset className="mt-5">
                <legend id="wc-q-h" className="flex items-center gap-2 font-display text-xl font-semibold text-ink sm:text-2xl">
                  <Sparkles className="size-5 shrink-0 text-primary" aria-hidden /> {t(`whichCity.q.${q}.title`)}
                </legend>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {(QUESTIONS[q] as readonly string[]).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => choose(q, o as Answers[typeof q])}
                      aria-pressed={draft[q] === o}
                      className={clsx(
                        'min-h-14 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-focus/40',
                        draft[q] === o && step > 0 ? 'border-primary bg-primary/10 text-ink' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
                      )}
                    >
                      {t(`whichCity.q.${q}.options.${o}`)}
                    </button>
                  ))}
                </div>
              </fieldset>
            </form>
          )}
        </div>
      </section>

      <section className="pb-12" aria-labelledby="wc-method-h">
        <div className="container-x max-w-3xl space-y-3 text-sm leading-relaxed text-ink">
          <h2 id="wc-method-h" className="font-display text-xl font-semibold">
            {t('whichCity.method.title')}
          </h2>
          <p>{t('whichCity.method.text')}</p>
          <p className="rounded-2xl border border-warning-border bg-warning-bg p-3 text-warning-fg" role="note">
            {t('whichCity.method.disclaimer')}
          </p>
        </div>
      </section>

      <section className="section bg-sunken">
        <div className="container-x grid gap-8 lg:grid-cols-[1fr_1.6fr] lg:gap-14">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading title={t('whichCity.faq.title')} />
          </div>
          <Accordion items={Array.isArray(faq) ? faq : []} />
          <FaqJsonLd items={Array.isArray(faq) ? faq : []} lng={currentSiteLocale()} />
        </div>
      </section>
      <RelatedGuides tool="/which-city" />
    </>
  );
}
