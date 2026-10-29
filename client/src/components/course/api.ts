import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CaseStatus, L10n } from '@/lib/types';

/** Pre-departure course (server: lib/course, routes/course.ts, routes/admin/course.ts). */

export type LessonKind = 'VIDEO' | 'TEXT' | 'QUIZ';
export type QuestionKind = 'SINGLE' | 'MULTIPLE';
export type CourseLocale = 'az' | 'de' | 'en' | 'ru';
export const COURSE_LOCALES: CourseLocale[] = ['az', 'de', 'en', 'ru'];

export interface CourseProgress {
  total: number;
  done: number;
  percent: number;
  nextLessonId: string | null;
}

export interface CertificateInfo {
  number: string;
  code: string;
  issuedAt: string;
}

export interface MyCourse {
  id: string;
  title: L10n | null;
  description: L10n | null;
  modules: number;
  minutes: number;
  progress: CourseProgress;
  next: { lessonId: string; title: L10n | null; kind: LessonKind } | null;
  certificate: CertificateInfo | null;
  started: boolean;
}

export interface LessonProgress {
  startedAt: string;
  completedAt: string | null;
  watchedSeconds: number;
  positionSeconds: number;
  watchedPercent: number | null;
}

export interface QuizBest {
  score: number | null;
  attempts: number;
}

export interface CourseOutline {
  id: string;
  title: L10n | null;
  description: L10n | null;
  disclaimer: L10n | null;
  progress: CourseProgress;
  certificate: CertificateInfo | null;
  modules: {
    id: string;
    title: L10n | null;
    description: L10n | null;
    lessons: { id: string; kind: LessonKind; title: L10n | null; minutes: number | null; passMark: number | null; progress: LessonProgress | null; quiz: QuizBest | null }[];
  }[];
}

export interface LearnerQuestion {
  id: string;
  kind: QuestionKind;
  prompt: L10n | null;
  options: L10n[];
}

export interface LessonDetail {
  id: string;
  courseId: string;
  course: { id: string; title: L10n | null; disclaimer: L10n | null };
  module: { id: string; title: L10n | null; index: number } | null;
  kind: LessonKind;
  title: L10n | null;
  body: L10n | null;
  minutes: number | null;
  passMark: number;
  video: { mime: string | null; duration: number | null; poster: boolean } | null;
  subtitles: CourseLocale[];
  questions: LearnerQuestion[];
  progress: LessonProgress | null;
  quiz: QuizBest | null;
  prevId: string | null;
  nextId: string | null;
  position: { index: number; total: number };
}

export interface QuizResult {
  score: number;
  passed: boolean;
  passMark: number;
  right: number;
  total: number;
  best: QuizBest;
  results: { questionId: string; correct: boolean; explanation: L10n | null; correctOptions: number[] | null }[];
  course: CourseProgress | null;
  certificate: (CertificateInfo & { id: string }) | null;
}

export const COURSES_KEY = ['course', 'mine'] as const;
export const courseKey = (id: string) => ['course', 'outline', id] as const;
export const lessonKey = (id: string) => ['course', 'lesson', id] as const;

/** GET /course — my courses (also feeds the portal nav and the "continue the course" item). */
export const useMyCourses = (enabled = true) =>
  useQuery({
    queryKey: COURSES_KEY,
    queryFn: async () => (await api.get<{ courses: MyCourse[] }>('/course')).data.courses,
    staleTime: 5 * 60_000,
    enabled,
    retry: false,
  });

export const useCourseOutline = (id: string | undefined) =>
  useQuery({ queryKey: courseKey(id ?? ''), queryFn: async () => (await api.get<{ course: CourseOutline }>(`/course/${id}`)).data.course, enabled: !!id, retry: false });

export const useLesson = (id: string | undefined) =>
  useQuery({ queryKey: lessonKey(id ?? ''), queryFn: async () => (await api.get<{ lesson: LessonDetail }>(`/course/lessons/${id}`)).data.lesson, enabled: !!id, retry: false });

export const certificateHref = (courseId: string, lang: CourseLocale) => `/api/course/${courseId}/certificate.pdf?lang=${lang}`;
export const lessonHref = (courseId: string, lessonId: string) => `/account/course/${courseId}/lesson/${lessonId}`;

// ─── Admin ─────────────────────────────────────────────────────────────

export type Completeness = Record<CourseLocale, number>;

export interface AdminQuestion {
  id: string;
  kind: QuestionKind;
  prompt: L10n | null;
  options: L10n[];
  correct: number[];
  explanation: L10n | null;
  sortOrder: number;
}

export interface AdminLesson {
  id: string;
  moduleId: string;
  kind: LessonKind;
  title: L10n | null;
  body: L10n | null;
  minutes: number | null;
  passMark: number;
  sortOrder: number;
  video: { mime: string | null; size: number | null; duration: number | null } | null;
  poster: boolean;
  subtitles: CourseLocale[];
  questions: AdminQuestion[];
  completeness: Completeness;
}

export interface AdminCourseHeader {
  id: string;
  slug: string;
  title: L10n | null;
  description: L10n | null;
  disclaimer: L10n | null;
  published: boolean;
  publishedAt: string | null;
  autoEnrollStatuses: CaseStatus[];
  sortOrder: number;
  updatedAt: string;
}

export interface AdminCourseListItem extends AdminCourseHeader {
  lessons: number;
  enrolled: number;
  completed: number;
}

export interface AdminCourse extends AdminCourseHeader {
  completeness: Completeness;
  stats: { enrolled: number; completed: number; certificates: number };
  problems: string[];
  modules: { id: string; title: L10n | null; description: L10n | null; sortOrder: number; lessons: AdminLesson[] }[];
}

export interface ReportRow {
  enrollmentId: string;
  course: { id: string; title: L10n | null };
  user: { id: string; firstName: string; lastName: string; email: string };
  case: { id: string; number: string; status: CaseStatus; staff: { id: string; name: string } | null } | null;
  source: 'AUTO' | 'MANUAL';
  enrolledAt: string;
  lastActivityAt: string | null;
  completedAt: string | null;
  done: number;
  total: number;
  percent: number;
  quizzes: { lessonId: string; title: L10n | null; best: number | null; passed: boolean; attempts: number }[];
  avgQuiz: number | null;
  certificate: { number: string; issuedAt: string } | null;
}

export interface UserCourses {
  isClient: boolean;
  enrollments: {
    enrollmentId: string;
    course: { id: string; title: L10n | null; published: boolean };
    source: 'AUTO' | 'MANUAL';
    enrolledAt: string;
    lastActivityAt: string | null;
    completedAt: string | null;
    progress: CourseProgress;
    quizzes: { lessonId: string; title: L10n | null; best: number | null; attempts: number; passed: boolean }[];
    certificate: { id: string; number: string; issuedAt: string } | null;
  }[];
  available: { id: string; title: L10n | null }[];
}

export const ADMIN_COURSES_KEY = ['admin-course', 'list'] as const;
export const adminCourseKey = (id: string) => ['admin-course', 'course', id] as const;
export const userCoursesKey = (userId: string) => ['admin-course', 'user', userId] as const;

export const useAdminCourses = () =>
  useQuery({ queryKey: ADMIN_COURSES_KEY, queryFn: async () => (await api.get<{ courses: AdminCourseListItem[]; statuses: CaseStatus[] }>('/admin/course/courses')).data });

export const useAdminCourse = (id: string | null) =>
  useQuery({ queryKey: adminCourseKey(id ?? ''), queryFn: async () => (await api.get<{ course: AdminCourse }>(`/admin/course/courses/${id}`)).data.course, enabled: !!id });

export const useUserCourses = (userId: string) =>
  useQuery({ queryKey: userCoursesKey(userId), queryFn: async () => (await api.get<UserCourses>(`/admin/course/users/${userId}`)).data, staleTime: 60_000 });

export const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
