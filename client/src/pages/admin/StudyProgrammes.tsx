import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlarmClock, Download, ExternalLink, GraduationCap, Pencil, Plus, Star, Trash2, Upload, X } from 'lucide-react';
import { Chip, EmptyState, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { L10nInput, L10nListInput, emptyL10n, emptyL10nList } from '@/components/admin/L10nInput';
import { registerCopy } from '@/i18n';
import { pagesStudy } from '@/i18n/pagesStudy';
import { pagesStudyAdmin } from '@/i18n/pagesStudyAdmin';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole, type L10n, type L10nList } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { STUDY_DEGREES, STUDY_LANGUAGES, STUDY_ROUTES, STUDY_STATES, STUDY_SUBJECTS, type DeadlineOccurrence, type Intake, type StudyDeadline } from '@/lib/study';

registerCopy(pagesStudy);
registerCopy(pagesStudyAdmin);

interface AdminProgramme {
  id: string;
  slug: string;
  university: string;
  city: string;
  federalState: string;
  degree: string;
  subjectArea: string;
  name: string;
  teachingLanguage: string;
  languageRequirement: string | null;
  durationSemesters: number;
  tuitionPerSemester: number;
  semesterContribution: number | null;
  deadlines: StudyDeadline[];
  applicationRoute: string;
  officialUrl: string;
  description: L10n | null;
  requirements: L10nList | null;
  published: boolean;
  featured: boolean;
  staffNote: string | null;
  checkedAt: string | null;
  updatedAt: string;
  nextDeadline: DeadlineOccurrence | null;
  soon: boolean;
  applications?: number;
}

interface ImportResult {
  created: number;
  updated: number;
  errors: { row: number; error: string }[];
  rows: { row: number; slug: string | null; name: string; action: 'create' | 'update' }[];
  written: boolean;
}

const KEY = ['admin', 'study', 'programmes'];

type Form = {
  slug: string;
  name: string;
  university: string;
  city: string;
  federalState: string;
  degree: string;
  subjectArea: string;
  teachingLanguage: string;
  languageRequirement: string;
  durationSemesters: string;
  tuitionPerSemester: string;
  semesterContribution: string;
  applicationRoute: string;
  officialUrl: string;
  deadlines: { intake: Intake; from: string; to: string; note: string }[];
  description: L10n;
  requirements: L10nList;
  published: boolean;
  featured: boolean;
  staffNote: string;
  checkedAt: string;
};

const toForm = (p: AdminProgramme | null): Form =>
  p
    ? {
        slug: p.slug,
        name: p.name,
        university: p.university,
        city: p.city,
        federalState: p.federalState,
        degree: p.degree,
        subjectArea: p.subjectArea,
        teachingLanguage: p.teachingLanguage,
        languageRequirement: p.languageRequirement ?? '',
        durationSemesters: String(p.durationSemesters),
        tuitionPerSemester: String(p.tuitionPerSemester),
        semesterContribution: p.semesterContribution == null ? '' : String(p.semesterContribution),
        applicationRoute: p.applicationRoute,
        officialUrl: p.officialUrl,
        deadlines: p.deadlines.map((d) => ({ intake: d.intake, from: d.from ?? '', to: d.to, note: d.note ?? '' })),
        description: { ...emptyL10n(), ...(p.description ?? {}) },
        requirements: { ...emptyL10nList(), ...(p.requirements ?? {}) },
        published: p.published,
        featured: p.featured,
        staffNote: p.staffNote ?? '',
        checkedAt: p.checkedAt ? p.checkedAt.slice(0, 10) : '',
      }
    : {
        slug: '',
        name: '',
        university: '',
        city: '',
        federalState: 'BE',
        degree: 'MASTER',
        subjectArea: 'computer-science',
        teachingLanguage: 'EN',
        languageRequirement: '',
        durationSemesters: '4',
        tuitionPerSemester: '0',
        semesterContribution: '',
        applicationRoute: 'DIRECT',
        officialUrl: '',
        deadlines: [{ intake: 'WINTER', from: '', to: '', note: '' }],
        description: emptyL10n(),
        requirements: emptyL10nList(),
        published: false,
        featured: false,
        staffNote: '',
        checkedAt: '',
      };

const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const ProgrammeModal = ({ programme, onClose }: { programme: AdminProgramme | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(() => toForm(programme));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const setDeadline = (i: number, patch: Partial<Form['deadlines'][number]>) => set('deadlines', f.deadlines.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const deadlinesOk = f.deadlines.every((d) => MMDD.test(d.to) && (!d.from || MMDD.test(d.from)));
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        slug: f.slug.trim() || undefined,
        name: f.name.trim(),
        university: f.university.trim(),
        city: f.city.trim(),
        federalState: f.federalState,
        degree: f.degree,
        subjectArea: f.subjectArea,
        teachingLanguage: f.teachingLanguage,
        languageRequirement: f.languageRequirement.trim() || null,
        durationSemesters: Number(f.durationSemesters),
        tuitionPerSemester: Number(f.tuitionPerSemester || 0),
        semesterContribution: f.semesterContribution.trim() ? Number(f.semesterContribution) : null,
        applicationRoute: f.applicationRoute,
        officialUrl: f.officialUrl.trim(),
        deadlines: f.deadlines.filter((d) => d.to.trim()).map((d) => ({ intake: d.intake, from: d.from.trim() || null, to: d.to.trim(), note: d.note.trim() || null })),
        description: f.description,
        requirements: f.requirements,
        published: f.published,
        featured: f.featured,
        staffNote: f.staffNote.trim() || null,
        checkedAt: f.checkedAt || null,
      };
      return programme ? api.patch(`/admin/study/programmes/${programme.id}`, body) : api.post('/admin/study/programmes', body);
    },
    onSuccess: () => {
      toast.success(t('sta.saved'));
      void qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: (err) => toast.error(errorCode(err) === 'SLUG_TAKEN' ? `${t('sta.form.slug')}: SLUG_TAKEN` : t('sta.error')),
  });
  const text = (k: 'name' | 'university' | 'city' | 'languageRequirement' | 'officialUrl' | 'slug', label: string, extra: { hint?: string; type?: string; required?: boolean; max?: number } = {}) => (
    <label className="block">
      <span className="label">
        {label}
        {extra.required && <span className="text-danger-fg"> *</span>}
      </span>
      <input className="input" type={extra.type ?? 'text'} required={extra.required} maxLength={extra.max ?? 250} value={f[k]} onChange={(e) => set(k, e.target.value)} />
      {extra.hint && <span className="mt-1 block text-xs text-muted">{extra.hint}</span>}
    </label>
  );
  const choose = (k: 'federalState' | 'degree' | 'subjectArea' | 'teachingLanguage' | 'applicationRoute', label: string, options: { value: string; label: string }[]) => (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={f[k]} onChange={(e) => set(k, e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const valid = f.name.trim().length >= 2 && f.university.trim().length >= 2 && f.city.trim().length >= 2 && /^https?:\/\//.test(f.officialUrl.trim()) && Number(f.durationSemesters) >= 1 && deadlinesOk;
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      busy={save.isPending}
      title={programme ? t('sta.form.editTitle') : t('sta.form.newTitle')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('sta.form.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {t('sta.form.save')}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {text('name', t('sta.form.name'), { required: true })}
        <div className="grid gap-4 sm:grid-cols-2">
          {text('university', t('sta.form.university'), { required: true, max: 200 })}
          {text('city', t('sta.form.city'), { required: true, max: 100 })}
          {choose('federalState', t('sta.form.state'), Object.entries(STUDY_STATES).map(([v, n]) => ({ value: v, label: n })))}
          {choose('degree', t('sta.form.degree'), STUDY_DEGREES.map((d) => ({ value: d, label: t(`study.degree.${d}`) })))}
          {choose('subjectArea', t('sta.form.subject'), STUDY_SUBJECTS.map((s) => ({ value: s, label: t(`study.subject.${s}`) })))}
          {choose('teachingLanguage', t('sta.form.language'), STUDY_LANGUAGES.map((l) => ({ value: l, label: t(`study.lang.${l}`) })))}
        </div>
        {text('languageRequirement', t('sta.form.languageReq'), { hint: t('sta.form.languageReqHint'), max: 500 })}
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="label">{t('sta.form.duration')}</span>
            <input className="input" type="number" min={1} max={14} value={f.durationSemesters} onChange={(e) => set('durationSemesters', e.target.value)} />
          </label>
          <label className="block">
            <span className="label">{t('sta.form.tuition')}</span>
            <input className="input" type="number" min={0} step={1} value={f.tuitionPerSemester} onChange={(e) => set('tuitionPerSemester', e.target.value)} />
            <span className="mt-1 block text-xs text-muted">{t('sta.form.tuitionHint')}</span>
          </label>
          <label className="block">
            <span className="label">{t('sta.form.contribution')}</span>
            <input className="input" type="number" min={0} step={1} value={f.semesterContribution} onChange={(e) => set('semesterContribution', e.target.value)} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {choose('applicationRoute', t('sta.form.route'), STUDY_ROUTES.map((r) => ({ value: r, label: t(`study.route.${r}`) })))}
          {text('officialUrl', t('sta.form.url'), { required: true, type: 'url', max: 1000 })}
        </div>

        <fieldset className="rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">{t('sta.form.deadlines')}</legend>
          <p className="text-xs text-muted">{t('sta.form.deadlinesHint')}</p>
          <ul className="mt-3 space-y-3">
            {f.deadlines.map((d, i) => (
              <li key={i} className="grid items-end gap-2 sm:grid-cols-[10rem_7rem_7rem_minmax(0,1fr)_auto]">
                <label className="block">
                  <span className="label">{t('sta.form.intake')}</span>
                  <select className="input" value={d.intake} onChange={(e) => setDeadline(i, { intake: e.target.value as Intake })}>
                    {(['WINTER', 'SUMMER'] as const).map((x) => (
                      <option key={x} value={x}>
                        {t(`sta.intake.${x}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">{t('sta.form.from')}</span>
                  <input className="input" placeholder="04-01" maxLength={5} value={d.from} onChange={(e) => setDeadline(i, { from: e.target.value })} aria-invalid={(!!d.from && !MMDD.test(d.from)) || undefined} />
                </label>
                <label className="block">
                  <span className="label">{t('sta.form.to')}</span>
                  <input className="input" placeholder="05-31" maxLength={5} value={d.to} onChange={(e) => setDeadline(i, { to: e.target.value })} aria-invalid={(!!d.to && !MMDD.test(d.to)) || undefined} />
                </label>
                <label className="block">
                  <span className="label">{t('sta.form.note')}</span>
                  <input className="input" maxLength={120} placeholder={t('sta.form.notePlaceholder')} value={d.note} onChange={(e) => setDeadline(i, { note: e.target.value })} />
                </label>
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
                  onClick={() => set('deadlines', f.deadlines.filter((_, j) => j !== i))}
                  aria-label={t('sta.form.removeDeadline')}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {f.deadlines.length < 8 && (
            <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => set('deadlines', [...f.deadlines, { intake: 'SUMMER', from: '', to: '', note: '' }])}>
              <Plus className="size-3.5" aria-hidden /> {t('sta.form.addDeadline')}
            </button>
          )}
        </fieldset>

        <L10nInput label={t('sta.form.description')} value={f.description} onChange={(v) => set('description', v)} multiline rows={4} />
        <L10nListInput label={t('sta.form.requirements')} value={f.requirements} onChange={(v) => set('requirements', v)} />

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" className="size-5 accent-brand-600" checked={f.published} onChange={(e) => set('published', e.target.checked)} /> {t('sta.form.published')}
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" className="size-5 accent-brand-600" checked={f.featured} onChange={(e) => set('featured', e.target.checked)} /> {t('sta.form.featured')}
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <label className="block">
            <span className="label">{t('sta.form.staffNote')}</span>
            <textarea className="input resize-y" rows={4} maxLength={5000} value={f.staffNote} onChange={(e) => set('staffNote', e.target.value)} />
          </label>
          <label className="block">
            <span className="label">{t('sta.form.checkedAt')}</span>
            <input className="input" type="date" value={f.checkedAt} onChange={(e) => set('checkedAt', e.target.value)} />
          </label>
        </div>
        {text('slug', t('sta.form.slug'), { hint: t('sta.form.slugHint'), max: 120 })}
      </div>
    </Modal>
  );
};

const ImportModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const run = useMutation({
    mutationFn: async (dryRun: boolean) =>
      (await api.post<ImportResult>(`/admin/study/programmes/import${dryRun ? '?dryRun=1' : ''}`, csv, { headers: { 'Content-Type': 'text/csv' }, validateStatus: (s) => s === 200 || s === 422 })).data,
    onSuccess: (r) => {
      setResult(r);
      if (r.written) {
        toast.success(t('sta.csv.done', { created: r.created, updated: r.updated }));
        void qc.invalidateQueries({ queryKey: KEY });
        onClose();
      }
    },
    onError: () => toast.error(t('sta.error')),
  });
  const ready = !!result && !result.errors.length && result.rows.length > 0;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      busy={run.isPending}
      title={t('sta.csv.title')}
      description={t('sta.csv.intro')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" disabled={!csv || run.isPending} onClick={() => run.mutate(true)}>
            {t('sta.csv.check')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!ready || run.isPending} onClick={() => run.mutate(false)}>
            {t('sta.csv.run', { n: result?.rows.length ?? 0 })}
          </button>
        </>
      }
    >
      <label className="block">
        <span className="label">{t('sta.csv.file')}</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="input file:mr-3 file:rounded-md file:border-0 file:bg-sunken file:px-3 file:py-1.5 file:text-sm file:text-ink"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setResult(null);
            setCsv(file ? await file.text() : '');
          }}
        />
      </label>
      {result && (
        <div className="mt-4 space-y-3 text-sm">
          <p className="flex flex-wrap gap-3 font-semibold text-ink">
            <span>{t('sta.csv.create', { n: result.created })}</span>
            <span>{t('sta.csv.update', { n: result.updated })}</span>
          </p>
          {result.errors.length > 0 && (
            <div role="alert" className="rounded-lg border border-danger-border bg-danger-bg p-3 text-danger-fg">
              <p className="font-semibold">{t('sta.csv.errors')}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {result.errors.map((er) => (
                  <li key={`${er.row}-${er.error}`}>
                    {t('sta.csv.row', { n: er.row })}: {er.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.rows.length > 0 && (
            <ul className="max-h-56 space-y-1 overflow-auto rounded-lg border border-line p-3">
              {result.rows.map((r) => (
                <li key={r.row} className="flex justify-between gap-3">
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 text-muted">{r.action === 'create' ? t('sta.csv.create', { n: '+' }) : r.slug}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
};

/** Admin → Study programmes (/admin/study): the /study catalogue. STAFF+ edit and import, ADMIN+ delete. */
export default function StudyProgrammes() {
  const { t } = useTranslation();
  usePageTitle(t('sta.title'));
  const { user } = useAuth();
  const canDelete = hasMinRole(user?.role, 'ADMIN');
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AdminProgramme | null | 'new'>(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<AdminProgramme | null>(null);
  const [q, setQ] = useState('');
  const [onlyDrafts, setOnlyDrafts] = useState(false);
  const [onlySoon, setOnlySoon] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<{ items: AdminProgramme[] }>('/admin/study/programmes')).data.items });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/study/programmes/${id}`),
    onSuccess: () => {
      toast.success(t('sta.deleted'));
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: () => toast.error(t('sta.error')),
  });
  const items = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (data ?? []).filter(
      (p) => (!onlyDrafts || !p.published) && (!onlySoon || p.soon) && words.every((w) => `${p.name} ${p.university} ${p.city}`.toLowerCase().includes(w)),
    );
  }, [data, q, onlyDrafts, onlySoon]);
  const soonCount = (data ?? []).filter((p) => p.soon && p.published).length;

  return (
    <div className="space-y-6">
      <PageHead
        title={t('sta.title')}
        subtitle={t('sta.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <a href="/api/admin/study/programmes/export.csv" className="btn-secondary btn-sm" download>
              <Download className="size-3.5" aria-hidden /> {t('sta.export')}
            </a>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setImporting(true)}>
              <Upload className="size-3.5" aria-hidden /> {t('sta.import')}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => setEditing('new')}>
              <Plus className="size-3.5" aria-hidden /> {t('sta.add')}
            </button>
          </div>
        }
      />
      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="sta-search">
            {t('sta.search')}
          </label>
          <input ref={searchRef} id="sta-search" type="search" className="input max-w-xs" placeholder={t('sta.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <Chip active={onlyDrafts} onClick={() => setOnlyDrafts((x) => !x)}>
            {t('sta.onlyDrafts')}
          </Chip>
          <Chip active={onlySoon} onClick={() => setOnlySoon((x) => !x)} count={soonCount || undefined}>
            {t('sta.onlySoon')}
          </Chip>
        </div>
        {isLoading ? (
          <LoadingBlock />
        ) : !data?.length ? (
          <EmptyState
            icon={GraduationCap}
            title={t('sta.empty')}
            text={t('sta.emptyText')}
            action={
              <button type="button" className="btn-primary btn-sm" onClick={() => setEditing('new')}>
                <Plus className="size-3.5" aria-hidden /> {t('sta.add')}
              </button>
            }
          />
        ) : !items.length ? (
          <EmptyState filtered title={t('sta.noMatch')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-semibold">{t('sta.cols.programme')}</th>
                  <th className="py-2 pr-3 font-semibold">{t('sta.cols.degree')}</th>
                  <th className="py-2 pr-3 font-semibold">{t('sta.cols.next')}</th>
                  <th className="py-2 pr-3 font-semibold">{t('sta.cols.status')}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t('sta.cols.leads')}</th>
                  <th className="py-2 text-right font-semibold">
                    <span className="sr-only">{t('sta.cols.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-ink">{p.name}</p>
                      <p className="text-xs text-muted">
                        {p.university} · {p.city}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">{t(`study.degree.${p.degree}`)}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      {p.nextDeadline ? (
                        <span className={clsx('inline-flex items-center gap-1', p.soon && 'font-semibold text-warning-fg')}>
                          {p.soon && <AlarmClock className="size-3.5" aria-label={t('sta.soon')} />}
                          {p.nextDeadline.closes} · {t('sta.daysLeft', { n: p.nextDeadline.daysLeft })}
                        </span>
                      ) : (
                        <span className="text-muted">{t('sta.noDeadline')}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="flex flex-wrap gap-1">
                        <span className={clsx('badge', p.published ? 'bg-success-bg text-success-fg' : 'bg-sunken text-muted')}>{p.published ? t('sta.published') : t('sta.draft')}</span>
                        {p.featured && (
                          <span className="badge bg-highlight/20 text-ink">
                            <Star className="size-3" aria-hidden /> {t('sta.featured')}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{p.applications ?? 0}</td>
                    <td className="py-2.5">
                      <span className="flex justify-end gap-1">
                        {p.published && (
                          <a href={`/study/${p.slug}`} target="_blank" rel="noreferrer" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={`${t('sta.view')}: ${p.name}`}>
                            <ExternalLink className="size-4" aria-hidden />
                          </a>
                        )}
                        <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" onClick={() => setEditing(p)} aria-label={`${t('sta.edit')}: ${p.name}`}>
                          <Pencil className="size-4" aria-hidden />
                        </button>
                        {canDelete && (
                          <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger-fg" onClick={() => setDeleting(p)} aria-label={`${t('sta.delete')}: ${p.name}`}>
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {editing && <ProgrammeModal programme={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title={t('sta.deleteTitle')}
        message={t('sta.deleteText', { name: deleting?.name ?? '' })}
        confirmLabel={t('sta.delete')}
        loading={remove.isPending}
      />
    </div>
  );
}
