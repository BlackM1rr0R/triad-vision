import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Check, ChevronDown, Copy, Download, FileText, FolderOpen, Lightbulb, Plane, Plus, RefreshCw, ScrollText, Sparkles, Stamp, Trash2, type LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesCv } from '@/i18n/pagesCv';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageLoader, Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/portal/ConfirmDialog';
import { useErrorMessage } from '@/components/portal/useApiError';
import { useBlobDownload } from '@/components/cv/CvDownloadButton';
import { SaveIndicator, type SaveState } from '@/components/cv/fields';
import { errorCode } from '@/lib/api';
import { AiLetterWizard } from '@/components/aiWriting/AiLetterWizard';
import { pagesAiWriting } from '@/i18n/pagesAiWriting';

registerCopy(pagesCv);
registerCopy(pagesAiWriting);

type Kind = 'VISA' | 'JOB' | 'ANERKENNUNG';
type Lang = 'de' | 'en';
const KINDS: Kind[] = ['VISA', 'JOB', 'ANERKENNUNG'];
const KIND_ICON: Record<Kind, LucideIcon> = { VISA: Plane, JOB: BriefcaseBusiness, ANERKENNUNG: Stamp };
const QUESTIONS = ['whyGermany', 'whyJob', 'experience', 'german', 'plans', 'family'] as const;
type AnswerKey = (typeof QUESTIONS)[number] | 'recipient';
type Answers = Partial<Record<AnswerKey, string>>;
const ANSWER_MAX: Record<AnswerKey, number> = { whyGermany: 1200, whyJob: 1200, experience: 1200, german: 800, plans: 1200, family: 800, recipient: 300 };

interface Letter {
  id: string;
  kind: Kind;
  caseId: string | null;
  vacancyId: string | null;
  title: string;
  language: Lang;
  answers: Answers;
  body: string;
  createdAt: string;
  updatedAt: string;
}
interface Options {
  cases: { id: string; number: string; profession: string; status: string; vacancyId: string | null; visa: string | null }[];
  applications: { id: string; status: string; vacancyId: string; title: string; city: string | null; company: string | null }[];
}

const LIST_KEY = ['cv-letters'] as const;
const letterKey = (id: string) => ['cv-letters', id] as const;

/** Translated error toast for letter requests. */
const useLetterError = () => {
  const { t, i18n } = useTranslation();
  const generic = useErrorMessage();
  return useCallback(
    (err: unknown) => {
      const key = `letters.errors.${errorCode(err)}`;
      toast.error(i18n.exists(key) ? t(key) : generic(err));
    },
    [t, i18n, generic],
  );
};

const cleanAnswers = (a: Answers): Answers => Object.fromEntries(Object.entries(a).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v!.trim()]));

const useDate = () => {
  const { i18n } = useTranslation();
  return (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso));
};

// ─── List ────────────────────────────────────────────────────────────────

const LettersList = () => {
  const { t } = useTranslation();
  const date = useDate();
  const { data, isLoading } = useQuery({ queryKey: LIST_KEY, queryFn: async () => (await api.get<{ items: Letter[] }>('/cv/letters')).data.items });
  if (isLoading) return <PageLoader />;
  const items = data ?? [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-ink sm:text-2xl">{t('letters.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('letters.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="ai" className="btn-ghost btn-sm">
            <Sparkles className="size-4" aria-hidden /> {t('aiw.letter.button')}
          </Link>
          <Link to="new" className="btn-primary btn-sm">
            <Plus className="size-4" aria-hidden /> {t('letters.new')}
          </Link>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          {/* TODO(ui): large portal empty state (size-14 icon, display title) -> <EmptyState size="lg" tone="brand"> (portal rework) */}
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-100 text-brand-600">
            <ScrollText className="size-7" aria-hidden />
          </span>
          <p className="mt-4 text-lg font-bold text-ink">{t('letters.empty')}</p>
          <p className="mt-1 max-w-md text-sm text-muted">{t('letters.emptyHint')}</p>
          <Link to="new" className="btn-primary mt-5">
            <Plus className="size-4" aria-hidden /> {t('letters.new')}
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3">
          {items.map((l) => {
            const Icon = KIND_ICON[l.kind];
            return (
              <li key={l.id}>
                <Link to={l.id} className="card flex items-start gap-3 p-4 transition hover:border-brand-400/60 sm:p-5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-600">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold tracking-wide text-brand-600 uppercase">{t(`letters.kinds.${l.kind}`)}</span>
                      <span className="badge bg-surface text-muted uppercase">{l.language}</span>
                    </div>
                    <p className="mt-1 font-bold break-words text-ink">{l.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{l.body.split('\n\n')[1] ?? ''}</p>
                    <p className="mt-2 text-xs text-muted">{t('letters.updated', { date: date(l.updatedAt) })}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

// ─── Wizard ──────────────────────────────────────────────────────────────

const Steps = ({ step }: { step: number }) => {
  const { t } = useTranslation();
  const labels = [t('letters.steps.kind'), t('letters.steps.link'), t('letters.steps.questions'), t('letters.steps.result')];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold">
      {labels.map((l, i) => (
        <li key={l} className="flex items-center gap-2" aria-current={i === step ? 'step' : undefined}>
          <span
            className={clsx(
              'grid size-6 place-items-center rounded-full text-[11px] tabular-nums',
              i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-600 text-white' : 'bg-surface text-muted',
            )}
          >
            {i < step ? <Check className="size-3.5" aria-hidden /> : i + 1}
          </span>
          <span className={i === step ? 'text-ink' : 'text-muted'}>{l}</span>
          {i < labels.length - 1 && <span className="mx-1 h-px w-5 bg-line" aria-hidden />}
        </li>
      ))}
    </ol>
  );
};

const QuestionFields = ({ answers, onChange, kind }: { answers: Answers; onChange: (a: Answers) => void; kind: Kind }) => {
  const { t } = useTranslation();
  const id = useId();
  const keys: AnswerKey[] = [...QUESTIONS, 'recipient'];
  // The family question matters most for the visa; for the other letters it stays optional at the end.
  const ordered = kind === 'JOB' ? (['whyJob', 'experience', 'whyGermany', 'german', 'plans', 'family', 'recipient'] as AnswerKey[]) : keys;
  return (
    <div className="space-y-5">
      {ordered.map((key) => {
        const value = answers[key] ?? '';
        return (
          <div key={key}>
            <label htmlFor={`${id}-${key}`} className="label text-sm">
              {t(`letters.questions.${key}.label`)}
            </label>
            <p id={`${id}-${key}-h`} className="mb-1.5 text-xs text-muted">
              {t(`letters.questions.${key}.hint`)}
            </p>
            <textarea
              id={`${id}-${key}`}
              aria-describedby={`${id}-${key}-h ${id}-${key}-e`}
              className="input min-h-20"
              rows={key === 'recipient' ? 3 : 2}
              maxLength={ANSWER_MAX[key]}
              value={value}
              onChange={(e) => onChange({ ...answers, [key]: e.target.value })}
            />
            <p id={`${id}-${key}-e`} className="mt-1 text-[11px] whitespace-pre-line text-muted/90 italic">
              {t(`letters.questions.${key}.example`)}
            </p>
          </div>
        );
      })}
    </div>
  );
};

const LangToggle = ({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) => {
  const { t } = useTranslation();
  return (
    <fieldset>
      <legend className="label">{t('letters.docLang')}</legend>
      <div className="inline-flex rounded-lg border border-line p-0.5">
        {(['de', 'en'] as const).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={value === l}
            onClick={() => onChange(l)}
            className={clsx('rounded-md px-3 py-1.5 text-xs font-semibold transition', value === l ? 'bg-brand-600 text-white' : 'text-ink/75 hover:bg-surface')}
          >
            {t(`cvb.docLang.${l}`)}
          </button>
        ))}
      </div>
    </fieldset>
  );
};

const NewLetter = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const onError = useLetterError();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Kind | null>(null);
  const [link, setLink] = useState<{ caseId?: string; vacancyId?: string }>({});
  const [answers, setAnswers] = useState<Answers>({});
  const [language, setLanguage] = useState<Lang>('de');
  const options = useQuery({ queryKey: ['cv-letter-options'], queryFn: async () => (await api.get<Options>('/cv/letters/options')).data });
  const create = useMutation({
    mutationFn: async () => (await api.post<{ letter: Letter }>('/cv/letters', { kind, language, ...link, answers: cleanAnswers(answers) })).data.letter,
    onSuccess: (letter) => {
      qc.setQueryData(letterKey(letter.id), letter);
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      navigate(`/account/letters/${letter.id}`, { replace: true });
    },
    onError,
  });

  const cases = options.data?.cases ?? [];
  const apps = options.data?.applications ?? [];
  const caseFirst = kind !== 'JOB';
  const radio = (selected: boolean) =>
    clsx('flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition', selected ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/15' : 'border-line hover:border-brand-300');

  const caseList = cases.length > 0 && (
    <div>
      <p className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{t('letters.link.cases')}</p>
      <div className="grid gap-2">
        {cases.map((c) => (
          <button key={c.id} type="button" aria-pressed={link.caseId === c.id} className={radio(link.caseId === c.id)} onClick={() => setLink({ caseId: c.id })}>
            <FolderOpen className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{t('letters.link.caseLabel', { number: c.number })}</span>
              <span className="block truncate text-xs text-muted">{[c.profession, c.visa].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
  const appList = apps.length > 0 && (
    <div>
      <p className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{t('letters.link.apps')}</p>
      <div className="grid gap-2">
        {apps.map((a) => (
          <button key={a.id} type="button" aria-pressed={link.vacancyId === a.vacancyId && !link.caseId} className={radio(link.vacancyId === a.vacancyId && !link.caseId)} onClick={() => setLink({ vacancyId: a.vacancyId })}>
            <BriefcaseBusiness className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{a.title}</span>
              <span className="block truncate text-xs text-muted">{[a.company, a.city].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <Link to="/account/letters" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
        <ArrowLeft className="size-4" aria-hidden /> {t('letters.back')}
      </Link>
      <div>
        <h1 className="text-xl font-extrabold text-ink sm:text-2xl">{t('letters.new')}</h1>
        <div className="mt-3">
          <Steps step={step} />
        </div>
      </div>

      <div className="card card-pad">
        {step === 0 && (
          <div className="grid gap-3 md:grid-cols-3">
            {KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => {
                    setKind(k);
                    setLink({});
                  }}
                  className={clsx(
                    'flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition',
                    kind === k ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/15' : 'border-line hover:border-brand-300',
                  )}
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-100 text-brand-600">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-bold text-ink">{t(`letters.kinds.${k}`)}</span>
                  <span className="text-xs leading-relaxed text-muted">{t(`letters.kindHints.${k}`)}</span>
                </button>
              );
            })}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-ink">{t('letters.link.title')}</h2>
              <p className="mt-1 text-sm text-muted">{t('letters.link.hint')}</p>
            </div>
            {options.isLoading ? (
              <Spinner className="size-5" />
            ) : (
              <>
                <button type="button" aria-pressed={!link.caseId && !link.vacancyId} className={radio(!link.caseId && !link.vacancyId)} onClick={() => setLink({})}>
                  <FileText className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                  <span className="text-sm font-semibold text-ink">{t('letters.link.none')}</span>
                </button>
                {!cases.length && !apps.length && <p className="text-sm text-muted">{t('letters.link.noOptions')}</p>}
                {caseFirst ? (
                  <>
                    {caseList}
                    {appList}
                  </>
                ) : (
                  <>
                    {appList}
                    {caseList}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {step === 2 && kind && (
          <div className="space-y-5">
            <p className="flex items-start gap-2 rounded-xl border border-brand-200/60 bg-brand-50/60 px-4 py-3 text-sm text-ink/80">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              {t('letters.questions.intro')}
            </p>
            <LangToggle value={language} onChange={setLanguage} />
            <QuestionFields answers={answers} onChange={setAnswers} kind={kind} />
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-line pt-5">
          <button type="button" className="btn-ghost btn-sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="size-4" aria-hidden /> {t('letters.back')}
          </button>
          {step < 2 ? (
            <button type="button" className="btn-primary btn-sm" disabled={!kind} onClick={() => setStep((s) => s + 1)}>
              {t('letters.next')} <ArrowRight className="size-4" aria-hidden />
            </button>
          ) : (
            <button type="button" className="btn-primary btn-sm" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Spinner className="size-4" /> : <ScrollText className="size-4" aria-hidden />} {t('letters.generate')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Editor ──────────────────────────────────────────────────────────────

const LetterEditor = () => {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const onError = useLetterError();
  const date = useDate();
  const download = useBlobDownload();
  const subjectId = useId();
  const bodyId = useId();
  const { data: letter, isLoading, error } = useQuery({
    queryKey: letterKey(id),
    queryFn: async () => (await api.get<{ letter: Letter }>(`/cv/letters/${id}`)).data.letter,
    refetchOnWindowFocus: false,
  });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [answers, setAnswers] = useState<Answers>({});
  const [language, setLanguage] = useState<Lang>('de');
  const [state, setState] = useState<SaveState>('idle');
  const [confirm, setConfirm] = useState<'regen' | 'delete' | null>(null);
  const loadedId = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<{ title: string; body: string } | null>(null);

  useEffect(() => {
    if (letter && loadedId.current !== letter.id) {
      loadedId.current = letter.id;
      setTitle(letter.title);
      setBody(letter.body);
      setAnswers(letter.answers ?? {});
      setLanguage(letter.language);
    }
  }, [letter]);

  const save = useCallback(async () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setState('saving');
    try {
      const res = await api.patch<{ letter: Letter }>(`/cv/letters/${id}`, { title: p.title.trim() || undefined, body: p.body });
      qc.setQueryData(letterKey(id), res.data.letter);
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      setState(pending.current ? 'dirty' : 'saved');
    } catch {
      pending.current ??= p;
      setState('error');
    }
  }, [id, qc]);

  const edit = (next: { title?: string; body?: string }) => {
    const v = { title: next.title ?? title, body: next.body ?? body };
    if (next.title !== undefined) setTitle(next.title);
    if (next.body !== undefined) setBody(next.body);
    pending.current = v;
    setState('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), 1000);
  };
  const flush = async () => {
    window.clearTimeout(timer.current);
    await save();
  };
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pending.current) void save();
    },
    [save],
  );

  const regen = useMutation({
    mutationFn: async () => (await api.post<{ letter: Letter }>(`/cv/letters/${id}/regenerate`, { answers: cleanAnswers(answers), language })).data.letter,
    onSuccess: (l) => {
      window.clearTimeout(timer.current);
      pending.current = null;
      qc.setQueryData(letterKey(id), l);
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      setTitle(l.title);
      setBody(l.body);
      setState('saved');
      setConfirm(null);
    },
    onError: (err) => {
      setConfirm(null);
      onError(err);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/cv/letters/${id}`),
    onSuccess: () => {
      pending.current = null;
      qc.removeQueries({ queryKey: letterKey(id) });
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      toast.success(t('letters.deleted'));
      navigate('/account/letters', { replace: true });
    },
    onError,
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${title}\n\n${body}`);
      toast.success(t('letters.copied'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  if (isLoading) return <PageLoader />;
  if (error || !letter)
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-muted">{t('letters.errors.LETTER_NOT_FOUND')}</p>
        <Link to="/account/letters" className="btn-ghost btn-sm mt-4">
          <ArrowLeft className="size-4" aria-hidden /> {t('letters.back')}
        </Link>
      </div>
    );
  const Icon = KIND_ICON[letter.kind];

  return (
    <div className="space-y-5">
      <Link to="/account/letters" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
        <ArrowLeft className="size-4" aria-hidden /> {t('letters.back')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-600">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wide text-brand-600 uppercase">{t(`letters.kinds.${letter.kind}`)}</p>
            <p className="text-xs text-muted">{t('letters.updated', { date: date(letter.updatedAt) })}</p>
          </div>
        </div>
        <SaveIndicator state={state} onRetry={() => void flush()} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="card card-pad min-w-0 space-y-4">
          <div>
            <label htmlFor={subjectId} className="label">
              {t('letters.subject')}
            </label>
            <input id={subjectId} className="input font-semibold" maxLength={200} value={title} onChange={(e) => edit({ title: e.target.value })} />
          </div>
          <div>
            <label htmlFor={bodyId} className="label">
              {t('letters.body')}
            </label>
            <textarea
              id={bodyId}
              className="input min-h-[28rem] font-serif text-[15px] leading-relaxed"
              maxLength={20000}
              value={body}
              onChange={(e) => edit({ body: e.target.value })}
              lang={letter.language}
              spellCheck
            />
            <p className="mt-1 text-xs text-muted">{t('letters.bodyHint')}</p>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="card space-y-2.5 p-5">
            <button
              type="button"
              className="btn-primary w-full"
              disabled={download.busy}
              onClick={async () => {
                await flush();
                await download.run(`/cv/letters/${id}/pdf`, 'Motivationsschreiben.pdf');
              }}
            >
              {download.busy ? <Spinner className="size-4" /> : <Download className="size-4" aria-hidden />} {t('letters.download')}
            </button>
            <button type="button" className="btn-ghost btn-sm w-full" onClick={() => void copy()}>
              <Copy className="size-4" aria-hidden /> {t('letters.copy')}
            </button>
            <button type="button" className="btn-ghost btn-sm w-full" onClick={() => setConfirm('regen')} disabled={regen.isPending}>
              <RefreshCw className={clsx('size-4', regen.isPending && 'animate-spin')} aria-hidden /> {t('letters.regenerate')}
            </button>
            <button type="button" className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-danger hover:bg-danger/10" onClick={() => setConfirm('delete')}>
              <Trash2 className="size-4" aria-hidden /> {t('letters.delete')}
            </button>
          </div>

          <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-xs leading-relaxed text-muted">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            {t('letters.tip')}
          </p>

          <details className="card group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-ink">
              {t('letters.answers')}
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="mt-2 text-xs text-muted">{t('letters.answersHint')}</p>
            <div className="mt-4 space-y-4">
              <LangToggle value={language} onChange={setLanguage} />
              <QuestionFields answers={answers} onChange={setAnswers} kind={letter.kind} />
              <button type="button" className="btn-ghost btn-sm w-full" onClick={() => setConfirm('regen')} disabled={regen.isPending}>
                <RefreshCw className="size-4" aria-hidden /> {t('letters.regenerate')}
              </button>
            </div>
          </details>
        </aside>
      </div>

      <ConfirmDialog
        open={confirm === 'regen'}
        title={t('letters.regenerateTitle')}
        confirmLabel={t('letters.regenerate')}
        busy={regen.isPending}
        onConfirm={() => regen.mutate()}
        onClose={() => setConfirm(null)}
      >
        {t('letters.regenerateText')}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'delete'}
        title={t('letters.deleteTitle')}
        confirmLabel={t('letters.delete')}
        danger
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirm(null)}
      >
        {t('letters.deleteText')}
      </ConfirmDialog>
    </div>
  );
};

export default function AccountLetters() {
  const { t } = useTranslation();
  usePageTitle(t('letters.title'));
  return (
    <Routes>
      <Route index element={<LettersList />} />
      <Route path="new" element={<NewLetter />} />
      <Route path="ai" element={<AiLetterWizard />} />
      <Route path=":id" element={<LetterEditor />} />
    </Routes>
  );
}
