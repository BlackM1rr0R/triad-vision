import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  BookUser,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Compass,
  FilePen,
  FileSignature,
  FileUp,
  GraduationCap,
  Hourglass,
  Landmark,
  ListChecks,
  MessageCircleHeart,
  PenLine,
  PlaneTakeoff,
  Rocket,
  ScrollText,
  Send,
  ShieldCheck,
  UserRound,
  Wallet,
} from 'lucide-react';
import { buttonClass } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useL10n } from '@/lib/l10n';
import { useMorphSource } from '@/lib/viewTransition';
import type { L10n } from '@/lib/types';
import type { NextAction, NextKind, NextStep } from '@/components/portal/usePortalNav';
import { CalendarDay, Documents, Germany, Handshake, Learning, PassportUpload, Success, Traveller, type IllustrationProps } from '@/components/illustrations';
import type { ComponentType } from 'react';

/** The drawing on the right of the next-step card (sm+): what the step is about, at a glance. */
const KIND_ILLUSTRATION: Record<NextKind, ComponentType<IllustrationProps>> = {
  ACCEPT_LEGAL: Documents,
  PAY_INVOICE: Documents,
  FIX_DOCS: PassportUpload,
  UPLOAD_DOCS: PassportUpload,
  SUBMIT_DOCS: PassportUpload,
  SIGN_CONTRACT: Documents,
  ATTEND_APPOINTMENT: CalendarDay,
  SIGN_DOCUMENTS: Documents,
  CONFIRM_DATA: Documents,
  FILL_FORM: Documents,
  CLIENT_TASK: Documents,
  RECOGNITION_DOCS: PassportUpload,
  ANSWER_CHECKIN: Handshake,
  ARRIVAL_PLAN: Germany,
  RENEW_RESIDENCE: CalendarDay,
  ONBOARDING: Learning,
  START_CASE: Traveller,
  PASSPORT_EXPIRY: PassportUpload,
  COMPLETE_PROFILE: Documents,
};

export const KIND_ICON: Record<NextKind, LucideIcon> = {
  ACCEPT_LEGAL: ScrollText,
  PAY_INVOICE: Wallet,
  FIX_DOCS: FilePen,
  UPLOAD_DOCS: FileUp,
  SUBMIT_DOCS: Send,
  SIGN_CONTRACT: PenLine,
  ATTEND_APPOINTMENT: CalendarCheck,
  SIGN_DOCUMENTS: FileSignature,
  CONFIRM_DATA: ShieldCheck,
  FILL_FORM: ClipboardList,
  CLIENT_TASK: ListChecks,
  RECOGNITION_DOCS: GraduationCap,
  ANSWER_CHECKIN: MessageCircleHeart,
  ARRIVAL_PLAN: PlaneTakeoff,
  RENEW_RESIDENCE: CalendarClock,
  ONBOARDING: Compass,
  START_CASE: Rocket,
  PASSPORT_EXPIRY: BookUser,
  COMPLETE_PROFILE: UserRound,
};

/** Pages whose heading is a morph target of the next-step card (useMorphTarget('portal-next', 'step')). */
const morphTarget = (to: string) => /^\/account\/cases\/[^/?#]+([?#]|$)/.test(to) || /^\/account\/payments([?#]|$)/.test(to);

/** Kinds whose sentence already names the date. */
const DATE_IN_TEXT: NextKind[] = ['ATTEND_APPOINTMENT', 'RENEW_RESIDENCE', 'PASSPORT_EXPIRY'];

/** Title / text / button label of one action (copy: pnav.next.kind.<KIND>). */
export const useActionCopy = () => {
  const { t, i18n } = useTranslation();
  const { tr, date } = useL10n();
  return (a: NextAction) => {
    const base = `pnav.next.kind.${a.kind}`;
    const detail = a.detail ? (typeof a.detail === 'string' ? a.detail : tr(a.detail as L10n)) : '';
    const day = a.dueAt ? date(a.dueAt, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const vars = { count: a.count, detail, date: day };
    const title = detail && i18n.exists(`${base}.titleDetail`) ? t(`${base}.titleDetail`, vars) : t(`${base}.title`, vars);
    return { title, text: t(`${base}.text`, vars), action: t(`${base}.action`), day };
  };
};

const SecondaryRow = ({ a }: { a: NextAction }) => {
  const { t } = useTranslation();
  const copy = useActionCopy()(a);
  const Icon = KIND_ICON[a.kind];
  return (
    <li>
      <Link to={a.to} className="group flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-sunken sm:px-3">
        <span className={clsx('grid size-9 shrink-0 place-items-center rounded-lg', a.overdue ? 'bg-danger-bg text-danger-fg' : 'chip-soft')}>
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold break-words text-ink">{copy.title}</span>
          {(a.overdue || copy.day) && (
            <span className={clsx('block text-xs', a.overdue ? 'font-semibold text-danger-fg' : 'text-muted')}>
              {a.overdue ? t('pnav.next.overdue') : t('pnav.next.due', { date: copy.day })}
            </span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </li>
  );
};

/**
 * Portal home hero: the single most important action now with one button straight to it, and up to
 * two smaller actions underneath. Without anything to do: who has the ball and until when.
 */
export function NextStepCard({ data, loading, caseLink, tour }: { data: NextStep | undefined; loading: boolean; caseLink?: string | null; tour?: string }) {
  const { t } = useTranslation();
  const { date } = useL10n();
  const copyOf = useActionCopy();
  // Shared-element morph: the card's title grows into the heading of the page its button opens
  // (case view, payments…: useMorphTarget('portal-next', 'step') there). Off without View Transitions.
  const morph = useMorphSource<HTMLElement>('portal-next', 'step');

  if (loading && !data) {
    return (
      <section className="flex items-center gap-4 rounded-3xl border border-line bg-highlight-bg p-6 sm:p-9" aria-busy="true" data-tour={tour}>
        <Skeleton className="size-14" rounded="xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </section>
    );
  }
  if (!data) return null;

  const a = data.primary;
  if (!a) {
    const side = data.waiting?.side ?? 'NONE';
    const Icon = side === 'EMBASSY' ? Landmark : side === 'TEAM' ? Hourglass : CheckCircle2;
    const WaitArt = side === 'EMBASSY' ? Germany : side === 'TEAM' ? Documents : Success;
    return (
      <section ref={morph.ref} className="relative overflow-hidden rounded-3xl border border-line bg-card shadow-[var(--tv-shadow-card)]" aria-labelledby="next-step-title" data-tour={tour}>
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-9">
          <div className="min-w-0 flex-1">
            <p className="type-overline inline-flex items-center gap-2 text-muted">
              <span className={clsx('size-2 rounded-full', side === 'NONE' ? 'bg-success' : 'bg-info')} aria-hidden />
              {t('pnav.next.eyebrow')}
            </p>
            <h2 id="next-step-title" className="mt-2 flex items-center gap-2.5 text-2xl font-semibold break-words text-ink sm:text-3xl sm:leading-tight" {...morph.part('title')}>
              <Icon className={clsx('size-6 shrink-0 sm:hidden', side === 'NONE' ? 'text-success' : 'text-info')} aria-hidden />
              {t(`pnav.next.wait.${side}.title`)}
            </h2>
            <p className="mt-2 max-w-[60ch] text-muted">{t(`pnav.next.wait.${side}.text`)}</p>
            {data.waiting?.expectedBy && (
              <p className="mt-3 text-sm font-semibold text-info-fg">{t('pnav.next.wait.expected', { date: date(data.waiting.expectedBy, { day: 'numeric', month: 'long' }) })}</p>
            )}
            {caseLink && (
              <Link to={caseLink} onClick={morphTarget(caseLink) ? morph.onClick : undefined} className={buttonClass({ variant: 'secondary', size: 'lg', className: 'mt-6 w-full sm:w-auto' })}>
                {t('pnav.next.wait.open')}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            )}
          </div>
          <WaitArt className="hidden w-44 shrink-0 sm:block lg:w-56" />
        </div>
      </section>
    );
  }

  const copy = copyOf(a);
  const Icon = KIND_ICON[a.kind];
  const Art = KIND_ILLUSTRATION[a.kind];
  const showDue = a.overdue || (copy.day && !DATE_IN_TEXT.includes(a.kind));
  return (
    <section
      ref={morph.ref}
      className={clsx('relative overflow-hidden rounded-3xl border bg-highlight-bg', a.overdue ? 'border-danger-border' : 'border-warning-border')}
      aria-labelledby="next-step-title"
      data-tour={tour}
    >
      <div className="p-6 sm:p-9">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
          <div className="min-w-0 flex-1">
            <p className="type-overline inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-ink">
              <span className={clsx('size-2 rounded-full', a.overdue ? 'bg-danger' : 'bg-highlight')} aria-hidden />
              {t('pnav.next.eyebrow')}
              {showDue && !a.overdue && <span className="font-semibold text-muted normal-case">· {t('pnav.next.due', { date: copy.day })}</span>}
            </p>
            <h2 id="next-step-title" className="mt-3 flex items-start gap-3 text-2xl font-semibold break-words text-ink sm:text-[2rem] sm:leading-tight" {...morph.part('title')}>
              <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-card text-ink sm:hidden">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">{copy.title}</span>
            </h2>
            <p className="mt-3 max-w-[60ch] text-ink/80">{copy.text}</p>
            {a.overdue && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="badge bg-danger-bg text-danger-fg">
                  <AlertTriangle className="size-3.5" aria-hidden /> {t('pnav.next.overdue')}
                  {copy.day ? ` · ${copy.day}` : ''}
                </span>
              </p>
            )}
            <Link to={a.to} onClick={morphTarget(a.to) ? morph.onClick : undefined} className={buttonClass({ size: 'lg', className: 'mt-6 w-full sm:w-auto' })}>
              {copy.action}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <Art className="hidden w-48 shrink-0 sm:block lg:w-60" />
        </div>

        {data.secondary.length > 0 && (
          <div className="mt-7 rounded-2xl border border-line bg-card p-2 sm:p-3">
            <h3 className="type-overline px-2 pt-1 text-muted sm:px-3">{t('pnav.next.also')}</h3>
            <ul className="mt-1">
              {data.secondary.map((s) => (
                <SecondaryRow key={`${s.kind}-${s.to}`} a={s} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
