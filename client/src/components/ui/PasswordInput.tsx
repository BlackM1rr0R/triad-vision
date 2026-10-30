import { forwardRef, useId, useState } from 'react';
import clsx from 'clsx';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input, useFieldControl, type InputProps } from './Field';

export type PasswordInputProps = Omit<InputProps, 'type'> & {
  /** Classes of the wrapper (put margins here, not on the input, so the eye button stays centred). */
  wrapperClassName?: string;
};

/**
 * Password field with a show / hide toggle (eye button, aria-pressed, localized label). Same props as <Input>;
 * picks up id / aria-* from a surrounding <Field>.
 *
 *   <Field label="Parol"><PasswordInput autoComplete="current-password" value={pw} onChange={…} /></Field>
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput({ wrapperClassName, className, id: idProp, disabled, ...rest }, ref) {
  const { t } = useTranslation();
  const ctx = useFieldControl();
  const autoId = useId();
  const id = idProp ?? ctx?.id ?? `pw${autoId}`;
  const [visible, setVisible] = useState(false);
  const label = visible ? t('ui.hidePassword') : t('ui.showPassword');
  return (
    <div className={clsx('relative', wrapperClassName)}>
      <Input
        ref={ref}
        {...rest}
        id={id}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        // no autocapitalize / spell check on the visible password
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={clsx('pr-11', className)}
      />
      <button
        type="button"
        className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        aria-pressed={visible}
        aria-controls={id}
        disabled={disabled}
        data-tooltip={label}
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
});
