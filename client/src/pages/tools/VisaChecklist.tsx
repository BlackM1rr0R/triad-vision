import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Building2, Download, ExternalLink, Printer, RotateCcw } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { registerCopy } from '@/i18n';
import { pagesVisaChecklist } from '@/i18n/pagesVisaChecklist';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { formatEuro } from '@/lib/seoContent/types';
import { downloadText, printDocument } from '@/lib/printDocument';
import { escapeHtml } from '@/lib/visaRefusal/letter';
import { Disclaimer, GlossaryLinks, Sources, ToolFaq, useFaq, useLng } from '@/components/tools/calc/CalcShared';

registerCopy(pagesVisaChecklist);

/** Same lists as server/src/lib/visaChecklist (PUBLIC_VISA_TYPES, CHECKLIST_PROFESSIONS). */
const CHECKLIST_TYPES = ['skilled', 'blueCard', 'ausbildung', 'recognition', 'chancenkarte', 'family', 'study'] as const;
const CHECKLIST_PROFESSIONS = ['driver', 'nurse', 'cook', 'electrician', 'construction', 'other'] as const;
type VisaKind = (typeof CHECKLIST_TYPES)[number];
type Prof = (typeof CHECKLIST_PROFESSIONS)[number];

interface ChecklistData {
  asOf: string;
  channel: 'portal' | 'tls' | 'embassy';
  fee: { adult: number; minor: number };
  items: { key: string; label: string; source: 'portal' | 'type' | 'profession' | 'note' }[];
  links: { label: string; url: string }[];
  generalLinks: { label: string; url: string }[];
}

const isType = (v: string | null): v is VisaKind => !!v && (CHECKLIST_TYPES as readonly string[]).includes(v);
const isProf = (v: string | null): v is Prof => !!v && (CHECKLIST_PROFESSIONS as readonly string[]).includes(v);

/**
 * /visa-document-checklist — public document checklist for the German Embassy Baku: visa type + profession →
 * the portal's embassy checklist plus Baku-specific items (GET /api/visa-checklist, server-rendered), ticks kept
 * in this browser only, print / PDF / .txt. Links the official lists, which stay authoritative.
 */
export default function VisaChecklistPage() {
  const { t } = useTranslation();
  const lng = useLng();
  usePageTitle(t('visaChecklist.heroTitle'));
  const faq = useFaq('visaChecklist.faq');
  const [params, setParams] = useSearchParams();
  const type: VisaKind = isType(params.get('type')) ? (params.get('type') as VisaKind) : 'skilled';
  const profession: Prof = isProf(params.get('profession')) ? (params.get('profession') as Prof) : 'other';
  const choose = (k: 'type' | 'profession', v: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set(k, v);
        return n;
      },
      { replace: true },
    );

  const q = useQuery({
    queryKey: ['visa-checklist', type, profession, lng],
    queryFn: async () => (await api.get<ChecklistData>('/visa-checklist', { params: { type, profession, lng } })).data,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
  const items = q.data?.items ?? [];

  const storeKey = `tv.visaChecklist.${type}.${profession}`;
  const [ticked, setTicked] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storeKey);
      const v = raw ? (JSON.parse(raw) as unknown) : [];
      setTicked(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    } catch {
      setTicked([]);
    }
  }, [storeKey]);
  const save = (next: string[]) => {
    setTicked(next);
    try {
      window.localStorage.setItem(storeKey, JSON.stringify(next));
    } catch {
      /* storage unavailable: ticks stay for this visit */
    }
  };
  const toggle = (k: string) => save(ticked.includes(k) ? ticked.filter((x) => x !== k) : [...ticked, k]);
  const done = items.filter((i) => ticked.includes(i.key)).length;

  const heading = t('visaChecklist.printFor', { type: t(`visaChecklist.types.${type}`), profession: t(`visaChecklist.professions.${profession}`) });
  const allLinks = [...(q.data?.links ?? []), ...(q.data?.generalLinks ?? [])];
  const print = () => {
    const body = `<h1>${escapeHtml(t('visaChecklist.printTitle'))}</h1><p>${escapeHtml(heading)}</p><ul>${items
      .map((i) => `<li>${escapeHtml(i.label)}</li>`)
      .join('')}</ul><h2>${escapeHtml(t('visaChecklist.linksTitle'))}</h2>${allLinks
      .map((l) => `<p class="muted">${escapeHtml(l.label)}: ${escapeHtml(l.url)}</p>`)
      .join('')}<p class="muted">${escapeHtml(t('visaChecklist.authoritative'))}</p><p class="muted">triad-vision.de/visa-document-checklist</p>`;
    printDocument(t('visaChecklist.printTitle'), body, text(), 'visa-checklist.txt');
  };
  const text = () =>
    [t('visaChecklist.printTitle'), heading, '', ...items.map((i) => `[${ticked.includes(i.key) ? 'x' : ' '}] ${i.label}`), '', ...allLinks.map((l) => `${l.label}: ${l.url}`), '', t('visaChecklist.authoritative')].join('\n');

  return (
    <>
      <PageHero title={t('visaChecklist.heroTitle')} subtitle={t('visaChecklist.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-6">
          <form className="grid gap-3 rounded-3xl border border-line bg-card p-4 sm:grid-cols-2 sm:p-5" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label htmlFor="vc-type" className="label">
                {t('visaChecklist.type')}
              </label>
              <select id="vc-type" className="input" value={type} onChange={(e) => choose('type', e.target.value)}>
                {CHECKLIST_TYPES.map((k) => (
                  <option key={k} value={k}>
                    {t(`visaChecklist.types.${k}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="vc-prof" className="label">
                {t('visaChecklist.profession')}
              </label>
              <select id="vc-prof" className="input" value={profession} onChange={(e) => choose('profession', e.target.value)} disabled={type === 'family'}>
                {CHECKLIST_PROFESSIONS.map((k) => (
                  <option key={k} value={k}>
                    {t(`visaChecklist.professions.${k}`)}
                  </option>
                ))}
              </select>
            </div>
          </form>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
            <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl font-semibold text-ink">{t('visaChecklist.listTitle')}</h2>
                  <p className="text-sm text-muted">{heading}</p>
                </div>
                {items.length > 0 && (
                  <p className="rounded-full bg-sunken px-3 py-1 text-sm font-semibold tabular-nums text-ink" aria-live="polite">
                    {t('visaChecklist.done', { done, total: items.length })}
                  </p>
                )}
              </div>
              {q.isLoading ? (
                <p className="mt-4 flex items-center gap-2 text-sm text-muted">
                  <Spinner /> {t('visaChecklist.loading')}
                </p>
              ) : q.isError ? (
                <div className="mt-4 text-sm text-ink">
                  <p>{t('visaChecklist.error')}</p>
                  <button type="button" className={buttonClass({ variant: 'outline', size: 'sm', className: 'mt-2' })} onClick={() => q.refetch()}>
                    {t('visaChecklist.retry')}
                  </button>
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {items.map((i) => (
                    <li key={i.key}>
                      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5">
                        <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={ticked.includes(i.key)} onChange={() => toggle(i.key)} />
                        <span className="text-sm text-ink">
                          {i.label}
                          {i.source !== 'portal' && <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs text-muted">{t(`visaChecklist.source.${i.source}`)}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={buttonClass({})} onClick={print} disabled={!items.length}>
                  <Printer className="size-4" aria-hidden /> {t('visaChecklist.print')}
                </button>
                <button type="button" className={buttonClass({ variant: 'outline' })} onClick={() => downloadText(text(), 'visa-checklist.txt')} disabled={!items.length}>
                  <Download className="size-4" aria-hidden /> {t('visaChecklist.download')}
                </button>
                <button type="button" className={buttonClass({ variant: 'ghost' })} onClick={() => save([])} disabled={!ticked.length}>
                  <RotateCcw className="size-4" aria-hidden /> {t('visaChecklist.reset')}
                </button>
              </div>
              <p className="mt-3 text-xs leading-snug text-muted">{t('visaChecklist.authoritative')}</p>
            </div>

            <div className="space-y-4">
              {q.data && (
                <>
                  <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                    <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                      <Building2 className="size-5 text-primary" aria-hidden /> {t('visaChecklist.channelTitle')}
                    </h2>
                    <p className="mt-1 text-sm text-ink">{t(`visaChecklist.channel.${q.data.channel}`)}</p>
                    <h3 className="mt-3 text-sm font-semibold text-ink">{t('visaChecklist.feeTitle')}</h3>
                    <p className="text-sm text-ink">{t('visaChecklist.fee', { adult: formatEuro(q.data.fee.adult, lng), minor: formatEuro(q.data.fee.minor, lng, true) })}</p>
                  </div>
                  <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                    <h2 className="font-display text-lg font-semibold text-ink">{t('visaChecklist.linksTitle')}</h2>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {allLinks.map((l) => (
                        <li key={l.url}>
                          <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-link hover:underline" lang="de">
                            {l.label} <ExternalLink className="mt-1 size-3 shrink-0" aria-hidden />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
              <div className="rounded-3xl border border-warning-border bg-warning-bg p-4 text-sm text-warning-fg">
                <p className="font-semibold">{t('visaChecklist.noteTitle')}</p>
                <p className="mt-1">{t('visaChecklist.note')}</p>
              </div>
              <div className="rounded-3xl border border-primary bg-card p-4 sm:p-5">
                <h2 className="font-display text-lg font-semibold text-ink">{t('visaChecklist.ctaTitle')}</h2>
                <p className="mt-1 text-sm text-muted">{t('visaChecklist.ctaText')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to="/register" className={buttonClass({})}>
                    {t('visaChecklist.ctaRegister')}
                  </Link>
                  <Link to="/visa-refusal" className={buttonClass({ variant: 'ghost' })}>
                    {t('visaChecklist.ctaRefusal')}
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <GlossaryLinks
            terms={[
              { slug: 'nationales-visum', label: 'Nationales Visum' },
              { slug: 'apostille', label: 'Apostille' },
              { slug: 'beglaubigte-uebersetzung', label: 'Beglaubigte Übersetzung' },
              { slug: 'anerkennung', label: 'Anerkennung' },
              { slug: 'sperrkonto', label: 'Sperrkonto' },
              { slug: 'vorabzustimmung', label: 'Vorabzustimmung' },
            ]}
          />
          <Disclaimer>{t('visaChecklist.disclaimer')}</Disclaimer>
          <Sources checked={q.data?.asOf ?? '2026-11-16'} items={(q.data?.generalLinks ?? []).slice(0, 4)} />
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/visa-document-checklist" />
    </>
  );
}
