import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, BookA, CheckCircle2, Download, ExternalLink, Gift, Link2, Snowflake, X, XCircle } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { ListenButton } from '@/components/world/ListenButton';
import { copyLink, downloadResultCard } from '@/components/games/shareCard';
import { AdventScene, DoorArt } from '@/components/advent/AdventArt';
import { registerCopy } from '@/i18n';
import { pagesAdvent } from '@/i18n/pagesAdvent';
import { pagesAudience } from '@/i18n/pagesAudience';
import { pagesToolsHub } from '@/i18n/pagesToolsHub';
import { pagesGames } from '@/i18n/pagesGames';
import { useAuth } from '@/lib/auth';
import { useBrand } from '@/lib/brand';
import { localePath } from '@/lib/localeRouter';
import { usePageTitle } from '@/lib/usePageTitle';
import { isStaffRole } from '@/lib/types';
import { pickTx } from '@/lib/games/common';
import { useReadyReport } from '@/lib/readyProgress/sync';
import { ADVENT_AS_OF, DOOR_ORDER, adventState, berlinDay, isOpenable, loadAdvent, saveAdvent, withAnswer, withOpened, type AdventProgress } from '@/lib/advent/calendar';
import { QUIZ_DAYS, doorOf, type Door } from '@/lib/advent/doors';

registerCopy(pagesAdvent);
registerCopy(pagesAudience);
registerCopy(pagesToolsHub);
registerCopy(pagesGames);

const PATH = '/advent-calendar';
const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * /advent-calendar — a German Advent calendar: 24 self-drawn doors on a snowy night scene. Doors unlock by the
 * Berlin date (lib/advent/calendar.ts; before 1 December a countdown, after 24 December all open). Each door is a
 * tradition, a German phrase (read aloud), a 3-option quiz or a practical tip (lib/advent/doors.ts, six
 * languages). Opened doors and quiz answers stay in localStorage; signed-in clients report quiz answers to
 * "Germany Ready" (activity 'advent-calendar'). ?door=N opens a door that is already unlocked; ?preview=all opens
 * everything for staff and in development.
 */
export default function AdventCalendarPage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('advent.heroTitle'));
  const lng = i18n.resolvedLanguage ?? 'az';
  const isDe = lng.startsWith('de');
  const brand = useBrand();
  const { user } = useAuth();
  const report = useReadyReport();
  const [params, setParams] = useSearchParams();
  // The date is only known in the browser (the server render shows all doors closed: no hydration mismatch).
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(berlinDay());
    const id = window.setInterval(() => setToday(berlinDay()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const state = today ? adventState(today) : null;
  const previewAll = params.get('preview') === 'all' && (import.meta.env.DEV || isStaffRole(user?.role));
  const openable = (day: number) => !!state && isOpenable(day, state, previewAll);

  const [progress, setProgress] = useState<AdventProgress>({ opened: [], quiz: {} });
  useEffect(() => {
    if (state) setProgress(loadAdvent(state.season));
  }, [state?.season]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (p: AdventProgress) => {
    setProgress(p);
    if (state) saveAdvent(state.season, p);
  };

  const [selected, setSelected] = useState<number | null>(null);
  const panelRef = useRef<HTMLHeadingElement>(null);

  // Deep link ?door=N once the date is known.
  useEffect(() => {
    if (!state) return;
    const n = Number(params.get('door'));
    if (Number.isInteger(n) && n >= 1 && n <= 24 && openable(n)) {
      setSelected(n);
      setProgress((p) => {
        const next = withOpened(p, n);
        saveAdvent(state.season, next);
        return next;
      });
    }
  }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (day: number) => {
    if (!openable(day)) {
      toast.info(t('advent.locked', { day }));
      return;
    }
    update(withOpened(progress, day));
    setSelected(day);
    const next = new URLSearchParams(params);
    next.set('door', String(day));
    setParams(next, { replace: true, preventScrollReset: true });
    // Let the door swing first, then bring the content into view.
    window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      panelRef.current?.focus({ preventScroll: true });
    }, reducedMotion() ? 0 : 450);
  };

  const answer = (door: Door, choice: number) => {
    if (!state || !door.quiz || String(door.day) in progress.quiz) return;
    update(withAnswer(withOpened(progress, door.day), door.day, choice));
    const right = choice === door.quiz.answer;
    report({ activityId: 'advent-calendar', item: `door-${door.day}`, score: right ? 1 : 0, max: 1, dedupeKey: `advent:${state.season}:${door.day}` });
  };

  const correct = QUIZ_DAYS.filter((d) => progress.quiz[d] === doorOf(d)?.quiz?.answer).length;
  const door = selected ? doorOf(selected) : null;

  const statusLine = !state
    ? null
    : previewAll
      ? t('advent.preview')
      : state.phase === 'advent'
        ? t('advent.advent', { day: state.unlocked })
        : state.phase === 'after'
          ? t('advent.after')
          : null;

  return (
    <>
      <PageHero title={t('advent.heroTitle')} subtitle={t('advent.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x max-w-5xl space-y-6">
          {state?.phase === 'before' && !previewAll && (
            <div className="flex flex-col gap-1 rounded-3xl border border-line bg-card p-5 sm:flex-row sm:items-center sm:justify-between" aria-live="polite">
              <div>
                <p className="font-display text-lg font-semibold text-ink">{t('advent.before.title')}</p>
                <p className="text-sm text-muted">{t('advent.before.preview')}</p>
              </div>
              <p className="font-display text-3xl font-semibold text-primary tabular-nums">{t('advent.before.count', { count: state.daysToStart })}</p>
            </div>
          )}
          {statusLine && (
            <p className="flex items-center gap-2 text-sm font-semibold text-ink" aria-live="polite">
              <Gift className="size-4 text-primary" aria-hidden /> {statusLine}
            </p>
          )}

          {/* The calendar board: night scene + 24 doors in a fixed scattered order. */}
          <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-[#0f2742] via-[#173a63] to-[#1f4f7d] shadow-[var(--tv-shadow-raised)] ring-1 ring-black/10 dark:ring-white/10">
            <AdventScene />
            <ul className="grid grid-cols-4 gap-2.5 p-3 sm:grid-cols-6 sm:gap-3.5 sm:p-5" aria-label={t('advent.calendarLabel')}>
              {DOOR_ORDER.map((day) => {
                const d = doorOf(day)!;
                const can = openable(day);
                const isOpen = can && progress.opened.includes(day);
                return (
                  <li key={day} className="aspect-[3/4]">
                    <button
                      type="button"
                      onClick={() => open(day)}
                      aria-label={can ? t('advent.doorOpen', { day }) : t('advent.doorLocked', { day })}
                      aria-pressed={selected === day}
                      className={clsx(
                        'size-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fcd34d]',
                        !can && 'cursor-not-allowed opacity-80',
                        selected === day && 'ring-2 ring-[#fcd34d] ring-offset-2 ring-offset-[#173a63]',
                      )}
                    >
                      <DoorArt day={day} kind={d.kind} open={isOpen} locked={!can} today={!!state && state.phase === 'advent' && state.unlocked === day} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="flex items-center justify-center gap-2 px-4 pb-4 text-center text-xs text-white/80">
              <Snowflake className="size-3.5" aria-hidden /> {t('advent.nextDoor')}
            </p>
          </div>

          <p className="text-sm text-muted tabular-nums">{t('advent.progress', { opened: progress.opened.length, correct, quizzes: QUIZ_DAYS.length })}</p>

          {door && openable(door.day) && (
            <DoorPanel
              door={door}
              lng={lng}
              isDe={isDe}
              chosen={progress.quiz[door.day]}
              onAnswer={(c) => answer(door, c)}
              onClose={() => {
                setSelected(null);
                const next = new URLSearchParams(params);
                next.delete('door');
                setParams(next, { replace: true, preventScrollReset: true });
              }}
              headingRef={panelRef}
              onCard={async () => {
                try {
                  await downloadResultCard({
                    lead: t('advent.cardLead', { day: door.day }),
                    big: `${door.day}.12.`,
                    sub: pickTx(door.title, lng),
                    lines: door.phrase ? [`„${door.phrase.de}“`, isDe ? '' : pickTx(door.phrase.tx, lng)].filter(Boolean) : door.quiz ? [pickTx(door.quiz.q, lng)] : [pickTx(door.text, lng).split(/(?<=[.!?])\s/)[0]],
                    footer: t('advent.cardFooter', { domain: brand.domain }),
                    filename: `advent-${door.day}`,
                  });
                } catch {
                  toast.error(t('games.common.cardFailed'));
                }
              }}
              onLink={async () =>
                (await copyLink(`${window.location.origin}${localePath(PATH)}?door=${door.day}`)) ? toast.success(t('games.common.copied')) : toast.error(t('games.common.copyFailed'))
              }
            />
          )}

          <p className="text-sm text-muted">{t('advent.ready')}</p>
          <p className="text-xs text-muted">{t('advent.asOf', { date: dmy(ADVENT_AS_OF) })}</p>
        </div>
      </section>
      <RelatedGuides tool={PATH} />
    </>
  );
}

const DoorPanel = ({
  door,
  lng,
  isDe,
  chosen,
  onAnswer,
  onClose,
  onCard,
  onLink,
  headingRef,
}: {
  door: Door;
  lng: string;
  isDe: boolean;
  chosen: number | undefined;
  onAnswer: (choice: number) => void;
  onClose: () => void;
  onCard: () => void;
  onLink: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) => {
  const { t } = useTranslation();
  const answered = chosen !== undefined;
  const right = door.quiz && chosen === door.quiz.answer;
  const toolKey = door.link?.toolKey;
  return (
    <article className="scroll-mt-24 rounded-3xl border border-line bg-card p-5 shadow-[var(--tv-shadow-raised)] sm:p-7" aria-labelledby="advent-door-h">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {t('advent.door', { day: door.day })} · {t(`advent.kind.${door.kind}`)}
          </p>
          <h2 id="advent-door-h" ref={headingRef} tabIndex={-1} className="mt-1 font-display text-2xl font-semibold text-ink outline-none">
            {pickTx(door.title, lng)}
          </h2>
        </div>
        <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink" aria-label={t('advent.close')}>
          <X className="size-5" aria-hidden />
        </button>
      </div>

      {door.phrase && (
        <div className="mt-4 rounded-2xl bg-sunken p-4">
          <p lang="de" className="font-display text-xl font-semibold text-ink">
            „{door.phrase.de}“
          </p>
          {!isDe && (
            <p className="mt-1 text-sm text-muted">
              <span className="font-semibold">{t('advent.meaning')}:</span> {pickTx(door.phrase.tx, lng)}
            </p>
          )}
          <ListenButton text={door.phrase.de} className="mt-3" />
        </div>
      )}

      {door.quiz && (
        <fieldset className="mt-4">
          <legend className="font-semibold text-ink">{pickTx(door.quiz.q, lng)}</legend>
          <div className="mt-3 grid gap-2">
            {door.quiz.options.map((o, i) => {
              const isAnswer = i === door.quiz!.answer;
              const isChosen = i === chosen;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={answered}
                  aria-pressed={isChosen}
                  onClick={() => onAnswer(i)}
                  className={clsx(
                    'flex min-h-12 items-center justify-between gap-2 rounded-xl border px-4 py-2 text-left text-sm font-semibold transition-colors',
                    !answered && 'border-line bg-card text-ink hover:border-primary',
                    answered && isAnswer && 'border-success-border bg-success-bg text-success-fg',
                    answered && isChosen && !isAnswer && 'border-danger-border bg-danger-bg text-danger-fg',
                    answered && !isAnswer && !isChosen && 'border-line text-muted',
                  )}
                >
                  <span>{pickTx(o, lng)}</span>
                  {answered && isAnswer && <CheckCircle2 className="size-4 shrink-0" aria-hidden />}
                  {answered && isChosen && !isAnswer && <XCircle className="size-4 shrink-0" aria-hidden />}
                </button>
              );
            })}
          </div>
          {answered && (
            <p className={clsx('mt-3 font-semibold', right ? 'text-success-fg' : 'text-danger-fg')} aria-live="polite">
              {right ? t('advent.quiz.right') : t('advent.quiz.wrong', { answer: pickTx(door.quiz.options[door.quiz.answer], lng) })}
            </p>
          )}
        </fieldset>
      )}

      {(!door.quiz || answered) && <p className="mt-4 leading-relaxed text-ink">{pickTx(door.text, lng)}</p>}

      {(door.link || door.source) && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          {door.link && (
            <Link to={door.link.to} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3.5 font-semibold text-link hover:bg-sunken">
              {toolKey ? t(`toolsPage.items.${toolKey}.title`) : t('advent.goOn')} <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
          {door.link?.glossary && (
            <Link to={`/glossary/${door.link.glossary}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3.5 font-semibold text-link hover:bg-sunken">
              <BookA className="size-4" aria-hidden /> {t('advent.glossary')}
            </Link>
          )}
          {door.source && (
            <a href={door.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
              {t('advent.source')}: {door.source.label} <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button type="button" className={buttonClass({ variant: 'outline' })} onClick={onCard}>
          <Download className="size-4" aria-hidden /> {t('advent.shareCard')}
        </button>
        <button type="button" className={buttonClass({ variant: 'ghost' })} onClick={onLink}>
          <Link2 className="size-4" aria-hidden /> {t('advent.shareLink')}
        </button>
      </div>
    </article>
  );
};

