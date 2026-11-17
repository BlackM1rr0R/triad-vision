import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Award, BookOpen, ChevronRight, FileCheck, Flame, GraduationCap, Library, Lock, Medal, PenLine, PlaneLanding, Sparkles, Stamp, Trophy, Upload, UserCheck } from 'lucide-react';
import { api, getImpersonation } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { celebrate } from '@/components/motion/celebrate';
import { registerCopy } from '@/i18n';
import { pagesGermanyDay } from '@/i18n/pagesGermanyDay';
import { pagesGermanyReady } from '@/i18n/pagesGermanyReady'; // Germany Ready / weekly challenge badge labels
import { BADGES_KEY, useBadges, type ClientBadge } from '@/lib/germanyDay';

registerCopy(pagesGermanyDay);
registerCopy(pagesGermanyReady);

const ICON: Record<string, LucideIcon> = {
  PROFILE_COMPLETE: UserCheck,
  DOCS_UPLOADED: Upload,
  DOCS_ACCEPTED: FileCheck,
  CONTRACT_SIGNED: PenLine,
  VISA_APPROVED: Stamp,
  ARRIVED: PlaneLanding,
  STREAK_7: Flame,
  STREAK_30: Flame,
  WORDS_100: BookOpen,
  WORDS_500: Library,
  LEVEL_A1: GraduationCap,
  LEVEL_A2: GraduationCap,
  LEVEL_B1: GraduationCap,
  LEVEL_B2: GraduationCap,
  GERMANY_READY: Medal,
  CHALLENGE_1: Trophy,
  CHALLENGE_5: Trophy,
};

/** Fresh badges already celebrated in this tab (several panels may be mounted; one burst per badge). */
const celebrated = new Set<string>();

const BadgeTile = ({ b, compact }: { b: ClientBadge; compact?: boolean }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const Icon = ICON[b.key] ?? Award;
  const title = t(`badges.k.${b.key}.t`);
  return (
    <li
      className={clsx('flex items-start gap-3 rounded-2xl border p-3', b.earned ? 'border-success-border bg-success-bg' : 'border-line bg-sunken/40')}
      aria-label={`${title}: ${b.earned && b.earnedAt ? t('badges.earnedAt', { date: date(b.earnedAt) }) : t('badges.locked')}`}
    >
      <span className={clsx('relative grid size-11 shrink-0 place-items-center rounded-full', b.earned ? 'bg-success text-white' : 'bg-sunken text-muted')}>
        <Icon className="size-5" aria-hidden />
        {!b.earned && <Lock className="absolute -right-0.5 -bottom-0.5 size-4 rounded-full bg-surface p-0.5 text-muted" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={clsx('text-sm font-semibold', b.earned ? 'text-ink' : 'text-muted')}>{title}</p>
        {!compact && <p className="text-xs text-muted">{t(`badges.k.${b.key}.d`)}</p>}
        {b.earned && b.earnedAt && <p className="mt-0.5 text-xs text-success-fg">{t('badges.earnedAt', { date: date(b.earnedAt) })}</p>}
        {!b.earned && b.progress && (
          <div className="mt-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((b.progress.value / b.progress.goal) * 100)}%` }} />
            </div>
            <p className="mt-0.5 text-[11px] text-muted tabular-nums">{t('badges.progress', b.progress)}</p>
          </div>
        )}
      </div>
    </li>
  );
};

/**
 * Badges (achievements) of the client: unlocked with the date, locked with what to do (and progress for counters).
 * New badges get a small celebration (a short confetti burst — none with reduced motion — and a "New badge!" note
 * read by screen readers); the server is told they were seen. Staff viewing as the client never use them up.
 * Private: no leaderboard, nothing about other clients.
 *   compact — portal home: count, the newest earned ones and a link to the full page
 *   group   — only one group (the German page shows the German badges)
 */
export const BadgesPanel = ({ compact = false, group, className }: { compact?: boolean; group?: ClientBadge['group']; className?: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useBadges();
  const ref = useRef<HTMLDivElement>(null);
  const [fresh, setFresh] = useState<string[]>([]);

  const freshKeys = (data?.badges ?? []).filter((b) => b.fresh && (!group || b.group === group)).map((b) => b.key);
  const freshSig = freshKeys.join(',');
  useEffect(() => {
    if (!freshSig || getImpersonation() !== null) return;
    const keys = freshSig.split(',').filter((k) => !celebrated.has(k));
    if (!keys.length) return;
    keys.forEach((k) => celebrated.add(k));
    setFresh(keys);
    const timer = window.setTimeout(() => celebrate({ origin: ref.current, count: 50 }), 250);
    void api
      .post('/account/germany/badges/seen', { keys })
      .then(() => qc.invalidateQueries({ queryKey: [BADGES_KEY] }))
      .catch(() => undefined);
    return () => window.clearTimeout(timer);
  }, [freshSig, qc]);

  if (!data) return null;
  const list = data.badges.filter((b) => !group || b.group === group);
  const earned = list.filter((b) => b.earned);
  const shown = compact ? [...earned].sort((a, b) => (b.earnedAt ?? '').localeCompare(a.earnedAt ?? '')).slice(0, 3) : list;
  const next = compact ? list.find((b) => !b.earned && b.progress) ?? list.find((b) => !b.earned) : null;
  const groups = group || compact ? [null] : (['journey', 'german'] as const);

  return (
    <section ref={ref} className={clsx('card p-5 sm:p-6', className)} aria-labelledby={`badges-title-${group ?? 'all'}-${compact ? 'c' : 'f'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-sage">
          <Award className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`badges-title-${group ?? 'all'}-${compact ? 'c' : 'f'}`} className="font-display text-lg font-bold text-ink">
            {group ? t(`badges.groups.${group}`) + ' · ' + t('badges.title') : t('badges.title')}
          </h2>
          <p className="text-sm text-muted">{t('badges.earned', { earned: earned.length, total: list.length })}</p>
        </div>
        {compact && (
          <Link to="/account/badges" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link hover:underline">
            {t('badges.all')} <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>

      <div aria-live="polite">
        {fresh.length > 0 && (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-highlight/15 p-3 text-sm font-semibold text-ink motion-safe:animate-[pulse_1.2s_ease-in-out_2]">
            <Sparkles className="size-5 text-highlight" aria-hidden />
            {fresh.length === 1 ? `${t('badges.newOne')} ${t(`badges.k.${fresh[0]}.t`)}` : t('badges.newMany', { count: fresh.length })}
          </p>
        )}
      </div>

      {!compact && !group && <p className="mt-2 text-sm text-muted">{t('badges.subtitle')}</p>}
      {group === 'german' && data.streak > 0 && <p className="mt-2 text-sm text-muted">{t('badges.streak', { count: data.streak })}</p>}

      {groups.map((g) => {
        const items = g ? shown.filter((b) => b.group === g) : shown;
        if (!items.length) return null;
        return (
          <div key={g ?? 'all'} className="mt-4">
            {g && <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{t(`badges.groups.${g}`)}</h3>}
            <ul className={clsx('grid grid-cols-1 gap-2', compact ? 'sm:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-3')}>
              {items.map((b) => (
                <BadgeTile key={b.key} b={fresh.includes(b.key) ? { ...b, fresh: true } : b} compact={compact} />
              ))}
            </ul>
          </div>
        );
      })}
      {compact && next && (
        <ul className="mt-2 grid grid-cols-1">
          <BadgeTile b={next} compact />
        </ul>
      )}
    </section>
  );
};

export default BadgesPanel;
