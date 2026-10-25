import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, BookOpen, Eye, EyeOff, GraduationCap, ListChecks, Pencil, PlayCircle, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Role } from '@/lib/types';
import { Markdown } from '@/components/ops/Markdown';
import { EmptyState, ErrorBlock, LoadingBlock, Panel } from '@/components/admin/ui';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { TONE_CLASS } from '@/components/ui/status';
import type { AdminLesson, CourseBase, QuizQuestion } from '../api';
import { toastTeamError } from '../shared';

type CourseRow = CourseBase & { lessons: number };
type CourseFull = CourseBase & { lessons: AdminLesson[] };

const ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];
const swap = <T,>(list: T[], i: number, j: number) => {
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

// ─── Lesson editor ─────────────────────────────────────────────────────

const QuizBuilder = ({ quiz, onChange }: { quiz: QuizQuestion[]; onChange: (q: QuizQuestion[]) => void }) => {
  const { t } = useTranslation();
  const set = (i: number, patch: Partial<QuizQuestion>) => onChange(quiz.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  return (
    <div className="space-y-3">
      {quiz.map((q, i) => (
        <fieldset key={i} className="rounded-lg border border-line p-3">
          <legend className="px-1 text-xs font-semibold text-muted">{t('team.training.editor.question', { n: i + 1 })}</legend>
          <div className="flex gap-2">
            <input className="input flex-1" value={q.q} maxLength={500} placeholder={t('team.training.editor.questionPh')} aria-label={t('team.training.editor.question', { n: i + 1 })} onChange={(e) => set(i, { q: e.target.value })} />
            <button type="button" className="btn-secondary btn-sm px-2" aria-label={t('team.training.editor.removeQuestion')} onClick={() => onChange(quiz.filter((_, k) => k !== i))}>
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <p className="mt-2 mb-1 text-[11px] text-muted">{t('team.training.editor.optionsHint')}</p>
          <div className="space-y-1.5">
            {q.options.map((o, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input type="radio" className="size-4" name={`answer-${i}`} checked={q.answer === oi} aria-label={t('team.training.editor.correct')} onChange={() => set(i, { answer: oi })} />
                <input
                  className="input h-9 flex-1"
                  value={o}
                  maxLength={300}
                  placeholder={t('team.training.editor.optionPh', { n: oi + 1 })}
                  onChange={(e) => set(i, { options: q.options.map((x, k) => (k === oi ? e.target.value : x)) })}
                />
                <button
                  type="button"
                  className="btn-secondary btn-sm px-2"
                  disabled={q.options.length <= 2}
                  aria-label={t('team.training.editor.removeOption')}
                  onClick={() => set(i, { options: q.options.filter((_, k) => k !== oi), answer: q.answer === oi ? 0 : q.answer > oi ? q.answer - 1 : q.answer })}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          {q.options.length < 8 && (
            <button type="button" className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-link hover:underline" onClick={() => set(i, { options: [...q.options, ''] })}>
              <Plus className="size-3" /> {t('team.training.editor.addOption')}
            </button>
          )}
        </fieldset>
      ))}
      {quiz.length < 30 && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([...quiz, { q: '', options: ['', ''], answer: 0 }])}>
          <Plus className="size-3.5" /> {t('team.training.editor.addQuestion')}
        </button>
      )}
    </div>
  );
};

const LessonEditor = ({ courseId, lesson, open, onClose, onSaved }: { courseId: string; lesson: AdminLesson | null; open: boolean; onClose: () => void; onSaved: () => void }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [driveNodeId, setDriveNodeId] = useState('');
  const [body, setBody] = useState('');
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [passScore, setPassScore] = useState(70);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  useEffect(() => {
    if (!open) return;
    setTitle(lesson?.title ?? '');
    setMinutes(lesson?.minutes ? String(lesson.minutes) : '');
    setVideoUrl(lesson?.videoUrl ?? '');
    setDriveNodeId(lesson?.driveNodeId ?? '');
    setBody(lesson?.body ?? '');
    setQuiz(lesson?.quiz ?? []);
    setPassScore(lesson?.passScore ?? 70);
    setTab('write');
  }, [open, lesson]);

  const cleanQuiz = quiz.map((q) => ({ ...q, q: q.q.trim(), options: q.options.map((o) => o.trim()) }));
  const quizValid = cleanQuiz.every((q) => q.q && q.options.length >= 2 && q.options.every(Boolean) && q.answer < q.options.length);
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        minutes: minutes ? Number(minutes) : null,
        videoUrl: videoUrl.trim() || null,
        driveNodeId: driveNodeId.trim() || null,
        body: body || null,
        quiz: cleanQuiz.length ? cleanQuiz : null,
        passScore,
      };
      return lesson ? api.patch(`/admin/training/lessons/${lesson.id}`, payload) : api.post(`/admin/training/courses/${courseId}/lessons`, payload);
    },
    onSuccess: () => {
      toast.success(t('team.common.saved'));
      onSaved();
      onClose();
    },
    onError: toastTeamError,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lesson ? t('team.training.editor.editLesson') : t('team.training.editor.newLesson')}
      size="xl"
      mobile="full"
      align="top"
      busy={save.isPending}
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim() && quizValid) save.mutate();
      }}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('team.common.cancel')}
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={save.isPending || !title.trim() || !quizValid}>
            {save.isPending ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />} {t('team.common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <label className="block">
            <span className="label">{t('team.training.editor.title')}</span>
            <input data-autofocus className="input font-semibold" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">{t('team.training.editor.minutes')}</span>
            <input type="number" min={0} max={600} className="input" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t('team.training.editor.videoUrl')}</span>
            <input className="input" type="url" maxLength={2000} value={videoUrl} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => setVideoUrl(e.target.value)} />
            <span className="mt-1 block text-[11px] text-muted">{t('team.training.editor.videoHint')}</span>
          </label>
          <label className="block">
            <span className="label">{t('team.training.editor.driveNode')}</span>
            <input className="input code-id text-xs" maxLength={40} value={driveNodeId} onChange={(e) => setDriveNodeId(e.target.value)} />
            <span className="mt-1 block text-[11px] text-muted">{t('team.training.editor.driveHint')}</span>
          </label>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label mb-0">{t('team.training.editor.body')}</span>
            <div className="flex rounded-lg border border-line bg-sunken p-0.5">
              {(['write', 'preview'] as const).map((v) => (
                <button key={v} type="button" aria-pressed={tab === v} onClick={() => setTab(v)} className={clsx('inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold', tab === v ? 'bg-card text-ink shadow-[var(--tv-shadow-card)] ring-1 ring-line' : 'text-muted')}>
                  {v === 'write' ? <Pencil className="size-3" /> : <Eye className="size-3" />} {t(`team.training.editor.${v}`)}
                </button>
              ))}
            </div>
          </div>
          {tab === 'write' ? (
            <textarea className="input min-h-72 font-mono text-[13px] leading-relaxed" value={body} maxLength={200_000} placeholder={t('team.training.editor.bodyPh')} onChange={(e) => setBody(e.target.value)} />
          ) : (
            <div className="min-h-72 rounded-lg border border-line bg-card p-4">{body.trim() ? <Markdown source={body} /> : <p className="text-sm text-muted">{t('team.training.editor.emptyPreview')}</p>}</div>
          )}
        </div>
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="label mb-0 flex items-center gap-1.5">
              <ListChecks className="size-3.5" aria-hidden /> {t('team.training.editor.quiz')}
            </span>
            {quiz.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-muted">
                {t('team.training.editor.passScore')}
                <input type="number" min={0} max={100} className="input h-8 w-20" value={passScore} onChange={(e) => setPassScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />%
              </label>
            )}
          </div>
          <p className="mb-2 text-[11px] text-muted">{t('team.training.editor.quizHint')}</p>
          <QuizBuilder quiz={quiz} onChange={setQuiz} />
          {!quizValid && <p className="mt-2 text-xs text-danger-fg">{t('team.training.editor.quizInvalid')}</p>}
        </div>
      </div>
    </Modal>
  );
};

// ─── Course editor ─────────────────────────────────────────────────────

const CourseEditor = ({ courseId, onClose }: { courseId: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['training', 'admin', 'course', courseId],
    queryFn: async () => (await api.get<{ course: CourseFull }>(`/admin/training/courses/${courseId}`)).data.course,
  });
  const [form, setForm] = useState<{ title: string; description: string; roles: Role[] | null; required: boolean; published: boolean } | null>(null);
  const [editing, setEditing] = useState<{ open: boolean; lesson: AdminLesson | null }>({ open: false, lesson: null });
  const [deleting, setDeleting] = useState<AdminLesson | 'course' | null>(null);
  useEffect(() => {
    if (data) setForm({ title: data.title, description: data.description ?? '', roles: data.roles, required: data.required, published: data.published });
  }, [data]);
  const refresh = () => {
    void refetch();
    void qc.invalidateQueries({ queryKey: ['training'] });
  };
  const save = useMutation({
    mutationFn: async () => api.patch(`/admin/training/courses/${courseId}`, { ...form, description: form!.description.trim() || null, roles: form!.roles && form!.roles.length ? form!.roles : null }),
    onSuccess: () => {
      toast.success(t('team.common.saved'));
      refresh();
    },
    onError: toastTeamError,
  });
  const reorder = useMutation({
    mutationFn: async (ids: string[]) => api.post(`/admin/training/courses/${courseId}/lessons/reorder`, { ids }),
    onSuccess: refresh,
    onError: toastTeamError,
  });
  const remove = useMutation({
    mutationFn: async (target: AdminLesson | 'course') => (target === 'course' ? api.delete(`/admin/training/courses/${courseId}`) : api.delete(`/admin/training/lessons/${target.id}`)),
    onSuccess: (_r, target) => {
      setDeleting(null);
      if (target === 'course') {
        void qc.invalidateQueries({ queryKey: ['training'] });
        onClose();
      } else refresh();
    },
    onError: toastTeamError,
  });

  if (isLoading || !form) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  const toggleRole = (r: Role) => {
    const cur = form.roles ?? [];
    setForm({ ...form, roles: cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r] });
  };
  return (
    <div className="space-y-5">
      <Panel
        title={t('team.training.editor.course')}
        icon={GraduationCap}
        actions={
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('team.training.editor.backToList')}
          </button>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.title.trim().length >= 2) save.mutate();
          }}
        >
          <label className="block">
            <span className="label">{t('team.training.editor.title')}</span>
            <input className="input text-base font-semibold" required minLength={2} maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">{t('team.training.editor.description')}</span>
            <textarea className="input min-h-20" maxLength={5000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <fieldset>
            <legend className="label">{t('team.training.editor.roles')}</legend>
            <div className="flex flex-wrap gap-3 text-sm">
              {ROLES.map((r) => (
                <label key={r} className="inline-flex min-h-9 items-center gap-2">
                  <input type="checkbox" className="size-4" checked={(form.roles ?? []).includes(r)} onChange={() => toggleRole(r)} /> {t(`team.roles.${r}`)}
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted">{t('team.training.editor.rolesHint')}</p>
          </fieldset>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="inline-flex min-h-9 items-center gap-2">
              <input type="checkbox" className="size-4" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} /> {t('team.training.editor.requiredLabel')}
            </label>
            <label className="inline-flex min-h-9 items-center gap-2">
              <input type="checkbox" className="size-4" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> {t('team.training.editor.publishedLabel')}
            </label>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
            <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={() => setDeleting('course')}>
              <Trash2 className="size-3.5" /> {t('team.training.editor.deleteCourse')}
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={save.isPending || form.title.trim().length < 2}>
              {save.isPending ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />} {t('team.common.save')}
            </button>
          </div>
        </form>
      </Panel>

      <Panel
        title={t('team.training.editor.lessons', { count: data.lessons.length })}
        icon={BookOpen}
        bodyClassName="p-0"
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={() => setEditing({ open: true, lesson: null })}>
            <Plus className="size-3.5" /> {t('team.training.editor.addLesson')}
          </button>
        }
      >
        {data.lessons.length === 0 ? (
          <EmptyState icon={BookOpen} title={t('team.training.editor.noLessons')} />
        ) : (
          <ol className="divide-y divide-line">
            {data.lessons.map((l, i) => (
              <li key={l.id} className="flex items-center gap-2 px-4 py-2.5 sm:px-6">
                <span className="w-6 text-right text-xs text-muted tabular-nums">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{l.title}</p>
                  <p className="flex flex-wrap gap-x-3 text-[11px] text-muted">
                    {l.minutes ? <span>{t('team.training.minutes', { count: l.minutes })}</span> : null}
                    {(l.videoUrl || l.driveNodeId) && (
                      <span className="inline-flex items-center gap-1">
                        <PlayCircle className="size-3" aria-hidden /> {t('team.training.hasVideo')}
                      </span>
                    )}
                    {l.quiz.length > 0 && <span>{t('team.training.editor.quizCount', { count: l.quiz.length, pass: l.passScore })}</span>}
                  </p>
                </div>
                <button type="button" className="btn-secondary btn-sm px-2" disabled={i === 0 || reorder.isPending} aria-label={t('team.common.moveUp')} onClick={() => reorder.mutate(swap(data.lessons, i, i - 1).map((x) => x.id))}>
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm px-2"
                  disabled={i === data.lessons.length - 1 || reorder.isPending}
                  aria-label={t('team.common.moveDown')}
                  onClick={() => reorder.mutate(swap(data.lessons, i, i + 1).map((x) => x.id))}
                >
                  <ArrowDown className="size-3.5" />
                </button>
                <button type="button" className="btn-secondary btn-sm px-2" aria-label={t('team.common.edit')} onClick={() => setEditing({ open: true, lesson: l })}>
                  <Pencil className="size-3.5" />
                </button>
                <button type="button" className="btn-secondary btn-sm px-2 text-danger-fg" aria-label={t('team.common.delete')} onClick={() => setDeleting(l)}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <LessonEditor courseId={courseId} lesson={editing.lesson} open={editing.open} onClose={() => setEditing((e) => ({ ...e, open: false }))} onSaved={refresh} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        danger
        loading={remove.isPending}
        title={deleting === 'course' ? t('team.training.editor.deleteCourseTitle') : t('team.training.editor.deleteLessonTitle')}
        message={deleting === 'course' ? t('team.training.editor.deleteCourseText', { title: data.title }) : t('team.training.editor.deleteLessonText')}
        confirmLabel={t('team.common.delete')}
      />
    </div>
  );
};

// ─── Course list ───────────────────────────────────────────────────────

/** Admin authoring: courses (reorder, publish), the starter-course button and the course / lesson editors. */
export const Authoring = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['training', 'admin', 'courses'],
    queryFn: async () => (await api.get<{ courses: CourseRow[] }>('/admin/training/courses')).data.courses,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['training'] });
  const create = useMutation({
    mutationFn: async () => (await api.post<{ course: CourseRow }>('/admin/training/courses', { title: newTitle.trim() })).data.course,
    onSuccess: (c) => {
      setCreating(false);
      setNewTitle('');
      void refresh();
      setSelected(c.id);
    },
    onError: toastTeamError,
  });
  const starter = useMutation({
    mutationFn: async () => (await api.post<{ created: number; skipped: number }>('/admin/training/courses/starter')).data,
    onSuccess: (r) => {
      toast.success(r.created ? t('team.training.starterCreated', { count: r.created }) : t('team.training.starterExists'));
      void refresh();
    },
    onError: toastTeamError,
  });
  const patch = useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => api.patch(`/admin/training/courses/${id}`, { published }),
    onSuccess: () => void refresh(),
    onError: toastTeamError,
  });
  const reorder = useMutation({
    mutationFn: async (ids: string[]) => api.post('/admin/training/courses/reorder', { ids }),
    onSuccess: () => void refresh(),
    onError: toastTeamError,
  });

  if (selected) return <CourseEditor courseId={selected} onClose={() => setSelected(null)} />;
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  return (
    <Panel
      title={t('team.training.coursesTitle')}
      icon={GraduationCap}
      bodyClassName="p-0"
      actions={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm" disabled={starter.isPending} onClick={() => starter.mutate()} title={t('team.training.starterHint')}>
            {starter.isPending ? <Spinner className="size-3.5" /> : <Sparkles className="size-3.5" />} {t('team.training.starter')}
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" /> {t('team.training.newCourse')}
          </button>
        </div>
      }
    >
      {data.length === 0 ? (
        <EmptyState icon={GraduationCap} title={t('team.training.noCoursesAdmin')}>
          {t('team.training.starterHint')}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelected(c.id)}>
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                  {c.title}
                  {c.required && <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-semibold', TONE_CLASS.warning)}>{t('team.training.required')}</span>}
                  <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-semibold', c.published ? TONE_CLASS.success : TONE_CLASS.neutral)}>{c.published ? t('team.training.published') : t('team.training.draft')}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {t('team.training.lessonsCount', { count: c.lessons })}
                  {c.roles?.length ? ` · ${c.roles.map((r) => t(`team.roles.${r}`)).join(', ')}` : ` · ${t('team.training.everyone')}`}
                </p>
              </button>
              <button type="button" className="btn-secondary btn-sm px-2" disabled={i === 0 || reorder.isPending} aria-label={t('team.common.moveUp')} onClick={() => reorder.mutate(swap(data, i, i - 1).map((x) => x.id))}>
                <ArrowUp className="size-3.5" />
              </button>
              <button type="button" className="btn-secondary btn-sm px-2" disabled={i === data.length - 1 || reorder.isPending} aria-label={t('team.common.moveDown')} onClick={() => reorder.mutate(swap(data, i, i + 1).map((x) => x.id))}>
                <ArrowDown className="size-3.5" />
              </button>
              <button type="button" className="btn-secondary btn-sm" disabled={patch.isPending} onClick={() => patch.mutate({ id: c.id, published: !c.published })}>
                {c.published ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {c.published ? t('team.training.unpublish') : t('team.training.publish')}
              </button>
              <button type="button" className="btn-secondary btn-sm px-2" aria-label={t('team.common.edit')} onClick={() => setSelected(c.id)}>
                <Pencil className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('team.training.newCourse')}
        size="sm"
        as="form"
        busy={create.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          if (newTitle.trim().length >= 2) create.mutate();
        }}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setCreating(false)}>
              {t('team.common.cancel')}
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={create.isPending || newTitle.trim().length < 2}>
              {t('team.common.create')}
            </button>
          </>
        }
      >
        <label className="block">
          <span className="label">{t('team.training.editor.title')}</span>
          <input data-autofocus className="input" minLength={2} maxLength={200} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        </label>
      </Modal>
    </Panel>
  );
};
