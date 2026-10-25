import { useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, BriefcaseBusiness, Building2, Languages, Lightbulb, RefreshCw, Save, Search, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAiWriting } from '@/i18n/pagesAiWriting';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { useApiError } from '@/components/portal/useApiError';
import { useAiWritingError, type LetterDraft } from './api';

registerCopy(pagesAiWriting);

type ExplainLang = 'az' | 'ru' | 'en' | 'de';
type Variant = 'shorter' | 'formal' | 'personal';
interface VacancyPick {
  vacancyId: string;
  title: string;
  city: string | null;
  company: string | null;
}

const useVacancyOptions = (search: string) => {
  const { tr } = useL10n();
  const applications = useQuery({
    queryKey: ['cv-letters', 'options'],
    queryFn: async () => (await api.get<{ applications: { vacancyId: string; title: string; city: string | null; company: string | null }[] }>('/cv/letters/options', { params: { lang: 'de' } })).data.applications,
  });
  const open = useQuery({
    queryKey: ['ai-writing', 'jobs', search],
    queryFn: async () =>
      (await api.get<{ items: { id: string; title: L10n; city: string | null; companyName: string | null }[] }>('/vacancies', { params: { pageSize: 12, ...(search ? { search } : {}) } })).data.items,
    staleTime: 60_000,
  });
  const mine: VacancyPick[] = (applications.data ?? []).map((a) => ({ vacancyId: a.vacancyId, title: a.title, city: a.city, company: a.company }));
  const jobs: VacancyPick[] = (open.data ?? []).filter((v) => !mine.some((m) => m.vacancyId === v.id)).map((v) => ({ vacancyId: v.id, title: tr(v.title), city: v.city, company: v.companyName }));
  return { mine, jobs, loading: applications.isLoading || open.isLoading };
};

/** /account/letters/ai — German cover letter drafted by AI, reviewed and saved by the client. */
export const AiLetterWizard = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const onAiError = useAiWritingError();
  const onError = useApiError();
  const ids = { company: useId(), position: useId(), city: useId(), notes: useId(), lang: useId(), search: useId(), title: useId(), body: useId() };
  const uiLang = (i18n.resolvedLanguage ?? 'az').slice(0, 2) as ExplainLang;

  const [mode, setMode] = useState<'vacancy' | 'manual'>('vacancy');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<VacancyPick | null>(null);
  const [manual, setManual] = useState({ company: '', position: '', city: '' });
  const [notes, setNotes] = useState('');
  const [explainLang, setExplainLang] = useState<ExplainLang>(['az', 'ru', 'en', 'de'].includes(uiLang) ? uiLang : 'az');
  const [busy, setBusy] = useState<false | 'draft' | Variant | 'save'>(false);
  const [draft, setDraft] = useState<LetterDraft | null>(null);

  useEffect(() => {
    const h = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(h);
  }, [search]);
  const options = useVacancyOptions(debounced);

  const ready = mode === 'vacancy' ? !!picked : manual.position.trim().length > 0;

  const generate = async () => {
    if (!ready) return void toast.error(t('aiw.letter.pickFirst'));
    setBusy('draft');
    try {
      const body =
        mode === 'vacancy'
          ? { vacancyId: picked!.vacancyId, notes: notes.trim() || undefined, explainLang }
          : { company: manual.company.trim() || undefined, position: manual.position.trim(), city: manual.city.trim() || undefined, notes: notes.trim() || undefined, explainLang };
      const res = await api.post<{ draft: LetterDraft }>('/ai-writing/letter-draft', body);
      setDraft(res.data.draft);
    } catch (err) {
      onAiError(err);
    } finally {
      setBusy(false);
    }
  };

  const rewrite = async (variant: Variant) => {
    if (!draft) return;
    setBusy(variant);
    try {
      const res = await api.post<{ draft: LetterDraft }>('/ai-writing/letter-rewrite', { title: draft.title, body: draft.body, variant, explainLang });
      setDraft((d) => ({ ...d, ...res.data.draft }));
    } catch (err) {
      onAiError(err);
    } finally {
      setBusy(false);
    }
  };

  /** Saves through the existing letters API: create a JOB letter, then put the AI text in it. */
  const save = async () => {
    if (!draft) return;
    setBusy('save');
    try {
      const recipient = mode === 'manual' ? [manual.company.trim(), manual.company.trim() ? 'Personalabteilung' : '', manual.city.trim()].filter(Boolean).join('\n') : '';
      const created = await api.post<{ letter: { id: string } }>('/cv/letters', {
        kind: 'JOB',
        vacancyId: mode === 'vacancy' ? picked!.vacancyId : null,
        language: 'de',
        answers: recipient ? { recipient } : {},
      });
      await api.patch(`/cv/letters/${created.data.letter.id}`, { title: draft.title.trim().slice(0, 200) || 'Bewerbung', body: draft.body });
      void qc.invalidateQueries({ queryKey: ['cv-letters'] });
      toast.success(t('aiw.letter.saved'));
      navigate(`/account/letters/${created.data.letter.id}`);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const words = draft ? draft.body.split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="space-y-5">
      <Link to="/account/letters" className="inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:text-link">
        <ArrowLeft className="size-4" aria-hidden /> {t('aiw.letter.back')}
      </Link>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-ink sm:text-2xl">
          <Sparkles className="size-5 text-primary" aria-hidden /> {t('aiw.letter.title')}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('aiw.letter.intro')}</p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="card space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2" role="tablist">
            {(['vacancy', 'manual'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={clsx('flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold', mode === m ? 'border-primary bg-sunken text-link' : 'border-line text-ink hover:bg-sunken')}
                onClick={() => setMode(m)}
              >
                {m === 'vacancy' ? <BriefcaseBusiness className="size-4" aria-hidden /> : <Building2 className="size-4" aria-hidden />}
                {t(`aiw.letter.source.${m}`)}
              </button>
            ))}
          </div>

          {mode === 'vacancy' ? (
            <div className="space-y-3">
              <label htmlFor={ids.search} className="sr-only">
                {t('aiw.letter.search')}
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <input id={ids.search} className="input pl-9" value={search} placeholder={t('aiw.letter.search')} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {options.loading ? (
                <Spinner className="size-5" />
              ) : (
                <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                  {([['myApplications', options.mine], ['openJobs', options.jobs]] as const).map(([label, list]) =>
                    list.length ? (
                      <div key={label}>
                        <p className="mb-1.5 text-xs font-semibold text-muted uppercase">{t(`aiw.letter.${label}`)}</p>
                        <ul className="space-y-1.5">
                          {list.map((v) => (
                            <li key={v.vacancyId}>
                              <button
                                type="button"
                                aria-pressed={picked?.vacancyId === v.vacancyId}
                                className={clsx('w-full rounded-xl border px-3 py-2 text-left text-sm', picked?.vacancyId === v.vacancyId ? 'border-primary bg-sunken' : 'border-line hover:bg-sunken')}
                                onClick={() => setPicked(v)}
                              >
                                <span className="block font-semibold text-ink">{v.title}</span>
                                <span className="block text-xs text-muted">{[v.company, v.city].filter(Boolean).join(' · ') || '—'}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null,
                  )}
                  {!options.mine.length && !options.jobs.length && <p className="text-sm text-muted">{t('aiw.letter.noVacancies')}</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor={ids.position} className="label">
                  {t('aiw.letter.position')} *
                </label>
                <input id={ids.position} className="input" maxLength={160} value={manual.position} onChange={(e) => setManual((m) => ({ ...m, position: e.target.value }))} />
              </div>
              <div>
                <label htmlFor={ids.company} className="label">
                  {t('aiw.letter.company')}
                </label>
                <input id={ids.company} className="input" maxLength={160} value={manual.company} onChange={(e) => setManual((m) => ({ ...m, company: e.target.value }))} />
              </div>
              <div>
                <label htmlFor={ids.city} className="label">
                  {t('aiw.letter.city')}
                </label>
                <input id={ids.city} className="input" maxLength={80} value={manual.city} onChange={(e) => setManual((m) => ({ ...m, city: e.target.value }))} />
              </div>
            </div>
          )}

          <div>
            <label htmlFor={ids.notes} className="label">
              {t('aiw.letter.notes')}
            </label>
            <textarea id={ids.notes} className="input min-h-24" maxLength={1200} value={notes} placeholder={t('aiw.letter.notesPh')} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <label htmlFor={ids.lang} className="label">
              {t('aiw.letter.explainLang')}
            </label>
            <select id={ids.lang} className="input" value={explainLang} onChange={(e) => setExplainLang(e.target.value as ExplainLang)}>
              {(['az', 'ru', 'en', 'de'] as const).map((l) => (
                <option key={l} value={l}>
                  {t(`aiw.letter.langs.${l}`)}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-primary min-h-11 w-full" disabled={!!busy || !ready} onClick={() => void generate()}>
            {busy === 'draft' ? <Spinner className="size-4" /> : draft ? <RefreshCw className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {busy === 'draft' ? t('aiw.working') : draft ? t('aiw.letter.again') : t('aiw.letter.generate')}
          </button>
        </section>

        <section className="space-y-4">
          {draft ? (
            <>
              <div className="card space-y-3 p-4 sm:p-5">
                <div>
                  <label htmlFor={ids.title} className="label">
                    {t('aiw.letter.subject')}
                  </label>
                  <input id={ids.title} className="input" maxLength={200} value={draft.title} onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))} />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor={ids.body} className="label">
                      {t('aiw.letter.body')}
                    </label>
                    <span className={clsx('text-xs tabular-nums', words < 200 || words > 380 ? 'text-warning-fg' : 'text-muted')}>{t('aiw.letter.words', { count: words })}</span>
                  </div>
                  <textarea id={ids.body} lang="de" className="input min-h-[22rem] font-serif text-[0.95rem] leading-relaxed" maxLength={6000} value={draft.body} onChange={(e) => setDraft((d) => (d ? { ...d, body: e.target.value } : d))} />
                </div>
                <div>
                  <p className="label">{t('aiw.letter.variants')}</p>
                  <div className="flex flex-wrap gap-2">
                    {(['shorter', 'formal', 'personal'] as const).map((v) => (
                      <button key={v} type="button" className="btn-ghost btn-sm" disabled={!!busy} onClick={() => void rewrite(v)}>
                        {busy === v ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" aria-hidden />} {t(`aiw.letter.variant.${v}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" className="btn-primary min-h-11 w-full sm:w-auto" disabled={!!busy || draft.body.trim().length < 20} onClick={() => void save()}>
                  {busy === 'save' ? <Spinner className="size-4" /> : <Save className="size-4" aria-hidden />} {t('aiw.letter.save')}
                </button>
              </div>
              {draft.explanation && (
                <div className="card p-4 sm:p-5">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Languages className="size-4 text-primary" aria-hidden /> {t('aiw.letter.explanation')}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink/90">{draft.explanation}</p>
                </div>
              )}
              <p className="flex items-start gap-2 text-xs text-muted">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-highlight" aria-hidden /> {t('aiw.letter.tip')}
              </p>
            </>
          ) : (
            <div className="card grid min-h-60 place-items-center p-6 text-center text-sm text-muted">
              <div>
                <Sparkles className="mx-auto size-8 text-primary" aria-hidden />
                <p className="mt-3 max-w-sm">{t('aiw.letter.intro')}</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AiLetterWizard;
