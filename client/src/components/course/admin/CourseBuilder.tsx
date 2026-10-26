import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, BookOpen, CircleHelp, Eye, EyeOff, Film, ImageIcon, Pencil, PlayCircle, Plus, Subtitles, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { hasMinRole, type CaseStatus, type L10n } from '@/lib/types';
import { L10nInput, LangTag, emptyL10n } from '@/components/admin/L10nInput';
import { statusLabel } from '@/components/admin/labels';
import { ErrorBlock, LoadingBlock } from '@/components/admin/ui';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { ADMIN_COURSES_KEY, COURSE_LOCALES, adminCourseKey, fmtDuration, useAdminCourse, type AdminCourse, type AdminLesson, type Completeness, type CourseLocale, type LessonKind } from '../api';
import { useCourseError } from './errors';
import { QuizEditor, questionsValid, toQuestionDrafts, type QuestionDraft } from './QuizEditor';

const KIND_ICON: Record<LessonKind, LucideIcon> = { VIDEO: PlayCircle, TEXT: BookOpen, QUIZ: CircleHelp };
const STATUSES: CaseStatus[] = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const LANG_NAME: Record<CourseLocale, string> = { az: 'AZ', de: 'DE', en: 'EN', ru: 'RU' };

const fill = (v: L10n | null | undefined): L10n => ({ ...emptyL10n(), ...(v ?? {}) });

/** Runs a builder call that answers with the updated course and puts it into the cache. */
const useRun = (courseId: string) => {
  const qc = useQueryClient();
  const onError = useCourseError();
  return async (fn: () => Promise<AxiosResponse<{ course?: AdminCourse }>>, ok?: string) => {
    try {
      const r = await fn();
      if (r.data.course) qc.setQueryData(adminCourseKey(courseId), r.data.course);
      else void qc.invalidateQueries({ queryKey: adminCourseKey(courseId) });
      void qc.invalidateQueries({ queryKey: ADMIN_COURSES_KEY });
      if (ok) toast.success(ok);
      return true;
    } catch (err) {
      onError(err);
      return false;
    }
  };
};

export const CompletenessChips = ({ value, label }: { value: Completeness; label: string }) => (
  <ul className="flex flex-wrap gap-1.5" aria-label={label}>
    {COURSE_LOCALES.map((l) => (
      <li key={l} className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', value[l] === 100 ? 'bg-success-bg text-success-fg' : value[l] >= 50 ? 'bg-warning-bg text-warning-fg' : 'bg-danger-bg text-danger-fg')}>
        <LangTag lang={l} />
        <span className="num">{value[l]}%</span>
      </li>
    ))}
  </ul>
);

// ─── Course details ───────────────────────────────────────────────────

const DetailsForm = ({ course, canEdit }: { course: AdminCourse; canEdit: boolean }) => {
  const { t } = useTranslation();
  const run = useRun(course.id);
  const [title, setTitle] = useState(fill(course.title));
  const [description, setDescription] = useState(fill(course.description));
  const [disclaimer, setDisclaimer] = useState(fill(course.disclaimer));
  const [statuses, setStatuses] = useState<CaseStatus[]>(course.autoEnrollStatuses);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await run(() => api.patch(`/admin/course/courses/${course.id}`, { title, description, disclaimer, autoEnrollStatuses: statuses }), t('courseAdmin.course.saved'));
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={!canEdit} className="space-y-4">
        <L10nInput label={t('courseAdmin.course.title')} value={title} onChange={setTitle} required />
        <L10nInput label={t('courseAdmin.course.description')} value={description} onChange={setDescription} multiline rows={3} />
        <L10nInput label={t('courseAdmin.course.disclaimer')} value={disclaimer} onChange={setDisclaimer} multiline rows={3} />
        <fieldset>
          <legend className="label">{t('courseAdmin.course.autoEnroll')}</legend>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => {
              const on = statuses.includes(s);
              return (
                <label key={s} className={clsx('inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold', on ? 'border-primary bg-primary/[0.06] text-ink' : 'border-line bg-card text-ink/80')}>
                  <input type="checkbox" className="size-3.5 accent-primary" checked={on} onChange={(e) => setStatuses(e.target.checked ? [...statuses, s] : statuses.filter((x) => x !== s))} />
                  {statusLabel(s)}
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted">{t('courseAdmin.course.autoEnrollHint')}</p>
        </fieldset>
      </fieldset>
      {canEdit && (
        <Button type="submit" loading={busy} size="sm">
          {t('courseAdmin.course.save')}
        </Button>
      )}
    </form>
  );
};

// ─── Module dialog ────────────────────────────────────────────────────

const ModuleDialog = ({ course, module, onClose }: { course: AdminCourse; module: AdminCourse['modules'][number] | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const run = useRun(course.id);
  const [title, setTitle] = useState(fill(module?.title));
  const [description, setDescription] = useState(fill(module?.description));
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await run(() => (module ? api.patch(`/admin/course/modules/${module.id}`, { title, description }) : api.post(`/admin/course/courses/${course.id}/modules`, { title, description })), t('courseAdmin.course.saved'));
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={module ? t('courseAdmin.module.edit') : t('courseAdmin.module.newTitle')}
      as="form"
      onSubmit={submit}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {t('courseAdmin.course.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <L10nInput label={t('courseAdmin.module.title')} value={title} onChange={setTitle} required />
        <L10nInput label={t('courseAdmin.module.description')} value={description} onChange={setDescription} multiline rows={2} />
      </div>
    </Modal>
  );
};

// ─── Lesson files (video, poster, subtitles) ──────────────────────────

const videoDuration = (file: File) =>
  new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? v.duration : null);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    v.src = url;
  });

const FilePick = ({ accept, label, icon, onPick, disabled, variant = 'secondary' }: { accept: string; label: string; icon: LucideIcon; onPick: (f: File) => void; disabled?: boolean; variant?: 'secondary' | 'ghost' }) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onPick(f);
        }}
      />
      <Button size="sm" variant={variant} icon={icon} disabled={disabled} onClick={() => ref.current?.click()}>
        {label}
      </Button>
    </>
  );
};

const LessonFiles = ({ course, lesson }: { course: AdminCourse; lesson: AdminLesson }) => {
  const { t } = useTranslation();
  const run = useRun(course.id);
  const [percent, setPercent] = useState<number | null>(null);
  const base = `/admin/course/lessons/${lesson.id}`;

  const uploadVideo = async (file: File) => {
    const duration = await videoDuration(file);
    const form = new FormData();
    if (duration) form.append('duration', String(Math.round(duration)));
    form.append('file', file);
    setPercent(0);
    await run(() => api.post(`${base}/video`, form, { onUploadProgress: (e) => setPercent(e.total ? Math.round((e.loaded / e.total) * 100) : null) }), t('courseAdmin.video.uploaded'));
    setPercent(null);
  };
  const upload = async (path: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    await run(() => api.post(`${base}/${path}`, form), t('courseAdmin.course.saved'));
  };

  return (
    <section className="space-y-3 rounded-xl border border-line p-3" aria-labelledby={`files-${lesson.id}`}>
      <h3 id={`files-${lesson.id}`} className="type-card-title text-ink">
        {t('courseAdmin.video.title')}
      </h3>
      {lesson.video ? (
        <div className="space-y-2">
          <video controls preload="metadata" className="aspect-video w-full rounded-lg bg-navy-900" poster={lesson.poster ? `/api${base}/poster` : undefined}>
            <source src={`/api${base}/video`} type={lesson.video.mime ?? undefined} />
            {lesson.subtitles.map((l) => (
              <track key={l} kind="subtitles" srcLang={l} label={LANG_NAME[l]} src={`/api${base}/subtitles/${l}.vtt`} />
            ))}
          </video>
          <p className="text-xs text-muted">
            {lesson.video.mime} · {lesson.video.size ? `${(lesson.video.size / 1024 / 1024).toFixed(1)} MB` : ''}
            {lesson.video.duration ? ` · ${fmtDuration(lesson.video.duration)}` : ''}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">{t('courseAdmin.video.none')}</p>
      )}
      {percent !== null && (
        <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t('courseAdmin.video.uploading', { percent })} className="h-2 overflow-hidden rounded-full bg-sunken">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <FilePick accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" icon={Upload} label={lesson.video ? t('courseAdmin.video.replace') : t('courseAdmin.video.upload')} onPick={(f) => void uploadVideo(f)} disabled={percent !== null} />
        {lesson.video && (
          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => void run(() => api.delete(`${base}/video`))}>
            {t('courseAdmin.video.remove')}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">{t('courseAdmin.video.hint')}</p>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
          <ImageIcon className="size-4" aria-hidden />
          {t('courseAdmin.video.poster')}
        </span>
        <FilePick accept="image/jpeg,image/png,image/webp" icon={Upload} label={t('courseAdmin.video.posterUpload')} onPick={(f) => void upload('poster', f)} variant="ghost" />
        {lesson.poster && (
          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => void run(() => api.delete(`${base}/poster`))}>
            {t('courseAdmin.video.posterRemove')}
          </Button>
        )}
      </div>
      <div className="space-y-2 border-t border-line pt-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Subtitles className="size-4" aria-hidden />
          {t('courseAdmin.video.subtitles')}
        </span>
        <div className="flex flex-wrap gap-2">
          {COURSE_LOCALES.map((l) =>
            lesson.subtitles.includes(l) ? (
              <Button key={l} size="sm" variant="ghost" icon={Trash2} onClick={() => void run(() => api.delete(`${base}/subtitles/${l}`))}>
                {t('courseAdmin.video.subtitlesRemove', { lang: LANG_NAME[l] })}
              </Button>
            ) : (
              <FilePick key={l} accept=".vtt,text/vtt" icon={Upload} label={t('courseAdmin.video.subtitlesUpload', { lang: LANG_NAME[l] })} onPick={(f) => void upload(`subtitles/${l}`, f)} variant="ghost" />
            ),
          )}
        </div>
      </div>
    </section>
  );
};

// ─── Lesson dialog ────────────────────────────────────────────────────

const LessonDialog = ({ course, moduleId, lesson, onClose, onCreated }: { course: AdminCourse; moduleId: string; lesson: AdminLesson | null; onClose: () => void; onCreated: (id: string) => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const run = useRun(course.id);
  const [kind, setKind] = useState<LessonKind>(lesson?.kind ?? 'TEXT');
  const [title, setTitle] = useState(fill(lesson?.title));
  const [body, setBody] = useState(fill(lesson?.body));
  const [minutes, setMinutes] = useState(lesson?.minutes ? String(lesson.minutes) : '');
  const [passMark, setPassMark] = useState(String(lesson?.passMark ?? 70));
  const [target, setTarget] = useState(lesson?.moduleId ?? moduleId);
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => toQuestionDrafts(lesson?.questions ?? []));
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (kind === 'QUIZ' && !questionsValid(questions)) return;
    setBusy(true);
    const payload = { title, body, minutes: minutes ? Number(minutes) : null, ...(kind === 'QUIZ' ? { passMark: Number(passMark) || 70 } : {}) };
    let ok: boolean;
    let newId: string | null = null;
    if (lesson) {
      ok = await run(() => api.patch(`/admin/course/lessons/${lesson.id}`, { ...payload, ...(target !== lesson.moduleId ? { moduleId: target } : {}) }));
      if (ok && kind === 'QUIZ') ok = await run(() => api.put(`/admin/course/lessons/${lesson.id}/questions`, { questions }));
    } else {
      ok = await run(async () => {
        const r = await api.post<{ lesson: { id: string }; course: AdminCourse }>(`/admin/course/modules/${moduleId}/lessons`, { kind, ...payload });
        newId = r.data.lesson.id;
        return r;
      });
      if (ok && newId && kind === 'QUIZ' && questions.length) ok = await run(() => api.put(`/admin/course/lessons/${newId}/questions`, { questions }));
    }
    setBusy(false);
    if (!ok) return;
    toast.success(t('courseAdmin.course.saved'));
    // A new video lesson stays open in edit mode, so the video can be uploaded right away.
    if (!lesson && kind === 'VIDEO' && newId) onCreated(newId);
    else onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      align="top"
      title={lesson ? t('courseAdmin.lesson.edit') : t('courseAdmin.lesson.newTitle')}
      as="form"
      onSubmit={submit}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {t('courseAdmin.course.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">{t('courseAdmin.lesson.kind')}</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as LessonKind)} disabled={!!lesson}>
              {(['TEXT', 'VIDEO', 'QUIZ'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`courseAdmin.lesson.kinds.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('courseAdmin.lesson.minutes')}</span>
            <input className="input" type="number" min={1} max={600} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </label>
          {kind === 'QUIZ' && (
            <label className="block">
              <span className="label">{t('courseAdmin.lesson.passMark')}</span>
              <input className="input" type="number" min={1} max={100} inputMode="numeric" value={passMark} onChange={(e) => setPassMark(e.target.value)} />
            </label>
          )}
          {lesson && course.modules.length > 1 && (
            <label className="block">
              <span className="label">{t('courseAdmin.lesson.module')}</span>
              <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                {course.modules.map((m, i) => (
                  <option key={m.id} value={m.id}>
                    {i + 1}. {tr(m.title)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <L10nInput label={t('courseAdmin.lesson.title')} value={title} onChange={setTitle} required />
        <L10nInput
          label={kind === 'QUIZ' ? t('courseAdmin.lesson.bodyQuiz') : kind === 'VIDEO' ? t('courseAdmin.lesson.bodyVideo') : t('courseAdmin.lesson.body')}
          value={body}
          onChange={setBody}
          multiline
          rows={kind === 'TEXT' ? 12 : 3}
        />
        {kind === 'VIDEO' && lesson && <LessonFiles course={course} lesson={lesson} />}
        {kind === 'QUIZ' && (
          <section className="space-y-2" aria-label={t('courseAdmin.quiz.title')}>
            <h3 className="type-card-title text-ink">{t('courseAdmin.quiz.title')}</h3>
            <QuizEditor value={questions} onChange={setQuestions} />
          </section>
        )}
      </div>
    </Modal>
  );
};

// ─── Builder ──────────────────────────────────────────────────────────

const problemText = (t: (k: string, o?: Record<string, unknown>) => string, course: AdminCourse, p: string, tr: (v: L10n | null) => string) => {
  const [code, id] = p.split(':');
  const lesson = course.modules.flatMap((m) => m.lessons).find((l) => l.id === id);
  return t(`courseAdmin.course.problem.${code}`, { title: lesson ? tr(lesson.title) : '' });
};

/** Admin → Hazırlıq kursu → one course: details, modules → lessons (reorder, edit, files, quiz), publish. */
export function CourseBuilder({ courseId, onBack }: { courseId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { user } = useAuth();
  const canEdit = hasMinRole(user?.role, 'ADMIN');
  const q = useAdminCourse(courseId);
  const run = useRun(courseId);
  const [moduleDialog, setModuleDialog] = useState<{ module: AdminCourse['modules'][number] | null } | null>(null);
  const [lessonDialog, setLessonDialog] = useState<{ moduleId: string; lessonId: string | null } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => Promise<unknown> } | null>(null);
  const [busy, setBusy] = useState(false);

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const c = q.data;

  const reorder = (url: string, ids: string[], i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    void run(() => api.post(url, { ids: next }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>
            {t('courseAdmin.course.back')}
          </Button>
          <h2 className="type-section-title mt-1 flex flex-wrap items-center gap-2 text-ink">
            {tr(c.title)}
            <Badge tone={c.published ? 'success' : 'neutral'}>{c.published ? t('courseAdmin.list.published') : t('courseAdmin.list.draft')}</Badge>
          </h2>
          <p className="type-small">{t('courseAdmin.course.stats', c.stats)}</p>
          <div className="mt-2">
            <CompletenessChips value={c.completeness} label={t('courseAdmin.course.completeness')} />
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={c.published ? 'secondary' : 'primary'}
              icon={c.published ? EyeOff : Eye}
              loading={busy}
              disabled={!c.published && c.problems.length > 0}
              onClick={async () => {
                setBusy(true);
                await run(() => api.post(`/admin/course/courses/${c.id}/publish`, { published: !c.published }), c.published ? t('courseAdmin.course.unpublishedToast') : t('courseAdmin.course.publishedToast'));
                setBusy(false);
              }}
            >
              {c.published ? t('courseAdmin.course.unpublish') : t('courseAdmin.course.publish')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={Trash2}
              onClick={() =>
                setConfirm({
                  title: t('courseAdmin.course.delete'),
                  message: t('courseAdmin.course.deleteConfirm'),
                  action: async () => {
                    if (await run(() => api.delete(`/admin/course/courses/${c.id}`))) onBack();
                  },
                })
              }
            >
              {t('courseAdmin.course.delete')}
            </Button>
          </div>
        )}
      </div>

      {c.problems.length > 0 && (
        <div className="rounded-xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg" role="status">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" aria-hidden />
            {t('courseAdmin.course.problems')}
          </p>
          <ul className="mt-1 list-disc ps-6">
            {c.problems.map((p) => (
              <li key={p}>{problemText(t, c, p, tr)}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="rounded-xl border border-line bg-card" open={!c.modules.length}>
        <summary className="min-h-11 cursor-pointer px-4 py-3 font-semibold text-ink">{t('courseAdmin.course.details')}</summary>
        <div className="border-t border-line p-4">
          <DetailsForm key={c.updatedAt} course={c} canEdit={canEdit} />
        </div>
      </details>

      <ol className="space-y-3">
        {c.modules.map((m, mi) => (
          <li key={m.id} className="rounded-xl border border-line bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 sm:px-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sunken text-sm font-bold text-ink">{mi + 1}</span>
              <span className="min-w-0 flex-1 font-semibold text-ink">{tr(m.title)}</span>
              {canEdit && (
                <span className="flex items-center gap-1">
                  <IconButton icon={ArrowUp} size="sm" label={t('courseAdmin.module.up')} disabled={mi === 0} onClick={() => reorder(`/admin/course/courses/${c.id}/modules/reorder`, c.modules.map((x) => x.id), mi, -1)} />
                  <IconButton icon={ArrowDown} size="sm" label={t('courseAdmin.module.down')} disabled={mi === c.modules.length - 1} onClick={() => reorder(`/admin/course/courses/${c.id}/modules/reorder`, c.modules.map((x) => x.id), mi, 1)} />
                  <IconButton icon={Pencil} size="sm" label={t('courseAdmin.module.edit')} onClick={() => setModuleDialog({ module: m })} />
                  <IconButton
                    icon={Trash2}
                    size="sm"
                    variant="danger"
                    label={t('courseAdmin.module.delete')}
                    onClick={() => setConfirm({ title: t('courseAdmin.module.delete'), message: t('courseAdmin.module.deleteConfirm'), action: () => run(() => api.delete(`/admin/course/modules/${m.id}`)) })}
                  />
                </span>
              )}
            </div>
            {m.lessons.length === 0 && <p className="px-4 py-3 text-sm text-muted">{t('courseAdmin.module.empty')}</p>}
            <ul className="divide-y divide-line">
              {m.lessons.map((l, li) => {
                const Icon = KIND_ICON[l.kind];
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
                    <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                    <button type="button" className="min-h-10 min-w-0 flex-1 text-left" onClick={() => setLessonDialog({ moduleId: m.id, lessonId: l.id })}>
                      <span className="block truncate text-sm font-medium text-ink">{tr(l.title)}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        {t(`courseAdmin.lesson.kinds.${l.kind}`)}
                        {l.kind === 'QUIZ' && <span>· {t('courseAdmin.lesson.questions', { count: l.questions.length })}</span>}
                        {l.kind === 'VIDEO' && (
                          <span className="inline-flex items-center gap-1">
                            · <Film className="size-3" aria-hidden /> {l.video ? (l.video.duration ? fmtDuration(l.video.duration) : '✓') : t('courseAdmin.video.none')}
                            {l.subtitles.length > 0 && ` · CC ${l.subtitles.map((s) => s.toUpperCase()).join(' ')}`}
                          </span>
                        )}
                      </span>
                    </button>
                    <CompletenessChips value={l.completeness} label={t('courseAdmin.course.completeness')} />
                    {canEdit && (
                      <span className="flex items-center gap-1">
                        <IconButton icon={ArrowUp} size="sm" label={t('courseAdmin.lesson.up')} disabled={li === 0} onClick={() => reorder(`/admin/course/modules/${m.id}/lessons/reorder`, m.lessons.map((x) => x.id), li, -1)} />
                        <IconButton icon={ArrowDown} size="sm" label={t('courseAdmin.lesson.down')} disabled={li === m.lessons.length - 1} onClick={() => reorder(`/admin/course/modules/${m.id}/lessons/reorder`, m.lessons.map((x) => x.id), li, 1)} />
                        <IconButton
                          icon={Trash2}
                          size="sm"
                          variant="danger"
                          label={t('courseAdmin.lesson.delete')}
                          onClick={() => setConfirm({ title: t('courseAdmin.lesson.delete'), message: t('courseAdmin.lesson.deleteConfirm'), action: () => run(() => api.delete(`/admin/course/lessons/${l.id}`)) })}
                        />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {canEdit && (
              <div className="border-t border-line px-3 py-2 sm:px-4">
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => setLessonDialog({ moduleId: m.id, lessonId: null })}>
                  {t('courseAdmin.lesson.add')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {canEdit && (
        <Button variant="secondary" icon={Plus} onClick={() => setModuleDialog({ module: null })}>
          {t('courseAdmin.module.add')}
        </Button>
      )}

      {moduleDialog && <ModuleDialog course={c} module={moduleDialog.module} onClose={() => setModuleDialog(null)} />}
      {lessonDialog && (
        <LessonDialog
          key={lessonDialog.lessonId ?? 'new'}
          course={c}
          moduleId={lessonDialog.moduleId}
          lesson={lessonDialog.lessonId ? (c.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonDialog.lessonId) ?? null) : null}
          onClose={() => setLessonDialog(null)}
          onCreated={(id) => setLessonDialog({ moduleId: lessonDialog.moduleId, lessonId: id })}
        />
      )}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        confirmLabel={t('common.delete')}
        loading={busy}
        onConfirm={async () => {
          if (!confirm) return;
          setBusy(true);
          await confirm.action();
          setBusy(false);
          setConfirm(null);
        }}
      />
    </div>
  );
}
