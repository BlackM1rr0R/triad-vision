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
      <Link to={a.to} className="group flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface sm:px-3">
        <span className={clsx('grid size-9 shrink-0 place-items-center rounded-lg', a.overdue ? 'bg-danger-bg text-danger-fg' : 'bg-brand-50 text-brand-600')}>
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
      <section className="card flex items-center gap-4 p-5 sm:p-7" aria-busy="true" data-tour={tour}>
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
    return (
      <section ref={morph.ref} className="card relative overflow-hidden" aria-labelledby="next-step-title" data-tour={tour}>
        <span className={clsx('absolute inset-y-0 left-0 w-1.5', side === 'NONE' ? 'bg-success' : 'bg-info')} aria-hidden />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-7 sm:pl-8">
          <span className={clsx('grid size-14 shrink-0 place-items-center rounded-2xl', side === 'NONE' ? 'bg-success-bg text-success-fg' : 'bg-info-bg text-info-fg')}>
            <Icon className="size-7" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">{t('pnav.next.eyebrow')}</p>
            <h2 id="next-step-title" className="mt-1 text-xl font-extrabold break-words text-ink sm:text-2xl" {...morph.part('title')}>
              {t(`pnav.next.wait.${side}.title`)}
            </h2>
            <p className="type-small mt-1.5">{t(`pnav.next.wait.${side}.text`)}</p>
            {data.waiting?.expectedBy && (
              <p className="mt-2 text-sm font-semibold text-info-fg">{t('pnav.next.wait.expected', { date: date(data.waiting.expectedBy, { day: 'numeric', month: 'long' }) })}</p>
            )}
          </div>
          {caseLink && (
            <Link to={caseLink} onClick={morphTarget(caseLink) ? morph.onClick : undefined} className={buttonClass({ variant: 'secondary', className: 'w-full shrink-0 sm:w-auto' })}>
              {t('pnav.next.wait.open')}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      </section>
    );
  }

  const copy = copyOf(a);
  const Icon = KIND_ICON[a.kind];
  return (
    <section
      ref={morph.ref}
      className={clsx('card relative overflow-hidden border-brand-400/50 ring-4 ring-brand-500/10', a.overdue && 'border-danger-border ring-danger/10')}
      aria-labelledby="next-step-title"
      data-tour={tour}
    >
      <span className={clsx('absolute inset-y-0 left-0 w-1.5', a.overdue ? 'bg-danger' : 'bg-brand-600')} aria-hidden />
      <div className="p-5 sm:p-7 sm:pl-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/25">
            <Icon className="size-7" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">{t('pnav.next.eyebrow')}</p>
            <h2 id="next-step-title" className="mt-1 text-xl font-extrabold break-words text-ink sm:text-[1.7rem] sm:leading-tight" {...morph.part('title')}>
              {copy.title}
            </h2>
            <p className="type-small mt-1.5 max-w-2xl">{copy.text}</p>
            {(a.overdue || (copy.day && !DATE_IN_TEXT.includes(a.kind))) && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {a.overdue ? (
                  <span className="badge bg-danger-bg text-danger-fg">
                    <AlertTriangle className="size-3.5" aria-hidden /> {t('pnav.next.overdue')}
                    {copy.day ? ` · ${copy.day}` : ''}
                  </span>
                ) : (
                  <span className="font-semibold text-muted">{t('pnav.next.due', { date: copy.day })}</span>
                )}
              </p>
            )}
          </div>
          <Link to={a.to} onClick={morphTarget(a.to) ? morph.onClick : undefined} className={buttonClass({ size: 'lg', className: 'w-full shrink-0 sm:w-auto' })}>
            {copy.action}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        {data.secondary.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="px-2 text-xs font-bold tracking-wide text-muted uppercase sm:px-3">{t('pnav.next.also')}</h3>
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
