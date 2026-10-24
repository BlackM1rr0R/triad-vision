import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, Pencil } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesAdminUx } from '@/i18n/pagesAdminUx';
import type { Viewer } from './usePresence';

registerCopy(pagesAdminUx);

const TONES = ['bg-brand-600', 'bg-violet-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-sky-600'];
const toneOf = (id: string) => TONES[[...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % TONES.length];
const initials = (v: Viewer) => `${v.firstName[0] ?? ''}${v.lastName[0] ?? ''}`.toUpperCase() || '?';

/** Section name for "is editing …" (falls back to a generic phrase for sections without copy). */
export const useSectionLabel = () => {
  const { t } = useTranslation();
  return (section: string | null) => (section ? t(`ux.presence.sections.${section}`, { defaultValue: t('ux.presence.sections.generic') }) : '');
};

/**
 * Stacked avatars of the other staff members on this record. Each avatar is focusable and carries its
 * "… is viewing / editing" text as tooltip + accessible name; an editing viewer gets a pencil badge.
 */
export const PresenceAvatars = ({ viewers, max = 4, className }: { viewers: Viewer[]; max?: number; className?: string }) => {
  const { t } = useTranslation();
  const section = useSectionLabel();
  if (!viewers.length) return null;
  const shown = viewers.slice(0, max);
  const rest = viewers.length - shown.length;
  const text = (v: Viewer) =>
    v.editing ? t('ux.presence.editing', { name: v.firstName, section: section(v.editing) }) : t('ux.presence.viewing', { name: v.firstName });
  return (
    <div className={clsx('flex items-center', className)} role="group" aria-label={t('ux.presence.label', { count: viewers.length })}>
      <ul className="flex -space-x-2">
        {shown.map((v) => (
          <li key={v.userId} className="group/av relative">
            <span
              tabIndex={0}
              role="img"
              aria-label={text(v)}
              className={clsx(
                'relative grid size-8 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-card outline-none focus-visible:ring-brand-500',
                toneOf(v.userId),
              )}
            >
              <span aria-hidden>{initials(v)}</span>
              {v.editing && (
                <span className="absolute -right-0.5 -bottom-0.5 grid size-3.5 place-items-center rounded-full bg-amber-500 ring-2 ring-card" aria-hidden>
                  <Pencil className="size-2 text-white" />
                </span>
              )}
            </span>
            <span
              role="tooltip"
              className="pointer-events-none absolute top-full right-0 z-[130] mt-1.5 w-max max-w-64 rounded-md bg-navy-950 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-focus-within/av:opacity-100 group-hover/av:opacity-100"
            >
              {text(v)}
            </span>
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <span className="ml-1 rounded-full bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-muted">
          <span aria-hidden>+{rest}</span>
          <span className="sr-only">{t('ux.presence.more', { count: rest })}</span>
        </span>
      )}
      <span className="sr-only" aria-live="polite">
        {viewers.map(text).join('. ')}
      </span>
    </div>
  );
};

/** Soft warning while someone else has an edit form of this record open. */
export const EditingBanner = ({ editors, className }: { editors: Viewer[]; className?: string }) => {
  const { t } = useTranslation();
  const section = useSectionLabel();
  if (!editors.length) return null;
  const first = editors[0];
  return (
    <div role="status" className={clsx('flex items-start gap-2.5 rounded-xl border border-warning-border bg-warning-bg px-4 py-2.5 text-sm text-warning-fg', className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        {editors.length === 1
          ? t('ux.presence.banner', { name: `${first.firstName} ${first.lastName}`.trim(), section: section(first.editing) })
          : t('ux.presence.bannerMany', { names: editors.map((e) => e.firstName).join(', ') })}
      </p>
    </div>
  );
};
