import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Languages, Search, Sparkles, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { LOCALES, type Locale } from '@/i18n';
import { Spinner } from '@/components/ui/Spinner';
import { STATUS_TONES, toneTexts } from '@/components/ui/status';
import { useJobLabels } from '@/components/jobs/labels';
import { SECTORS } from '@/components/jobs/types';
import type { VacancyFormState } from '@/components/company/VacancyForm';
import { AiWorking, UnavailableNote, aiBase, aiErrorText, costText, reasonText, useAiStatus, type AiMode } from './shared';

/**
 * "Write with AI" panel on top of the vacancy form (staff and employer portal). Everything is a click:
 *   - the employer's notes (input data, not a prompt) + optional sector / city chips → fills every form field;
 *   - "Translate missing languages" fills the empty languages of the texts;
 *   - "Improve for Google Jobs": checklist + suggested description / title with Apply / Ignore.
 * Nothing is saved here: the user reviews the form and saves it as usual.
 */

export type AiFeature = 'draft' | 'translate' | 'google';
type L10nText = Record<Locale, string>;
type TextKey = 'title' | 'description' | 'requirements' | 'benefits';

interface Draft {
  title: L10nText;
  description: L10nText;
  requirements: Record<Locale, string[]>;
  benefits: Record<Locale, string[]>;
  sector: string | null;
  city: string | null;
  profession: string | null;
  germanLevel: string | null;
  minExperience: number | null;
  drivingLicence: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  positions: number | null;
  employmentType: string;
  visaCategory: { id: string; slug: string; visaLabel: string } | null;
  assumptions: string[];
}

interface Check {
  code: string;
  status: 'ok' | 'warn' | 'fail';
  detail?: string | number;
}
interface GoogleResult {
  checks: Check[];
  suggestion: { description: L10nText; title: L10nText | null; changes: string[] } | null;
  reason?: string;
  costUsd?: number;
}

const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);
const listsOf = (v: L10nText) => Object.fromEntries(LOCALES.filter((l) => v[l].trim()).map((l) => [l, lines(v[l])]));
const textsOf = (v: L10nText) => Object.fromEntries(LOCALES.filter((l) => v[l].trim()).map((l) => [l, v[l].trim()]));
const fullText = (v: Partial<Record<Locale, string>>): L10nText => ({ az: v.az ?? '', de: v.de ?? '', en: v.en ?? '', ru: v.ru ?? '' });
const fullLines = (v: Partial<Record<Locale, string[]>>): L10nText => ({ az: (v.az ?? []).join('\n'), de: (v.de ?? []).join('\n'), en: (v.en ?? []).join('\n'), ru: (v.ru ?? []).join('\n') });

const STATUS_ICON = { ok: CheckCircle2, warn: AlertTriangle, fail: XCircle } as const;
const STATUS_TONE = toneTexts(STATUS_TONES.check);

export const VacancyAiPanel = ({
  mode,
  f,
  apply,
  onUsed,
}: {
  mode: AiMode;
  f: VacancyFormState;
  apply: (patch: Partial<VacancyFormState>) => void;
  onUsed: (feature: AiFeature) => void;
}) => {
  const { t } = useTranslation();
  const L = useJobLabels();
  const status = useAiStatus(mode);
  const base = aiBase(mode);
  const hasTitle = LOCALES.some((l) => f.title[l].trim());
  const hasDesc = LOCALES.some((l) => f.description[l].trim());
  const [open, setOpen] = useState(!hasTitle);
  const [notes, setNotes] = useState('');
  const [sector, setSector] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState<null | AiFeature>(null);
  const [assumptions, setAssumptions] = useState<string[] | null>(null);
  const [visaNote, setVisaNote] = useState<string | null>(null);
  const [google, setGoogle] = useState<GoogleResult | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const aiOff = status.data ? !status.data.available : false;

  const run = async <T,>(feature: AiFeature, fn: () => Promise<T>, done: (r: T) => void) => {
    setBusy(feature);
    try {
      done(await fn());
    } catch (err) {
      toast.error(aiErrorText(t, err));
    } finally {
      setBusy(null);
    }
  };

  const draft = () =>
    run(
      'draft',
      async () => (await api.post<{ draft: Draft; costUsd: number }>(`${base}/vacancy/draft`, { notes: notes.trim(), sector: sector || null, city: city.trim() || null })).data,
      ({ draft: d, costUsd }) => {
        apply({
          title: fullText(d.title),
          description: fullText(d.description),
          requirements: fullLines(d.requirements),
          benefits: fullLines(d.benefits),
          sector: d.sector ?? '',
          city: d.city ?? '',
          profession: d.profession ?? '',
          germanLevel: d.germanLevel ?? '',
          minExperience: d.minExperience != null ? String(d.minExperience) : '',
          drivingLicence: d.drivingLicence ?? '',
          salaryMin: d.salaryMin != null ? String(d.salaryMin) : '',
          salaryMax: d.salaryMax != null ? String(d.salaryMax) : '',
          ...(d.positions != null ? { positions: String(d.positions) } : {}),
          employmentType: d.employmentType,
          ...(mode === 'staff' && d.visaCategory ? { visaCategoryId: d.visaCategory.id } : {}),
        });
        setAssumptions(d.assumptions);
        setVisaNote(d.visaCategory ? `${d.visaCategory.visaLabel} · ${d.visaCategory.slug}` : null);
        setGoogle(null);
        setCost(costUsd);
        onUsed('draft');
        toast.success(t('aiEmployer.vacancy.filled'));
      },
    );

  const translate = () => {
    const body = { title: textsOf(f.title), description: textsOf(f.description), requirements: listsOf(f.requirements), benefits: listsOf(f.benefits) };
    return run(
      'translate',
      async () => (await api.post<{ texts: Record<TextKey, Partial<Record<Locale, string | string[]>>>; filled: string[]; costUsd: number }>(`${base}/vacancy/translate`, body)).data,
      (r) => {
        if (!r.filled.length) {
          toast.info(t('aiEmployer.vacancy.nothingToTranslate'));
          return;
        }
        const patch: Partial<VacancyFormState> = {};
        for (const k of ['title', 'description', 'requirements', 'benefits'] as const) {
          const add = r.texts[k] ?? {};
          if (!Object.keys(add).length) continue;
          const next = { ...f[k] };
          for (const l of LOCALES) {
            const v = add[l];
            if (v !== undefined && !next[l].trim()) next[l] = Array.isArray(v) ? v.join('\n') : v;
          }
          patch[k] = next;
        }
        apply(patch);
        setCost(r.costUsd);
        onUsed('translate');
        toast.success(t('aiEmployer.vacancy.translated', { count: r.filled.length }));
      },
    );
  };

  const improve = () => {
    const num = (s: string) => (s.trim() === '' ? null : Number(s));
    const body = {
      title: textsOf(f.title),
      description: textsOf(f.description),
      requirements: listsOf(f.requirements),
      benefits: listsOf(f.benefits),
      city: f.city.trim() || null,
      salaryMin: num(f.salaryMin),
      salaryMax: num(f.salaryMax),
      employmentType: f.employmentType || null,
      closesAt: f.closesAt || null,
      profession: f.profession.trim() || null,
      drivingLicence: f.drivingLicence.trim() || null,
      germanLevel: f.germanLevel || null,
    };
    return run(
      'google',
      async () => (await api.post<GoogleResult>(`${base}/vacancy/google`, body)).data,
      (r) => {
        setGoogle(r);
        setCost(r.costUsd ?? null);
        if (r.reason) toast.error(reasonText(t, r.reason));
      },
    );
  };

  const applyGoogle = (what: 'description' | 'title') => {
    const s = google?.suggestion;
    if (!s) return;
    if (what === 'description') apply({ description: { ...s.description } });
    else if (s.title) apply({ title: { ...s.title } });
    onUsed('google');
    toast.success(t('aiEmployer.vacancy.applied'));
    setGoogle((g) => (g && g.suggestion ? { ...g, suggestion: what === 'description' ? { ...g.suggestion, description: fullText({}) } : { ...g.suggestion, title: null } } : g));
  };
  const suggestionHasDesc = !!google?.suggestion && LOCALES.some((l) => google.suggestion!.description[l]);

  const costLine = costText(t, cost);

  return (
    <section className="rounded-xl border border-dashed border-brand-300 bg-surface p-4">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="flex items-center gap-2 text-sm font-bold text-navy-900">
          <Sparkles className="size-4 text-brand-600" aria-hidden /> {t('aiEmployer.vacancy.panelTitle')}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted">
          {t('aiEmployer.common.costHint')}
          <ChevronDown className={clsx('size-4 transition', open && 'rotate-180')} aria-hidden />
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <p className="text-xs text-muted">{t('aiEmployer.vacancy.panelHint')}</p>
          <UnavailableNote status={status.data} />
          <div>
            <label className="label" htmlFor={`ai-notes-${mode}`}>
              {t('aiEmployer.vacancy.notesLabel')}
            </label>
            <textarea
              id={`ai-notes-${mode}`}
              className="input min-h-20"
              maxLength={4000}
              value={notes}
              placeholder={t('aiEmployer.vacancy.notesPlaceholder')}
              onChange={(e) => setNotes(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted">{t('aiEmployer.vacancy.notesHint')}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink/80">{t('aiEmployer.vacancy.sector')}</p>
            <div className="flex flex-wrap gap-1.5">
              {['', ...SECTORS].map((s) => (
                <button
                  key={s || 'any'}
                  type="button"
                  aria-pressed={sector === s}
                  onClick={() => setSector(s)}
                  className={clsx(
                    'inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold transition',
                    sector === s ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-ink/75 hover:border-brand-400',
                  )}
                >
                  {s ? L.sector(s) : t('aiEmployer.vacancy.any')}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 sm:max-w-56">
              <label className="label" htmlFor={`ai-city-${mode}`}>
                {t('aiEmployer.vacancy.city')}
              </label>
              <input id={`ai-city-${mode}`} className="input py-2" maxLength={80} value={city} placeholder="Hamburg" onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
            </div>
            <button type="button" className="btn-primary btn-sm min-h-10" disabled={!!busy || aiOff || notes.trim().length < 10} onClick={() => void draft()}>
              {busy === 'draft' ? <Spinner className="size-3.5" /> : <Sparkles className="size-3.5" />} {t('aiEmployer.vacancy.generate')}
            </button>
          </div>
          {busy === 'draft' && <AiWorking lines={3} />}
          {assumptions && (assumptions.length > 0 || visaNote) && (
            <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              <p className="mb-1 flex items-center gap-1.5 font-semibold">
                <Info className="size-3.5" aria-hidden /> {t('aiEmployer.vacancy.assumptions')}
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
                {visaNote && mode === 'staff' && <li>{t('aiEmployer.vacancy.visaSuggested', { label: visaNote })}</li>}
              </ul>
            </div>
          )}

          <div className="border-t border-line pt-3">
            <p className="mb-2 text-xs font-semibold text-ink/80">{t('aiEmployer.vacancy.tools')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary btn-sm" disabled={!!busy || aiOff || !hasTitle || !hasDesc} onClick={() => void translate()} title={!hasTitle || !hasDesc ? t('aiEmployer.vacancy.needText') : undefined}>
                {busy === 'translate' ? <Spinner className="size-3.5" /> : <Languages className="size-3.5" />} {t('aiEmployer.vacancy.translate')}
              </button>
              <button type="button" className="btn-secondary btn-sm" disabled={!!busy || aiOff || !hasTitle || !hasDesc} onClick={() => void improve()} title={!hasTitle || !hasDesc ? t('aiEmployer.vacancy.needText') : undefined}>
                {busy === 'google' ? <Spinner className="size-3.5" /> : <Search className="size-3.5" />} {t('aiEmployer.vacancy.google')}
              </button>
            </div>
            {(!hasTitle || !hasDesc) && <p className="mt-1 text-[11px] text-muted">{t('aiEmployer.vacancy.needText')}</p>}
            {(busy === 'translate' || busy === 'google') && (
              <div className="mt-3">
                <AiWorking lines={3} />
              </div>
            )}
          </div>

          {google && (
            <div className="space-y-3 rounded-lg border border-line bg-white p-3">
              <p className="text-sm font-bold text-navy-900">{t('aiEmployer.vacancy.googleTitle')}</p>
              <ul className="space-y-1.5">
                {google.checks.map((c) => {
                  const I = STATUS_ICON[c.status];
                  return (
                    <li key={c.code} className="flex items-start gap-2 text-xs">
                      <I className={clsx('mt-px size-4 shrink-0', STATUS_TONE[c.status])} aria-hidden />
                      <span className="min-w-0 text-ink">
                        {t(`aiEmployer.vacancy.checks.${c.code}`, { n: c.detail ?? 0 })}
                        <span className={clsx('ml-1.5 font-semibold', STATUS_TONE[c.status])}>· {t(`aiEmployer.vacancy.status.${c.status}`)}</span>
                        {c.code === 'TITLE_CLEAN' && c.detail && <span className="block text-muted">{t('aiEmployer.vacancy.found', { detail: c.detail })}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {google.suggestion?.title && (
                <div className="space-y-1.5 border-t border-line pt-3">
                  <p className="text-xs font-semibold text-ink/80">{t('aiEmployer.vacancy.suggestedTitle')}</p>
                  <p className="text-sm text-ink">{google.suggestion.title.de || google.suggestion.title.en}</p>
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary btn-sm" onClick={() => applyGoogle('title')}>
                      {t('aiEmployer.vacancy.applyTitle')}
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setGoogle((g) => (g?.suggestion ? { ...g, suggestion: { ...g.suggestion, title: null } } : g))}>
                      {t('aiEmployer.common.ignore')}
                    </button>
                  </div>
                </div>
              )}
              {suggestionHasDesc && (
                <div className="space-y-1.5 border-t border-line pt-3">
                  <p className="text-xs font-semibold text-ink/80">{t('aiEmployer.vacancy.suggestion')}</p>
                  <p className="max-h-48 overflow-y-auto rounded-md bg-surface px-3 py-2 text-xs whitespace-pre-line text-ink">{google.suggestion!.description.de || google.suggestion!.description.en}</p>
                  {google.suggestion!.changes.length > 0 && (
                    <p className="text-[11px] text-muted">
                      {t('aiEmployer.vacancy.changes')}: {google.suggestion!.changes.join(' · ')}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary btn-sm" onClick={() => applyGoogle('description')}>
                      {t('aiEmployer.vacancy.applyDescription')}
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setGoogle((g) => (g?.suggestion ? { ...g, suggestion: { ...g.suggestion, description: fullText({}) } } : g))}>
                      {t('aiEmployer.common.ignore')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {costLine && <p className="text-[11px] text-muted">{costLine}</p>}
        </div>
      )}
    </section>
  );
};
