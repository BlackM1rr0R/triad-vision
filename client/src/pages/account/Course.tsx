import { useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, ArrowRight, Award, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Circle, CircleHelp, Download, ExternalLink, GraduationCap, Info, Lock, PlayCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesCourse } from '@/i18n/pagesCourse';
import { Markdown } from '@/components/ops/Markdown';
import { ProgressRing } from '@/components/portal/ProgressRing';
import { useApiError } from '@/components/portal/useApiError';
import { Button, buttonClass } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { VideoPlayer } from '@/components/course/VideoPlayer';
import { QuizView } from '@/components/course/QuizView';
import {
  COURSES_KEY,
  COURSE_LOCALES,
  certificateHref,
  courseKey,
  lessonHref,
  lessonKey,
  useCourseOutline,
  useLesson,
  useMyCourses,
  type CertificateInfo,
  type CourseOutline,
  type LessonKind,
  type LessonProgress,
} from '@/components/course/api';

registerCopy(pagesCourse);

const KIND_ICON: Record<LessonKind, LucideIcon> = { VIDEO: PlayCircle, TEXT: BookOpen, QUIZ: CircleHelp };

const PageSkeleton = () => (
  <div className="space-y-4" aria-busy="true">
    <Skeleton className="h-36 w-full" rounded="xl" />
    <Skeleton className="h-20 w-full" rounded="xl" />
    <Skeleton className="h-20 w-full" rounded="xl" />
  </div>
);

const Disclaimer = ({ text }: { text: string }) => {
  const { t } = useTranslation();
  if (!text) return null;
  return (
    <aside className="flex items-start gap-3 rounded-2xl border border-info-border bg-info-bg p-4 text-sm text-info-fg" aria-label={t('course.lesson.disclaimer')}>
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{text}</p>
    </aside>
  );
};

// ─── Certificate ───────────────────────────────────────────────────────

const CertificateCard = ({ courseId, cert, locked }: { courseId: string; cert: CertificateInfo | null; locked?: boolean }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  if (!cert) {
    if (!locked) return null;
    return (
      <section className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4 text-sm text-muted sm:p-5" aria-labelledby="cert-locked">
        <Lock className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <h2 id="cert-locked" className="font-semibold text-ink">
            {t('course.certificate.title')}
          </h2>
          <p className="mt-0.5">{t('course.certificate.locked')}</p>
        </div>
      </section>
    );
  }
  return (
    <section className="rounded-3xl border border-success-border bg-success-bg p-5 sm:p-6" aria-labelledby="cert-ready">
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-card text-success-fg">
          <Award className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="cert-ready" className="text-lg font-semibold text-ink">
            {t('course.certificate.ready')}
          </h2>
          <p className="mt-1 text-sm text-ink/80">{t('course.certificate.text')}</p>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <div>
              <dt className="inline text-muted">{t('course.certificate.number')}: </dt>
              <dd className="code-id inline font-semibold text-ink">{cert.number}</dd>
            </div>
            <div>
              <dt className="inline text-muted">{t('course.certificate.issued')}: </dt>
              <dd className="inline font-semibold text-ink">{date(cert.issuedAt)}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {COURSE_LOCALES.map((l) => (
          <a key={l} href={certificateHref(courseId, l)} download className={buttonClass({ variant: 'secondary', size: 'sm' })} lang={l}>
            <Download className="size-4" aria-hidden />
            <span>
              <span className="sr-only">{t('course.certificate.download')}: </span>
              {t(`course.certificate.lang.${l}`)}
            </span>
          </a>
        ))}
      </div>
      <a href={`/certificate/${cert.code}`} target="_blank" rel="noopener" className="link mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm">
        {t('course.certificate.verify')}
        <ExternalLink className="size-3.5" aria-hidden />
      </a>
    </section>
  );
};

// ─── Overview ──────────────────────────────────────────────────────────

const LessonState = ({ progress, kind, best }: { progress: LessonProgress | null; kind: LessonKind; best: number | null | undefined }) => {
  const { t } = useTranslation();
  if (progress?.completedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-fg">
        <CheckCircle2 className="size-4" aria-hidden />
        <span className="sr-only sm:not-sr-only">{t('course.status.done')}</span>
      </span>
    );
  }
  if (progress) {
    return (
      <span className="text-xs font-semibold text-warning-fg">
        {kind === 'QUIZ' && best !== null && best !== undefined ? t('course.status.best', { score: best }) : kind === 'VIDEO' && progress.watchedPercent ? `${progress.watchedPercent}%` : t('course.status.inProgress')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-subtle">
      <Circle className="size-4" aria-hidden />
      <span className="sr-only">{t('course.status.notStarted')}</span>
    </span>
  );
};

const Overview = ({ course }: { course: CourseOutline }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const p = course.progress;
  const all = course.modules.flatMap((m) => m.lessons);
  const started = all.some((l) => l.progress);
  const nextId = p.nextLessonId ?? all[0]?.id ?? null;
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-line bg-card p-5 shadow-[var(--tv-shadow-card)] sm:p-7" aria-labelledby="course-title">
        <div className="flex items-start gap-4">
          <ProgressRing percent={p.percent} size={72} stroke={7} label={`${p.percent}%`} />
          <div className="min-w-0 flex-1">
            <p className="type-overline text-muted">{t('course.page.title')}</p>
            <h1 id="course-title" className="type-page-title mt-1 break-words text-ink">
              {tr(course.title)}
            </h1>
            <p className="mt-1 text-sm text-muted">{p.done === p.total && p.total > 0 ? t('course.overview.allDone') : t('course.overview.progress', { done: p.done, total: p.total })}</p>
          </div>
        </div>
        {course.description && tr(course.description) && <p className="measure mt-4 text-[15px] text-ink/85">{tr(course.description)}</p>}
        {nextId && (
          <Link to={lessonHref(course.id, nextId)} className={clsx(buttonClass({ variant: p.nextLessonId ? 'primary' : 'secondary' }), 'mt-5 w-full sm:w-auto')}>
            {p.nextLessonId ? (started ? t('course.overview.continue') : t('course.overview.start')) : t('course.overview.review')}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </section>

      <CertificateCard courseId={course.id} cert={course.certificate} locked />

      <section aria-labelledby="course-modules" className="space-y-3">
        <h2 id="course-modules" className="type-section-title text-ink">
          {t('course.overview.modules')}
        </h2>
        {course.modules.map((m, mi) => {
          const done = m.lessons.filter((l) => l.progress?.completedAt).length;
          return (
            <article key={m.id} className="overflow-hidden rounded-2xl border border-line bg-card" aria-labelledby={`mod-${m.id}`}>
              <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
                <span className={clsx('grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold', done === m.lessons.length && m.lessons.length ? 'bg-success-bg text-success-fg' : 'bg-sunken text-ink')}>{mi + 1}</span>
                <div className="min-w-0 flex-1">
                  <h3 id={`mod-${m.id}`} className="font-semibold text-ink">
                    {tr(m.title)}
                  </h3>
                  {m.description && tr(m.description) && <p className="truncate text-xs text-muted">{tr(m.description)}</p>}
                </div>
                <span className="num shrink-0 text-xs text-muted">
                  {done}/{m.lessons.length}
                </span>
              </header>
              <ul className="divide-y divide-line">
                {m.lessons.map((l) => {
                  const Icon = KIND_ICON[l.kind];
                  const isNext = l.id === p.nextLessonId;
                  return (
                    <li key={l.id}>
                      <Link
                        to={lessonHref(course.id, l.id)}
                        className={clsx('flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken sm:px-5', isNext && 'bg-highlight-bg/60')}
                        aria-current={isNext ? 'step' : undefined}
                      >
                        <Icon className="size-5 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-medium text-ink">{tr(l.title)}</span>
                          <span className="block text-xs text-muted">
                            {t(`course.kind.${l.kind}`)}
                            {l.minutes ? ` · ${t('course.overview.minutes', { count: l.minutes })}` : ''}
                            {isNext ? ` · ${t('course.overview.next')}` : ''}
                          </span>
                        </span>
                        <LessonState progress={l.progress} kind={l.kind} best={l.quiz?.score} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </section>

      <Disclaimer text={tr(course.disclaimer)} />
    </div>
  );
};

// ─── Lesson ────────────────────────────────────────────────────────────

const LessonPage = ({ courseId, lessonId }: { courseId: string; lessonId: string }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const apiError = useApiError();
  const navigate = useNavigate();
  const q = useLesson(lessonId);
  const heading = useRef<HTMLHeadingElement>(null);
  const lesson = q.data;
  usePageTitle(lesson ? tr(lesson.title) : t('course.page.title'));

  // Move focus to the lesson title on navigation (screen readers, keyboard users).
  useEffect(() => {
    if (lesson) heading.current?.focus();
  }, [lesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = (certified?: unknown) => {
    void qc.invalidateQueries({ queryKey: courseKey(courseId) });
    void qc.invalidateQueries({ queryKey: COURSES_KEY });
    void qc.invalidateQueries({ queryKey: lessonKey(lessonId) });
    if (certified) toast.success(t('course.certified'));
  };

  const markDone = async () => {
    try {
      const r = (await api.post<{ certificate: unknown }>(`/course/lessons/${lessonId}/complete`)).data;
      toast.success(t('course.lesson.saved'));
      refresh(r.certificate && !lesson?.nextId ? r.certificate : null);
      if (lesson?.nextId) navigate(lessonHref(courseId, lesson.nextId));
    } catch (err) {
      apiError(err);
    }
  };

  if (q.isLoading) return <PageSkeleton />;
  if (!lesson) return <EmptyState icon={GraduationCap} title={t('course.page.notFound')} action={<Link to="/account/course" className={buttonClass({ variant: 'secondary' })}>{t('course.lesson.back')}</Link>} />;

  const done = !!lesson.progress?.completedAt;
  const body = tr(lesson.body);
  const nav = (
    <nav className="flex items-center justify-between gap-2 border-t border-line pt-4" aria-label={t('course.lesson.position', lesson.position)}>
      {lesson.prevId ? (
        <Link to={lessonHref(courseId, lesson.prevId)} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
          <ChevronLeft className="size-4" aria-hidden />
          {t('course.lesson.prev')}
        </Link>
      ) : (
        <span />
      )}
      {lesson.nextId ? (
        <Link to={lessonHref(courseId, lesson.nextId)} className={buttonClass({ variant: done ? 'primary' : 'secondary', size: 'sm' })}>
          {t('course.lesson.next')}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <Link to={`/account/course/${courseId}`} className={buttonClass({ variant: done ? 'primary' : 'secondary', size: 'sm' })}>
          {t('course.lesson.finish')}
        </Link>
      )}
    </nav>
  );

  return (
    <article className="space-y-5" aria-labelledby="lesson-title">
      <div>
        <Link to={`/account/course/${courseId}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link hover:text-link-hover">
          <ArrowLeft className="size-4" aria-hidden />
          {t('course.lesson.back')}
        </Link>
        <p className="type-caption mt-1">
          {lesson.module ? `${t('course.overview.moduleN', { n: lesson.module.index })} · ${tr(lesson.module.title)} · ` : ''}
          {t('course.lesson.position', lesson.position)}
        </p>
        <h1 id="lesson-title" ref={heading} tabIndex={-1} className="type-page-title mt-1 break-words text-ink outline-none">
          {tr(lesson.title)}
        </h1>
        {done && (
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-success-fg">
            <CheckCircle2 className="size-4" aria-hidden />
            {t('course.lesson.done')}
          </p>
        )}
      </div>

      {lesson.kind === 'VIDEO' && <VideoPlayer lesson={lesson} onReport={(r) => r.justCompleted && refresh(r.certificate && !lesson.nextId ? r.certificate : null)} />}

      {body && (
        <div className="rounded-2xl border border-line bg-card p-4 sm:p-6">
          <Markdown source={body} className="measure text-[15px]" />
        </div>
      )}

      {lesson.kind === 'QUIZ' && <QuizView key={lesson.id} lesson={lesson} onResult={(r) => r.passed && refresh(r.certificate)} />}

      {lesson.kind === 'TEXT' && !done && (
        <Button icon={CheckCircle2} onClick={() => void markDone()} block className="sm:w-auto">
          {t('course.lesson.markDone')}
        </Button>
      )}

      <Disclaimer text={tr(lesson.course.disclaimer)} />
      {nav}
    </article>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────

const CourseById = ({ courseId }: { courseId: string }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const q = useCourseOutline(courseId);
  usePageTitle(q.data ? tr(q.data.title) : t('course.page.title'));
  if (q.isLoading) return <PageSkeleton />;
  if (!q.data) return <EmptyState icon={GraduationCap} title={t('course.page.notFound')} action={<Link to="/account/course" className={buttonClass({ variant: 'secondary' })}>{t('course.page.all')}</Link>} />;
  return <Overview course={q.data} />;
};

const CourseList = () => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const q = useMyCourses();
  usePageTitle(t('course.page.title'));
  if (q.isLoading) return <PageSkeleton />;
  if (q.isError) return <EmptyState icon={GraduationCap} title={t('course.page.error')} />;
  const courses = q.data ?? [];
  if (!courses.length) return <EmptyState icon={GraduationCap} title={t('course.page.emptyTitle')} text={t('course.page.emptyText')} />;
  if (courses.length === 1) return <CourseById courseId={courses[0].id} />;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="type-page-title text-ink">{t('course.page.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('course.page.subtitle')}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {courses.map((c) => (
          <li key={c.id}>
            <Link to={`/account/course/${c.id}`} className="card-interactive flex h-full items-start gap-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
              <ProgressRing percent={c.progress.percent} size={56} stroke={6} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{tr(c.title)}</span>
                <span className="mt-0.5 block text-sm text-muted">{t('course.overview.progress', { done: c.progress.done, total: c.progress.total })}</span>
                {c.certificate && (
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-success-fg">
                    <Award className="size-4" aria-hidden />
                    {t('course.certificate.title')}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Client portal → Öyrən → Kurs: /account/course, /account/course/:courseId, /account/course/:courseId/lesson/:lessonId. */
export default function AccountCourse() {
  const { courseId, lessonId } = useParams();
  return <div className="mx-auto max-w-3xl">{courseId && lessonId ? <LessonPage courseId={courseId} lessonId={lessonId} /> : courseId ? <CourseById courseId={courseId} /> : <CourseList />}</div>;
}
