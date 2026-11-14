import { useState, type InputHTMLAttributes } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { parsePhone, type PhoneCountry } from '@/lib/phone';

type Opts = {
  /** Country for local numbers ("0…"): "DE" for German employers; default reads Azerbaijani local numbers only. */
  country?: PhoneCountry | null;
  /** The value stored on the server: sent back unchanged it is accepted as it is (legacy values). */
  current?: string | null;
};

/** True when a typed phone number would be refused by the server (empty is fine: the field is optional). */
export const phoneInvalid = (value: string, { country, current }: Opts = {}) => {
  const v = value.trim();
  if (!v) return false;
  if (current != null && v === current.trim()) return false;
  return !parsePhone(v, { country }).ok;
};

export type PhoneInputProps = Opts &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
    id: string;
    value: string;
    onChange: (value: string) => void;
  };

/**
 * Phone field with the shared normaliser (lib/phone.ts, same rules as the server): on blur a readable
 * number is rewritten as +994501234567 / +4915112345678; one that cannot be read shows the friendly hint.
 * Pair with `phoneInvalid()` to disable the submit button.
 *
 *   <PhoneInput id="co-phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} country="DE" current={saved.phone} />
 */
export const PhoneInput = ({ id, value, onChange, country, current, className, onBlur, ...rest }: PhoneInputProps) => {
  const { t } = useTranslation();
  const [touched, setTouched] = useState(false);
  const invalid = touched && phoneInvalid(value, { country, current });
  const errId = `${id}-error`;
  return (
    <>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        maxLength={40}
        placeholder={country === 'DE' ? '+49 151 12345678' : '+994 50 123 45 67'}
        {...rest}
        className={clsx('input', invalid && 'border-danger', className)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          setTouched(true);
          const unchanged = current != null && value.trim() === current.trim();
          const r = parsePhone(value, { country });
          if (r.ok && r.value !== value && !unchanged) onChange(r.value);
          onBlur?.(e);
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errId : rest['aria-describedby']}
      />
      {invalid && (
        <p id={errId} className="mt-1 text-xs text-danger-fg" role="alert">
          {t('ui.phone.invalid')}
        </p>
      )}
    </>
  );
};
