import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Download, FileDown, Share2, ShieldCheck } from 'lucide-react';
import { buttonClass } from '@/components/ui/Button';
import { registerCopy } from '@/i18n';
import { pagesNovruzCard } from '@/i18n/pagesNovruzCard';
import { GERMAN_LINES, NOVRUZ_GREETINGS, NOVRUZ_TEMPLATES, fileSlug, parseNames, salutation, type NovruzTemplate } from '@/lib/novruzCard/data';
import { CARD_H, CARD_W, canvasBlob, downloadBlob, drawCard, loadImage, renderCard, type CardInput } from '@/lib/novruzCard/render';
import { A5_PT, jpegsToPdf } from '@/lib/novruzCard/pdf';

registerCopy(pagesNovruzCard);

export interface StudioWorker {
  id: string;
  firstName: string;
}

interface Props {
  /** Portal: the company's own workers (first names), preselected ids; public: free-text names. */
  workers?: StudioWorker[];
  initialSelected?: string[];
  defaultCompany?: string;
  /** Same-origin company logo URL (portal only). */
  logoUrl?: string | null;
}

const PREVIEW_SCALE = 0.4;

/** Thumbnail of a design (small canvas, drawn after mount). */
const TemplateThumb = ({ template }: { template: NovruzTemplate }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(c.width / CARD_W, c.height / CARD_H);
    drawCard(ctx, { template, salutation: '', greeting: '' });
  }, [template]);
  return <canvas ref={ref} width={124} height={175} className="h-auto w-full rounded-lg" aria-hidden />;
};

/**
 * Novruz greeting card generator (public /novruz-card and portal /company/novruz-card): recipients, one of four
 * self-drawn designs, a ready Azerbaijani greeting (or own text), optional German line, sender name / logo; live
 * preview; PNG per card, all PNGs, one A5 PDF with a page per card, Web Share (WhatsApp …) where supported.
 * Everything happens in the browser (canvas); nothing is uploaded.
 */
export const NovruzCardStudio = ({ workers, initialSelected, defaultCompany = '', logoUrl }: Props) => {
  const { t, i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? 'de').slice(0, 2);
  const portal = !!workers;
  const [namesText, setNamesText] = useState('');
  const [selected, setSelected] = useState<string[]>(initialSelected ?? []);
  const [template, setTemplate] = useState<NovruzTemplate>('semeni');
  const [greetingId, setGreetingId] = useState<string>(NOVRUZ_GREETINGS[0].id);
  const [custom, setCustom] = useState('');
  const [germanOn, setGermanOn] = useState(true);
  const [german, setGerman] = useState<string>(GERMAN_LINES[0]);
  const [company, setCompany] = useState(defaultCompany);
  const [useLogo, setUseLogo] = useState(!!logoUrl);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => setCompany((c) => c || defaultCompany), [defaultCompany]);
  useEffect(() => {
    if (initialSelected?.length) setSelected(initialSelected);
  }, [initialSelected]);
  useEffect(() => {
    let alive = true;
    if (!logoUrl) return;
    void loadImage(logoUrl).then((img) => alive && setLogo(img));
    return () => {
      alive = false;
    };
  }, [logoUrl]);

  const names = useMemo(() => {
    const list = portal ? (workers ?? []).filter((w) => selected.includes(w.id)).map((w) => w.firstName) : parseNames(namesText);
    return list.length ? list : [''];
  }, [portal, workers, selected, namesText]);
  useEffect(() => setIndex((i) => Math.min(i, names.length - 1)), [names.length]);

  const greeting = greetingId === 'custom' ? custom.trim() || NOVRUZ_GREETINGS[0].az : (NOVRUZ_GREETINGS.find((g) => g.id === greetingId) ?? NOVRUZ_GREETINGS[0]).az;
  const inputFor = (name: string): CardInput => ({
    template,
    salutation: salutation(name),
    greeting,
    german: germanOn ? german : '',
    company,
    logo: useLogo ? logo : null,
  });

  // Live preview of the current card.
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(PREVIEW_SCALE, PREVIEW_SCALE);
    drawCard(ctx, inputFor(names[index] ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, greeting, germanOn, german, company, useLogo, logo, names, index]);

  const fileBase = (name: string) => `novruz-${fileSlug(name || company || 'team')}`;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await fn();
    } catch {
      toast.error(t('novruz.failed'));
    } finally {
      setBusy(false);
    }
  };
  const pngOf = async (name: string) => canvasBlob(renderCard(inputFor(name)), 'image/png');
  const downloadOne = () => run(async () => downloadBlob(await pngOf(names[index] ?? ''), `${fileBase(names[index] ?? '')}.png`));
  const downloadAll = () =>
    run(async () => {
      for (const n of names) {
        downloadBlob(await pngOf(n), `${fileBase(n)}.png`);
        await new Promise((r) => window.setTimeout(r, 350)); // browsers drop rapid multiple downloads
      }
    });
  const downloadPdf = () =>
    run(async () => {
      const pages = [];
      for (const n of names) {
        const blob = await canvasBlob(renderCard(inputFor(n)), 'image/jpeg', 0.92);
        pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: CARD_W, height: CARD_H });
      }
      const pdf = jpegsToPdf(pages, A5_PT, 'Novruz');
      downloadBlob(new Blob([pdf], { type: 'application/pdf' }), `${names.length > 1 ? `novruz-${fileSlug(company || 'team')}` : fileBase(names[0] ?? '')}.pdf`);
    });
  const share = () =>
    run(async () => {
      const name = names[index] ?? '';
      const file = new File([await pngOf(name)], `${fileBase(name)}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (!nav.share || !nav.canShare?.({ files: [file] })) {
        toast.info(t('novruz.shareFailed'));
        return;
      }
      try {
        await nav.share({ files: [file], title: 'Novruz' });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') throw e;
      }
    });

  const gloss = (g: (typeof NOVRUZ_GREETINGS)[number]) => (lng === 'de' ? g.de : g.en);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="space-y-6">
        {/* 1. Recipients */}
        <fieldset className="rounded-3xl border border-line bg-card p-4 sm:p-5">
          <legend className="px-1 font-display text-lg font-semibold text-ink">{t('novruz.steps.recipients')}</legend>
          {portal ? (
            <>
              <p className="text-xs text-muted">{t('novruz.workersHint')}</p>
              {workers!.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t('novruz.noWorkers')}</p>
              ) : (
                <>
                  <div className="mt-2 flex gap-3 text-sm">
                    <button type="button" className="min-h-10 font-semibold text-link hover:underline" onClick={() => setSelected(workers!.map((w) => w.id))}>
                      {t('novruz.selectAll')}
                    </button>
                    <button type="button" className="min-h-10 font-semibold text-link hover:underline" onClick={() => setSelected([])}>
                      {t('novruz.selectNone')}
                    </button>
                  </div>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {workers!.map((w) => (
                      <li key={w.id}>
                        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm text-ink hover:bg-sunken">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={selected.includes(w.id)}
                            onChange={(e) => setSelected((s) => (e.target.checked ? [...s, w.id] : s.filter((x) => x !== w.id)))}
                          />
                          {w.firstName}
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <label className="block text-sm font-medium text-ink">
              {t('novruz.names')}
              <textarea className="input mt-1 min-h-20 text-sm" maxLength={1200} value={namesText} placeholder={t('novruz.namesPh')} onChange={(e) => setNamesText(e.target.value)} />
              <span className="mt-1 block text-xs font-normal text-muted">{t('novruz.namesHint')}</span>
            </label>
          )}
          <p className="mt-2 text-xs text-muted">{t('novruz.salutationNote')}</p>
        </fieldset>

        {/* 2. Design */}
        <fieldset className="rounded-3xl border border-line bg-card p-4 sm:p-5">
          <legend className="px-1 font-display text-lg font-semibold text-ink">{t('novruz.steps.design')}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {NOVRUZ_TEMPLATES.map((tp) => (
              <label
                key={tp}
                className={clsx(
                  'flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border p-2 text-center text-xs font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
                  template === tp ? 'border-primary bg-sunken text-ink' : 'border-line bg-card text-muted hover:bg-sunken',
                )}
              >
                <input type="radio" className="sr-only" name="novruz-template" checked={template === tp} onChange={() => setTemplate(tp)} />
                <TemplateThumb template={tp} />
                {t(`novruz.templates.${tp}`)}
              </label>
            ))}
          </div>
        </fieldset>

        {/* 3. Greeting */}
        <fieldset className="rounded-3xl border border-line bg-card p-4 sm:p-5">
          <legend className="px-1 font-display text-lg font-semibold text-ink">{t('novruz.steps.message')}</legend>
          <p className="text-sm font-medium text-ink">{t('novruz.greeting')}</p>
          <div className="mt-2 space-y-2">
            {NOVRUZ_GREETINGS.map((g) => (
              <label key={g.id} className={clsx('flex cursor-pointer gap-3 rounded-xl border p-3 text-sm', greetingId === g.id ? 'border-primary bg-sunken' : 'border-line hover:bg-sunken')}>
                <input type="radio" className="mt-1 size-4 shrink-0" name="novruz-greeting" checked={greetingId === g.id} onChange={() => setGreetingId(g.id)} />
                <span>
                  <span lang="az" className="block font-semibold text-ink">
                    {g.az}
                  </span>
                  <span className="block text-xs text-muted">{t('novruz.meaning', { text: gloss(g) })}</span>
                </span>
              </label>
            ))}
            <label className={clsx('flex cursor-pointer gap-3 rounded-xl border p-3 text-sm', greetingId === 'custom' ? 'border-primary bg-sunken' : 'border-line hover:bg-sunken')}>
              <input type="radio" className="mt-1 size-4 shrink-0" name="novruz-greeting" checked={greetingId === 'custom'} onChange={() => setGreetingId('custom')} />
              <span className="flex-1">
                <span className="block font-semibold text-ink">{t('novruz.custom')}</span>
                {greetingId === 'custom' && (
                  <textarea lang="az" className="input mt-1 min-h-16 text-sm" maxLength={220} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label={t('novruz.custom')} />
                )}
                <span className="mt-1 block text-xs text-muted">{t('novruz.customHint')}</span>
              </span>
            </label>
          </div>
          <label className="mt-4 flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" className="size-4" checked={germanOn} onChange={(e) => setGermanOn(e.target.checked)} /> {t('novruz.germanLine')}
          </label>
          {germanOn && (
            <>
              <input lang="de" className="input mt-1 text-sm" maxLength={120} value={german} onChange={(e) => setGerman(e.target.value)} list="novruz-german-lines" aria-label={t('novruz.germanLine')} />
              <datalist id="novruz-german-lines">
                {GERMAN_LINES.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </>
          )}
        </fieldset>

        {/* 4. Sender */}
        <fieldset className="rounded-3xl border border-line bg-card p-4 sm:p-5">
          <legend className="px-1 font-display text-lg font-semibold text-ink">{t('novruz.steps.sender')}</legend>
          <label className="block text-sm font-medium text-ink">
            {t('novruz.company')}
            <input className="input mt-1 text-sm" maxLength={80} value={company} onChange={(e) => setCompany(e.target.value)} />
          </label>
          {logoUrl && (
            <label className="mt-3 flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-ink">
              <input type="checkbox" className="size-4" checked={useLogo} onChange={(e) => setUseLogo(e.target.checked)} /> {t('novruz.useLogo')}
            </label>
          )}
        </fieldset>
      </div>

      {/* Preview + downloads */}
      <div className="lg:sticky lg:top-28 lg:self-start">
        <section className="rounded-3xl border border-line bg-card p-4 sm:p-5" aria-labelledby="novruz-preview-h">
          <div className="flex items-center justify-between gap-2">
            <h2 id="novruz-preview-h" className="font-display text-lg font-semibold text-ink">
              {t('novruz.preview')}
            </h2>
            {names.length > 1 && (
              <div className="flex items-center gap-1 text-xs text-muted">
                <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-sunken disabled:opacity-40" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} aria-label={t('novruz.prev')}>
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <span aria-live="polite">{t('novruz.previewOf', { n: index + 1, total: names.length })}</span>
                <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-sunken disabled:opacity-40" disabled={index >= names.length - 1} onClick={() => setIndex((i) => i + 1)} aria-label={t('novruz.next')}>
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            )}
          </div>
          <canvas
            ref={canvasRef}
            width={Math.round(CARD_W * PREVIEW_SCALE)}
            height={Math.round(CARD_H * PREVIEW_SCALE)}
            className="mx-auto mt-3 h-auto w-full max-w-sm rounded-xl border border-line shadow-sm"
            role="img"
            aria-label={`${salutation(names[index] ?? '')} ${greeting}`}
          />
          <div className="mt-4 grid gap-2">
            <button type="button" className={buttonClass({})} disabled={busy} onClick={() => void downloadOne()}>
              <Download className="size-4" aria-hidden /> {t('novruz.png')}
            </button>
            {names.length > 1 && (
              <button type="button" className={buttonClass({ variant: 'outline' })} disabled={busy} onClick={() => void downloadAll()}>
                <Download className="size-4" aria-hidden /> {t('novruz.pngAll', { n: names.length })}
              </button>
            )}
            <button type="button" className={buttonClass({ variant: 'outline' })} disabled={busy} onClick={() => void downloadPdf()}>
              <FileDown className="size-4" aria-hidden /> {t('novruz.pdf', { n: names.length })}
            </button>
            <button type="button" className={buttonClass({ variant: 'ghost' })} disabled={busy} onClick={() => void share()}>
              <Share2 className="size-4" aria-hidden /> {t('novruz.share')}
            </button>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('novruz.privacy')}
          </p>
        </section>
      </div>
    </div>
  );
};

export default NovruzCardStudio;
