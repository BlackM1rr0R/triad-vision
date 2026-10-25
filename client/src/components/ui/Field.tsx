import {
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useId,
  type AriaAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

type FieldCtx = { id: string; describedBy?: string; invalid: boolean; required: boolean };
const FieldContext = createContext<FieldCtx | null>(null);

/** Props a control inside <Field> should spread (Input / Select / Textarea do it automatically). */
export const useFieldControl = () => useContext(FieldContext);

export type FieldProps = {
  label: ReactNode;
  /** Help text under the control. */
  hint?: ReactNode;
  /** Error text; marks the control aria-invalid and links it via aria-describedby. */
  error?: ReactNode;
  required?: boolean;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  /** Right side of the label row (e.g. a character counter or a link). */
  labelAside?: ReactNode;
  /** Explicit id for the control (default: generated). */
  id?: string;
  className?: string;
  /** One control. Input/Select/Textarea pick up id / aria-* from context; any other element gets them cloned in. */
  children: ReactNode;
};

/**
 * Label + control + hint + error, wired for screen readers.
 *
 *   <Field label="E-mail" required error={errors.email}>
 *     <Input type="email" value={email} onChange={…} />
 *   </Field>
 */
export const Field = ({ label, hint, error, required = false, hideLabel = false, labelAside, id, className, children }: FieldProps) => {
  const { t } = useTranslation();
  const autoId = useId();
  const controlId = id ?? `f${autoId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const ctx: FieldCtx = { id: controlId, describedBy, invalid: !!error, required };

  // Plain elements (e.g. a raw <select className="input">) get the wiring cloned in.
  const control =
    isValidElement(children) && typeof children.type === 'string'
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          id: (children.props as { id?: string }).id ?? controlId,
          'aria-describedby': describedBy,
          'aria-invalid': error ? true : undefined,
          'aria-required': required || undefined,
        })
      : children;

  return (
    <FieldContext.Provider value={ctx}>
      <div className={clsx('min-w-0', className)}>
        <div className={clsx('flex items-baseline justify-between gap-2', hideLabel && 'sr-only')}>
          <label htmlFor={controlId} className="label">
            {label}
            {required && (
              <span className="ml-0.5 text-danger" aria-hidden>
                *
              </span>
            )}
            {required && <span className="sr-only"> ({t('ui.required')})</span>}
          </label>
          {labelAside && <div className="mb-1.5 text-xs text-muted">{labelAside}</div>}
        </div>
        {control}
        {hint && !error && (
          <p id={hintId} className="mt-1 text-xs text-muted">
            {hint}
          </p>
        )}
        {hint && error && (
          <p id={hintId} className="sr-only">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="mt-1 text-xs font-medium text-danger-fg" role="alert">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
};

const invalidRing = 'border-danger focus:border-danger focus:ring-danger/20';

const useWired = (props: { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: AriaAttributes['aria-invalid']; required?: boolean; invalid?: boolean }) => {
  const ctx = useFieldControl();
  const invalid = props.invalid ?? ctx?.invalid ?? false;
  return {
    id: props.id ?? ctx?.id,
    'aria-describedby': [props['aria-describedby'], ctx?.describedBy].filter(Boolean).join(' ') || undefined,
    'aria-invalid': props['aria-invalid'] ?? (invalid || undefined),
    required: props.required ?? (ctx?.required || undefined),
    invalid,
  };
};

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

/** `.input` text field; picks up id / aria-* from a surrounding <Field>. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid: invalidProp, ...rest }, ref) {
  const { invalid, ...wired } = useWired({ ...rest, invalid: invalidProp });
  return <input ref={ref} {...rest} {...wired} className={clsx('input', invalid && invalidRing, className)} />;
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, invalid: invalidProp, children, ...rest }, ref) {
  const { invalid, ...wired } = useWired({ ...rest, invalid: invalidProp });
  return (
    <select ref={ref} {...rest} {...wired} className={clsx('input', invalid && invalidRing, className)}>
      {children}
    </select>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, invalid: invalidProp, rows = 4, ...rest }, ref) {
  const { invalid, ...wired } = useWired({ ...rest, invalid: invalidProp });
  return <textarea ref={ref} rows={rows} {...rest} {...wired} className={clsx('input', invalid && invalidRing, className)} />;
});

/** Checkbox with its label on the right. */
export const Checkbox = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; hint?: ReactNode }>(function Checkbox(
  { label, hint, className, ...rest },
  ref,
) {
  return (
    <label className={clsx('flex min-h-6 cursor-pointer items-start gap-2.5 text-sm text-ink', rest.disabled && 'cursor-not-allowed opacity-60', className)}>
      <input ref={ref} type="checkbox" className="mt-0.5 size-[1.125rem] shrink-0 cursor-[inherit] rounded border-line-strong accent-brand-600" {...rest} />
      <span className="min-w-0">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
});

/** Radio button with its label on the right (group them in a <RadioGroup> or a <fieldset>). */
export const Radio = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; hint?: ReactNode }>(function Radio(
  { label, hint, className, ...rest },
  ref,
) {
  return (
    <label className={clsx('flex min-h-6 cursor-pointer items-start gap-2.5 text-sm text-ink', rest.disabled && 'cursor-not-allowed opacity-60', className)}>
      <input ref={ref} type="radio" className="mt-0.5 size-[1.125rem] shrink-0 cursor-[inherit] accent-brand-600" {...rest} />
      <span className="min-w-0">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
});

export type RadioGroupProps<V extends string> = {
  /** Group label (the fieldset legend). */
  label: ReactNode;
  name: string;
  value: V;
  onChange: (value: V) => void;
  options: { value: V; label: ReactNode; hint?: ReactNode; disabled?: boolean }[];
  hint?: ReactNode;
  error?: ReactNode;
  /** "column" (default) or "row" (wraps). */
  direction?: 'column' | 'row';
  hideLabel?: boolean;
  className?: string;
};

/** Labelled radio group (fieldset + legend), with hint / error like <Field>. */
export function RadioGroup<V extends string>({ label, name, value, onChange, options, hint, error, direction = 'column', hideLabel, className }: RadioGroupProps<V>) {
  const autoId = useId();
  const hintId = hint ? `rg${autoId}-hint` : undefined;
  const errorId = error ? `rg${autoId}-error` : undefined;
  return (
    <fieldset className={clsx('min-w-0', className)} aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined} aria-invalid={error ? true : undefined}>
      <legend className={clsx('label', hideLabel && 'sr-only')}>{label}</legend>
      <div className={clsx('flex gap-x-5 gap-y-2', direction === 'row' ? 'flex-wrap' : 'flex-col')}>
        {options.map((o) => (
          <Radio key={o.value} name={name} value={o.value} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} label={o.label} hint={o.hint} />
        ))}
      </div>
      {hint && (
        <p id={hintId} className={clsx('mt-1 text-xs text-muted', error && 'sr-only')}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs font-medium text-danger-fg" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
