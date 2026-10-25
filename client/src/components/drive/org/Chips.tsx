import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Lock } from 'lucide-react';
import type { DriveItem, TagRef } from '../types';
import { TAG_TONE } from './api';

/** Coloured tag chips of an item (tiles, rows, board cards). `max` limits how many are shown. */
export const TagChips = ({ tags, max = 3, className }: { tags: TagRef[] | undefined; max?: number; className?: string }) => {
  if (!tags?.length) return null;
  const shown = tags.slice(0, max);
  const rest = tags.length - shown.length;
  return (
    <span className={clsx('inline-flex min-w-0 flex-wrap items-center gap-0.5', className)}>
      {shown.map((t) => (
        <span key={t.id} className={clsx('max-w-[8rem] truncate rounded px-1 py-px text-[10px] leading-tight font-semibold', TAG_TONE[t.color] ?? TAG_TONE.slate)} title={t.name}>
          {t.name}
        </span>
      ))}
      {rest > 0 && (
        <span className="rounded bg-sunken px-1 py-px text-[10px] font-semibold text-muted" title={tags.slice(max).map((t) => t.name).join(', ')}>
          +{rest}
        </span>
      )}
    </span>
  );
};

/** "Final" badge (lock icon): the file can no longer be changed. */
export const FinalBadge = ({ item, compact }: { item: Pick<DriveItem, 'finalAt'>; compact?: boolean }) => {
  const { t } = useTranslation();
  if (!item.finalAt) return null;
  return (
    <span
      title={t('driveOrg.final.badgeHint')}
      className="inline-flex shrink-0 items-center gap-0.5 rounded bg-muted px-1 py-px text-[10px] font-bold text-white dark:bg-slate-200 dark:text-slate-900"
    >
      <Lock className="size-2.5" aria-hidden />
      {!compact && t('driveOrg.final.badge')}
    </span>
  );
};

/** Tags + Final in one line (used by ItemsView). */
export const OrgBadges = ({ item, compact }: { item: DriveItem; compact?: boolean }) => {
  if (!item.finalAt && !item.tags?.length) return null;
  return (
    <>
      <FinalBadge item={item} compact={compact} />
      <TagChips tags={item.tags} max={compact ? 2 : 3} />
    </>
  );
};
