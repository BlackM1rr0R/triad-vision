import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Captions, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { toContentLocale } from '@/i18n';
import { fmtDuration, type CourseLocale, type LessonDetail, type LessonProgress } from './api';

const LANG_LABEL: Record<CourseLocale, string> = { az: 'Azərbaycanca', de: 'Deutsch', en: 'English', ru: 'Русский' };
const REPORT_EVERY_MS = 15_000;

export interface VideoReport {
  progress: LessonProgress;
  justCompleted: boolean;
  certificate: unknown;
}

/**
 * Lesson video: the browser's own controls (keyboard accessible: Space / arrows / F, captions menu), WebVTT
 * subtitles per language (the UI language is the default track), resume at the saved position, and progress
 * reports every 15 s, on pause / end and when leaving. Watched seconds are counted while the video plays
 * forward (seeking does not count); the server caps them by wall time and completes the lesson at 90 %.
 */
export function VideoPlayer({ lesson, onReport }: { lesson: LessonDetail; onReport: (r: VideoReport) => void }) {
  const { t, i18n } = useTranslation();
  const ref = useRef<HTMLVideoElement>(null);
  const base = useRef(lesson.progress?.watchedSeconds ?? 0);
  const seen = useRef(new Set<number>());
  const last = useRef<number | null>(null);
  const lastSent = useRef(0);
  const onReportRef = useRef(onReport);
  onReportRef.current = onReport;
  const [resumedAt, setResumedAt] = useState<number | null>(null);
  const [watched, setWatched] = useState(lesson.progress?.watchedPercent ?? 0);
  const [done, setDone] = useState(!!lesson.progress?.completedAt);
  const lang = toContentLocale(i18n.resolvedLanguage);
  const src = `/api/course/lessons/${lesson.id}`;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const send = () => {
      const duration = Number.isFinite(v.duration) ? v.duration : undefined;
      const watchedS = Math.min(duration ?? Infinity, base.current + seen.current.size);
      if (Math.abs(watchedS - lastSent.current) < 1 && v.currentTime === 0) return;
      lastSent.current = watchedS;
      void api
        .post<VideoReport>(`/course/lessons/${lesson.id}/progress`, { position: Math.floor(v.currentTime), watched: Math.floor(watchedS), duration })
        .then((r) => {
          setWatched(r.data.progress.watchedPercent ?? 0);
          if (r.data.progress.completedAt) setDone(true);
          onReportRef.current(r.data);
        })
        .catch(() => undefined);
    };
    const onTime = () => {
      const now = v.currentTime;
      // Natural playback moves < 1.5 s between timeupdate events; a bigger jump is a seek.
      if (!v.paused && last.current !== null && now >= last.current && now - last.current < 1.5) seen.current.add(Math.floor(now));
      last.current = now;
    };
    const onMeta = () => {
      const pos = lesson.progress?.positionSeconds ?? 0;
      if (pos > 5 && pos < v.duration - 5 && !lesson.progress?.completedAt) {
        v.currentTime = pos;
        setResumedAt(pos);
      }
      last.current = v.currentTime;
    };
    const onSeeked = () => {
      last.current = v.currentTime;
    };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('seeked', onSeeked);
    v.addEventListener('pause', send);
    v.addEventListener('ended', send);
    const timer = window.setInterval(() => {
      if (!v.paused) send();
    }, REPORT_EVERY_MS);
    return () => {
      window.clearInterval(timer);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('pause', send);
      v.removeEventListener('ended', send);
      if (seen.current.size > 0) send();
    };
  }, [lesson.id, lesson.progress?.positionSeconds, lesson.progress?.completedAt]);

  if (!lesson.video) return <p className="rounded-2xl bg-sunken p-6 text-center text-sm text-muted">{t('course.lesson.video.missing')}</p>;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl bg-navy-900">
        <video
          ref={ref}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full"
          poster={lesson.video.poster ? `${src}/poster` : undefined}
          aria-label={t('course.kind.VIDEO')}
        >
          <source src={`${src}/video`} type={lesson.video.mime ?? undefined} />
          {lesson.subtitles.map((l) => (
            <track key={l} kind="subtitles" srcLang={l} label={LANG_LABEL[l]} src={`${src}/subtitles/${l}.vtt`} default={l === lang} />
          ))}
          {t('course.lesson.video.unsupported')}
        </video>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted" aria-live="polite">
        {done ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-success-fg">
            <CheckCircle2 className="size-4" aria-hidden />
            {t('course.lesson.done')}
          </span>
        ) : (
          <span>{t('course.lesson.video.watched', { percent: watched })}</span>
        )}
        {resumedAt !== null && <span>{t('course.lesson.video.resume', { time: fmtDuration(resumedAt) })}</span>}
        {lesson.subtitles.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Captions className="size-4" aria-hidden />
            {t('course.lesson.video.captions')}
          </span>
        )}
      </div>
      {!done && <p className="text-xs text-muted">{t('course.lesson.video.hint')}</p>}
    </div>
  );
}
