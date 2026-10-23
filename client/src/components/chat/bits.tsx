import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Popover } from '@/components/tasks/bits';
import { Modal as UiModal } from '@/components/ui/Modal';
import type { Person } from './types';
import { EMOJIS, avatarTone, fullName, initials } from './utils';

export const Avatar = ({ person, size = 'md', className }: { person: Person | null | undefined; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) => (
  <span
    title={fullName(person)}
    className={clsx(
      'inline-grid shrink-0 place-items-center rounded-full font-bold select-none',
      person ? avatarTone(person.id) : 'bg-slate-200 text-slate-600',
      { xs: 'size-5 text-[0.55rem]', sm: 'size-6 text-[0.6rem]', md: 'size-8 text-[0.7rem]', lg: 'size-9 text-xs' }[size],
      className,
    )}
  >
    {initials(person)}
  </span>
);

/** 24 common emojis in a popover anchored to the trigger (the popover's parent). */
export const EmojiPicker = ({ open, onClose, onPick, align = 'left' }: { open: boolean; onClose: () => void; onPick: (emoji: string) => void; align?: 'left' | 'right' }) => (
  <Popover open={open} onClose={onClose} align={align} className="w-64">
    <div className="grid grid-cols-8 gap-0.5">
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => {
            onPick(e);
            onClose();
          }}
          className="grid size-7 place-items-center rounded-md text-lg leading-none hover:bg-surface"
          aria-label={e}
        >
          {e}
        </button>
      ))}
    </div>
  </Popover>
);

/** Centered modal (full screen on phones): adapter over the design-system Modal. Escape closes only this layer. */
export const Modal = ({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) => {
  const { t } = useTranslation();
  return (
    <UiModal open={open} onClose={onClose} title={title} footer={footer} size={({ sm: 'sm', md: 'lg', lg: 'xl' } as const)[size]} mobile="full" align="top" zIndex={70} closeLabel={t('chat.actions.close')}>
      {children}
    </UiModal>
  );
};

// TODO(ui): Field wraps the control in a <label>; migrate to components/ui/Field once callers pass ids.
export const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="block">
    <span className="label">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
  </label>
);
