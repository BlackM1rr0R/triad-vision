import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Award, BriefcaseBusiness, Car, Download, GraduationCap, Heart, Languages, Plus, Sparkles, UserRound, Wand2, Wrench, Share2, PencilLine, ImageIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesCv } from '@/i18n/pagesCv';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageLoader, Spinner } from '@/components/ui/Spinner';
import { ProgressRing } from '@/components/portal/ProgressRing';
import { useApiError } from '@/components/portal/useApiError';
import { useBlobDownload } from '@/components/cv/CvDownloadButton';
import { AiCvWizard } from '@/components/aiWriting/AiCvWizard';
import { EntryToolbar, MonthPicker, SaveIndicator, SectionCard, Switch, TagInput, TemplatePreview, TextField, moveItem, type SaveState } from '@/components/cv/fields';
import {
  CV_LEVELS,
  CV_MAX,
  completeness,
  educationComplete,
  emptyEducation,
  emptyExperience,
  experienceComplete,
  toPayload,
  type CvCertificate,
  type CvData,
  type CvEducation,
  type CvExperience,
  type CvLang,
  type CvLanguage,
  type CvProfile,
  type CvState,
  type CvTemplate,
} from '@/components/cv/types';

registerCopy(pagesCv);

const CV_KEY = ['cv'] as const;

// Entries carry a client-only key so React keeps inputs stable while reordering.
type Keyed<T> = T & { _k: string };
interface Draft extends Omit<CvData, 'experience' | 'education' | 'languages' | 'certificates'> {
  experience: Keyed<CvExperience>[];
  education: Keyed<CvEducation>[];
  languages: Keyed<CvLanguage>[];
  certificates: Keyed<CvCertificate>[];
}
let keySeq = 0;
const k = <T extends object>(x: T): Keyed<T> => ({ ...x, _k: `e${++keySeq}` });
const strip = <T extends object>(x: Keyed<T>): T => {
  const { _k, ...rest } = x;
  void _k;
  return rest as unknown as T;
};
const toDraft = (d: CvData): Draft => ({ ...d, experience: d.experience.map(k), education: d.education.map(k), languages: d.languages.map(k), certificates: d.certificates.map(k) });
const fromDraft = (d: Draft): CvData => ({
  ...d,
  experience: d.experience.map(strip),
  education: d.education.map(strip),
  languages: d.languages.map(strip),
  certificates: d.certificates.map(strip),
});

type Settings = { template: CvTemplate; shareWithEmployers: boolean };

/** Debounced autosave of the CV (data + template + share flag). */
const useAutosave = (initial: { draft: Draft; settings: Settings }) => {
  const qc = useQueryClient();
  const [draft, setDraftState] = useState(initial.draft);
  const [settings, setSettingsState] = useState(initial.settings);
  const [state, setState] = useState<SaveState>('idle');
  const rev = useRef(0);
  const savedRev = useRef(0);
  const latest = useRef({ draft, settings });
  latest.current = { draft, settings };
  const timer = useRef<number | undefined>(undefined);
  const inflight = useRef<Promise<void> | null>(null);

  const save = useCallback(async (): Promise<void> => {
    if (inflight.current) await inflight.current;
    if (savedRev.current === rev.current) return;
    const target = rev.current;
    const { draft: d, settings: s } = latest.current;
    setState('saving');
    const p = (async () => {
      try {
        const res = await api.put<{ cv: CvState; completeness: number }>('/cv', { data: toPayload(fromDraft(d)), template: s.template, shareWithEmployers: s.shareWithEmployers });
        savedRev.current = target;
        qc.setQueryData(CV_KEY, (old: { cv: CvState; profile: CvProfile } | undefined) => (old ? { ...old, cv: res.data.cv } : old));
        setState(rev.current === target ? 'saved' : 'dirty');
      } catch {
        setState('error');
      }
    })();
    inflight.current = p;
    await p;
    inflight.current = null;
  }, [qc]);

  const schedule = useCallback(() => {
    rev.current += 1;
    setState('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), 1200);
  }, [save]);

  const setDraft = useCallback(
    (fn: (d: Draft) => Draft) => {
      setDraftState((d) => fn(d));
      schedule();
    },
    [schedule],
  );
  const setSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettingsState((s) => ({ ...s, ...patch }));
      schedule();
    },
    [schedule],
  );
  /** Save now (before a download or prefill). */
  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    await save();
  }, [save]);
  const replace = useCallback((d: Draft) => {
    setDraftState(d);
    latest.current = { ...latest.current, draft: d };
  }, []);

  // Unsaved changes: warn before leaving the page, save when the component unmounts.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (savedRev.current !== rev.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      window.clearTimeout(timer.current);
      if (savedRev.current !== rev.current) void save();
    };
  }, [save]);

  return { draft, setDraft, settings, setSettings, state, flush, replace, retry: save };
};

// ─── Section editors ─────────────────────────────────────────────────────

const ExperienceEditor = ({ items, onChange }: { items: Keyed<CvExperience>[]; onChange: (v: Keyed<CvExperience>[]) => void }) => {
  const { t } = useTranslation();
  const set = (i: number, patch: Partial<CvExperience>) => onChange(items.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <div className="space-y-4">
      {items.length === 0 && <p className="text-sm text-muted">{t('cvb.empty')}</p>}
      {items.map((e, i) => {
        const incomplete = !experienceComplete(e);
        const label = e.title || `${t('cvb.sections.experience')} ${i + 1}`;
        return (
          <div key={e._k} className={clsx('rounded-xl border p-4', incomplete ? 'border-warning-border bg-warning-bg' : 'border-line bg-sunken')}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-bold text-ink">{label}</p>
              <EntryToolbar index={i} count={items.length} label={label} onMove={(to) => onChange(moveItem(items, i, to))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={t('cvb.fields.title')} required value={e.title} max={CV_MAX.title} placeholder={t('cvb.fields.titlePh')} onChange={(v) => set(i, { title: v })} />
              <TextField label={t('cvb.fields.employer')} value={e.employer} max={CV_MAX.org} onChange={(v) => set(i, { employer: v })} />
              <TextField label={t('cvb.fields.city')} value={e.city} max={CV_MAX.place} onChange={(v) => set(i, { city: v })} />
              <TextField label={t('cvb.fields.country')} value={e.country} max={CV_MAX.place} onChange={(v) => set(i, { country: v })} />
              <MonthPicker label={`${t('cvb.fields.from')} *`} value={e.from || null} onChange={(v) => set(i, { from: v ?? '' })} />
              <div className="space-y-2">
                <MonthPicker label={t('cvb.fields.to')} value={e.to} disabled={isCurrent(e)} onChange={(v) => set(i, { to: v })} optional />
                <label className="inline-flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" className="size-4 accent-primary" checked={isCurrent(e)} onChange={(ev) => set(i, { to: ev.target.checked ? null : e.from || thisMonth() })} />
                  {t('cvb.fields.current')}
                </label>
              </div>
            </div>
            <TaskList tasks={e.tasks} onChange={(tasks) => set(i, { tasks })} />
            {incomplete && <p className="mt-3 text-xs font-medium text-warning-fg">{t('cvb.hints.incomplete')}</p>}
          </div>
        );
      })}
      {items.length < CV_MAX.experience && (
        <button type="button" className="btn-ghost btn-sm" onClick={() => onChange([...items, k(emptyExperience())])}>
          <Plus className="size-4" aria-hidden /> {t('cvb.add.experience')}
        </button>
      )}
    </div>
  );
};

/** No end date = current position. */
const isCurrent = (e: CvExperience) => e.to === null;
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const TaskList = ({ tasks, onChange }: { tasks: string[]; onChange: (v: string[]) => void }) => {
  const { t } = useTranslation();
  const id = useId();
  return (
    <fieldset className="mt-4">
      <legend className="label">{t('cvb.fields.tasks')}</legend>
      <ul className="space-y-2">
        {tasks.map((task, i) => (
          <li key={i} className="flex gap-2">
            <label htmlFor={`${id}-${i}`} className="sr-only">
              {t('cvb.fields.tasks')} {i + 1}
            </label>
            <input
              id={`${id}-${i}`}
              className="input min-w-0 flex-1"
              value={task}
              maxLength={CV_MAX.task}
              placeholder={t('cvb.fields.taskPh')}
              onChange={(e) => onChange(tasks.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger"
              aria-label={`${t('cvb.actions.remove')}: ${task || i + 1}`}
              onClick={() => onChange(tasks.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {tasks.length < CV_MAX.tasks && (
        <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-link hover:text-link" onClick={() => onChange([...tasks, ''])}>
          <Plus className="size-3.5" aria-hidden /> {t('cvb.fields.addTask')}
        </button>
      )}
    </fieldset>
  );
};

const EducationEditor = ({ items, onChange }: { items: Keyed<CvEducation>[]; onChange: (v: Keyed<CvEducation>[]) => void }) => {
  const { t } = useTranslation();
  const set = (i: number, patch: Partial<CvEducation>) => onChange(items.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <div className="space-y-4">
      {items.length === 0 && <p className="text-sm text-muted">{t('cvb.empty')}</p>}
      {items.map((e, i) => {
        const incomplete = !educationComplete(e);
        const label = e.degree || `${t('cvb.sections.education')} ${i + 1}`;
        return (
          <div key={e._k} className={clsx('rounded-xl border p-4', incomplete ? 'border-warning-border bg-warning-bg' : 'border-line bg-sunken')}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-bold text-ink">{label}</p>
              <EntryToolbar index={i} count={items.length} label={label} onMove={(to) => onChange(moveItem(items, i, to))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={t('cvb.fields.degree')} required value={e.degree} max={CV_MAX.org} placeholder={t('cvb.fields.degreePh')} onChange={(v) => set(i, { degree: v })} />
              <TextField label={t('cvb.fields.field')} value={e.field} max={CV_MAX.org} onChange={(v) => set(i, { field: v })} />
              <TextField label={t('cvb.fields.institution')} value={e.institution} max={CV_MAX.org} onChange={(v) => set(i, { institution: v })} className="sm:col-span-2" />
              <TextField label={t('cvb.fields.city')} value={e.city} max={CV_MAX.place} onChange={(v) => set(i, { city: v })} />
              <TextField label={t('cvb.fields.country')} value={e.country} max={CV_MAX.place} onChange={(v) => set(i, { country: v })} />
              <MonthPicker label={t('cvb.fields.from')} value={e.from} onChange={(v) => set(i, { from: v })} optional />
              <MonthPicker label={t('cvb.fields.to')} value={e.to} onChange={(v) => set(i, { to: v })} optional />
            </div>
            {incomplete && <p className="mt-3 text-xs font-medium text-warning-fg">{t('cvb.hints.incompleteEdu')}</p>}
          </div>
        );
      })}
      {items.length < CV_MAX.education && (
        <button type="button" className="btn-ghost btn-sm" onClick={() => onChange([...items, k(emptyEducation())])}>
          <Plus className="size-4" aria-hidden /> {t('cvb.add.education')}
        </button>
      )}
    </div>
  );
};

const LanguagesEditor = ({ items, onChange }: { items: Keyed<CvLanguage>[]; onChange: (v: Keyed<CvLanguage>[]) => void }) => {
  const { t } = useTranslation();
  const id = useId();
  const set = (i: number, patch: Partial<CvLanguage>) => onChange(items.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm text-muted">{t('cvb.empty')}</p>}
      {items.map((l, i) => (
        <div key={l._k} className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-sunken p-3">
          <TextField label={t('cvb.fields.language')} value={l.language} max={CV_MAX.language} placeholder={t('cvb.fields.languagePh')} onChange={(v) => set(i, { language: v })} className="min-w-40 flex-1" />
          <div className="w-40">
            <label htmlFor={`${id}-${i}`} className="label">
              {t('cvb.fields.level')}
            </label>
            <select id={`${id}-${i}`} className="input" value={l.level} onChange={(e) => set(i, { level: e.target.value as CvLanguage['level'] })}>
              {CV_LEVELS.map((lv) => (
                <option key={lv} value={lv}>
                  {lv === 'native' ? t('cvb.fields.native') : lv}
                </option>
              ))}
            </select>
          </div>
          <EntryToolbar index={i} count={items.length} label={l.language || String(i + 1)} onMove={(to) => onChange(moveItem(items, i, to))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      {items.length < CV_MAX.languages && (
        <button type="button" className="btn-ghost btn-sm" onClick={() => onChange([...items, k({ language: '', level: 'B1' })])}>
          <Plus className="size-4" aria-hidden /> {t('cvb.add.language')}
        </button>
      )}
    </div>
  );
};

const CertificatesEditor = ({ items, onChange }: { items: Keyed<CvCertificate>[]; onChange: (v: Keyed<CvCertificate>[]) => void }) => {
  const { t } = useTranslation();
  const id = useId();
  const set = (i: number, patch: Partial<CvCertificate>) => onChange(items.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const thisYear = new Date().getFullYear();
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm text-muted">{t('cvb.empty')}</p>}
      {items.map((c, i) => (
        <div key={c._k} className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-sunken p-3">
          <TextField label={t('cvb.fields.certName')} value={c.name} max={CV_MAX.org} placeholder={t('cvb.fields.certNamePh')} onChange={(v) => set(i, { name: v })} className="min-w-44 flex-[2]" />
          <TextField label={t('cvb.fields.issuer')} value={c.issuer} max={CV_MAX.org} onChange={(v) => set(i, { issuer: v })} className="min-w-36 flex-1" />
          <div className="w-28">
            <label htmlFor={`${id}-${i}`} className="label">
              {t('cvb.fields.year2')}
            </label>
            <select id={`${id}-${i}`} className="input px-2" value={c.year ?? ''} onChange={(e) => set(i, { year: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {Array.from({ length: thisYear - 1960 + 1 }, (_, j) => thisYear - j).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <EntryToolbar index={i} count={items.length} label={c.name || String(i + 1)} onMove={(to) => onChange(moveItem(items, i, to))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      {items.length < CV_MAX.certificates && (
        <button type="button" className="btn-ghost btn-sm" onClick={() => onChange([...items, k({ name: '', issuer: '', year: null })])}>
          <Plus className="size-4" aria-hidden /> {t('cvb.add.certificate')}
        </button>
      )}
    </div>
  );
};

// ─── Side panel ──────────────────────────────────────────────────────────

const ProfileBasics = ({ profile }: { profile: CvProfile }) => {
  const { t, i18n } = useTranslation();
  const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat(i18n.language, { timeZone: 'UTC' }).format(new Date(iso)) : null);
  const rows: [string, string | null][] = [
    [t('cvb.profile.name'), `${profile.firstName} ${profile.lastName}`.trim()],
    [t('cvb.profile.birthDate'), date(profile.birthDate)],
    [t('cvb.profile.address'), [profile.address, profile.city].filter(Boolean).join(', ') || null],
    [t('cvb.profile.phone'), profile.phone],
    [t('cvb.profile.email'), profile.email],
    [t('cvb.profile.nationality'), profile.nationality],
  ];
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <UserRound className="size-4 text-primary" aria-hidden /> {t('cvb.profile.title')}
        </h2>
        <Link to="/account/profile" className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:text-link">
          <PencilLine className="size-3.5" aria-hidden /> {t('cvb.profile.edit')}
        </Link>
      </div>
      <p className="mt-1 text-xs text-muted">{t('cvb.profile.hint')}</p>
      <dl className="mt-3 divide-y divide-line text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3 py-1.5">
            <dt className="w-28 shrink-0 text-xs text-muted">{label}</dt>
            <dd className={clsx('min-w-0 flex-1 break-words', value ? 'text-ink' : 'text-xs text-warning-fg')}>{value || t('cvb.profile.missing')}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────

const Editor = ({ cv, profile }: { cv: CvState; profile: CvProfile }) => {
  const { t } = useTranslation();
  const onError = useApiError();
  const shareId = useId();
  const { draft, setDraft, settings, setSettings, state, flush, replace, retry } = useAutosave({
    draft: toDraft(cv.data),
    settings: { template: cv.template, shareWithEmployers: cv.shareWithEmployers },
  });
  const [lang, setLang] = useState<CvLang>('de');
  const [photo, setPhoto] = useState(true);
  const [prefilling, setPrefilling] = useState(false);
  const download = useBlobDownload();
  const score = completeness(fromDraft(draft), profile);

  const prefill = async () => {
    setPrefilling(true);
    try {
      await flush();
      const res = await api.post<{ cv: CvState; filled: string[] }>('/cv/prefill');
      if (res.data.filled.length) {
        replace(toDraft(res.data.cv.data));
        toast.success(t('cvb.prefillDone', { count: res.data.filled.length }));
      } else toast.info(t('cvb.prefillNothing'));
    } catch (err) {
      onError(err);
    } finally {
      setPrefilling(false);
    }
  };

  const onDownload = async () => {
    await flush();
    await download.run('/cv/pdf', 'Lebenslauf.pdf', { template: settings.template, lang, photo: photo ? '1' : '0' });
  };

  const patch = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="type-page-title">{t('cvb.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('cvb.subtitle')}</p>
        </div>
        <SaveIndicator state={state} onRetry={() => void retry()} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <p className="rounded-xl border border-line-strong bg-sunken px-4 py-3 text-sm text-ink/80">
            <Sparkles className="mr-1.5 inline size-4 text-primary" aria-hidden />
            {t('cvb.hints.german')}
          </p>

          <SectionCard title={t('cvb.sections.basics')} icon={BriefcaseBusiness}>
            <div className="space-y-4">
              <TextField label={t('cvb.fields.headline')} value={draft.headline} max={CV_MAX.headline} placeholder={t('cvb.fields.headlinePh')} onChange={patch('headline')} />
              <SummaryField value={draft.summary} onChange={patch('summary')} />
            </div>
          </SectionCard>

          <SectionCard title={t('cvb.sections.experience')} icon={BriefcaseBusiness} hint={t('cvb.hints.experience')} count={draft.experience.length}>
            <ExperienceEditor items={draft.experience} onChange={patch('experience')} />
          </SectionCard>

          <SectionCard title={t('cvb.sections.education')} icon={GraduationCap} hint={t('cvb.hints.education')} count={draft.education.length}>
            <EducationEditor items={draft.education} onChange={patch('education')} />
          </SectionCard>

          <SectionCard title={t('cvb.sections.languages')} icon={Languages} hint={t('cvb.hints.languages')} count={draft.languages.length}>
            <LanguagesEditor items={draft.languages} onChange={patch('languages')} />
          </SectionCard>

          <SectionCard title={t('cvb.sections.skills')} icon={Wrench} hint={t('cvb.hints.skills')} count={draft.skills.length}>
            <TagInput label={t('cvb.sections.skills')} values={draft.skills} onChange={patch('skills')} max={CV_MAX.skills} maxLength={CV_MAX.skill} placeholder={t('cvb.fields.skillPh')} />
          </SectionCard>

          <SectionCard title={t('cvb.sections.certificates')} icon={Award} count={draft.certificates.length}>
            <CertificatesEditor items={draft.certificates} onChange={patch('certificates')} />
          </SectionCard>

          <div className="grid gap-6 md:grid-cols-2">
            <SectionCard title={t('cvb.sections.driving')} icon={Car} hint={t('cvb.hints.driving')}>
              <TagInput label={t('cvb.sections.driving')} values={draft.drivingLicences} onChange={patch('drivingLicences')} max={CV_MAX.licences} maxLength={CV_MAX.licence} placeholder={t('cvb.fields.licencePh')} upper />
            </SectionCard>
            <SectionCard title={t('cvb.sections.interests')} icon={Heart} hint={t('cvb.hints.interests')}>
              <TagInput label={t('cvb.sections.interests')} values={draft.interests} onChange={patch('interests')} max={CV_MAX.interests} maxLength={CV_MAX.skill} placeholder={t('cvb.fields.interestPh')} />
            </SectionCard>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="card p-5">
            <div className="flex items-center gap-4">
              <ProgressRing percent={score} size={64} label={t('cvb.completeness')}>
                <span className="text-sm font-bold text-ink tabular-nums">{score}%</span>
              </ProgressRing>
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">{t('cvb.completeness')}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{t('cvb.completenessHint')}</p>
              </div>
            </div>
            <button type="button" className="btn-ghost btn-sm mt-4 w-full" onClick={() => void prefill()} disabled={prefilling}>
              {prefilling ? <Spinner className="size-4" /> : <Wand2 className="size-4" aria-hidden />} {t('cvb.prefill')}
            </button>
            <AiCvWizard className="mt-2" current={fromDraft(draft)} onApply={(data) => setDraft(() => toDraft(data))} />
          </div>

          <div className="card space-y-4 p-5">
            <fieldset>
              <legend className="label">{t('cvb.template.label')}</legend>
              <div className="grid grid-cols-2 gap-3">
                {(['lebenslauf', 'europass'] as const).map((tpl) => (
                  <button
                    key={tpl}
                    type="button"
                    aria-pressed={settings.template === tpl}
                    onClick={() => setSettings({ template: tpl })}
                    className={clsx(
                      'rounded-xl border p-2 text-left transition',
                      settings.template === tpl ? 'border-primary ring-2 ring-focus/40' : 'border-line hover:border-line-strong',
                    )}
                  >
                    <TemplatePreview template={tpl} />
                    <span className="mt-2 block text-xs font-bold text-ink">{t(`cvb.template.${tpl}`)}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">{t(`cvb.template.${settings.template}Hint`)}</p>
            </fieldset>

            <fieldset>
              <legend className="label">{t('cvb.docLang.label')}</legend>
              <div className="inline-flex rounded-lg border border-line p-0.5">
                {(['de', 'en'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={lang === l}
                    onClick={() => setLang(l)}
                    className={clsx('rounded-md px-3 py-1.5 text-xs font-semibold transition', lang === l ? 'bg-primary text-primary-contrast' : 'text-ink/75 hover:bg-sunken')}
                  >
                    {t(`cvb.docLang.${l}`)}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="flex items-start gap-2.5 text-sm text-ink">
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={photo} onChange={(e) => setPhoto(e.target.checked)} />
              <span>
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <ImageIcon className="size-3.5 text-primary" aria-hidden /> {t('cvb.photo')}
                </span>
                <span className="block text-xs text-muted">{t('cvb.photoHint')}</span>
              </span>
            </label>

            <button type="button" className="btn-primary w-full" onClick={() => void onDownload()} disabled={download.busy}>
              {download.busy ? <Spinner className="size-4" /> : <Download className="size-4" aria-hidden />} {t('cvb.download')}
            </button>
          </div>

          <div className="card p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-soft">
                <Share2 className="size-4.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p id={`${shareId}-l`} className="text-sm font-bold text-ink">
                  {t('cvb.share.label')}
                </p>
                <p id={`${shareId}-h`} className="mt-1 text-xs leading-relaxed text-muted">
                  {t('cvb.share.hint')}
                </p>
              </div>
              <Switch checked={settings.shareWithEmployers} onChange={(v) => setSettings({ shareWithEmployers: v })} labelledBy={`${shareId}-l`} describedBy={`${shareId}-h`} />
            </div>
          </div>

          <ProfileBasics profile={profile} />
        </aside>
      </div>
    </div>
  );
};

const SummaryField = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {t('cvb.fields.summary')}
      </label>
      <textarea id={id} className="input min-h-28" value={value} maxLength={CV_MAX.summary} placeholder={t('cvb.fields.summaryPh')} onChange={(e) => onChange(e.target.value)} />
      <p className="mt-1 text-right text-[11px] text-muted tabular-nums">
        {value.length}/{CV_MAX.summary}
      </p>
    </div>
  );
};

export default function AccountCv() {
  const { t } = useTranslation();
  usePageTitle(t('cvb.title'));
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: CV_KEY,
    queryFn: async () => (await api.get<{ cv: CvState; profile: CvProfile }>('/cv')).data,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  if (isLoading) return <PageLoader />;
  if (error || !data)
    return (
      <div className="card p-6 text-center text-sm text-muted">
        {t('common.error')}{' '}
        <button type="button" className="font-semibold text-link underline" onClick={() => void refetch()}>
          {t('cvb.status.retry')}
        </button>
      </div>
    );
  return <Editor cv={data.cv} profile={data.profile} />;
}
