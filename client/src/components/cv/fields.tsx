import { useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertCircle, ArrowDown, ArrowUp, Check, CloudOff, Loader2, Plus, Trash2, X, type LucideIcon } from 'lucide-react';
import type { CvTemplate } from './types';

// ─── Month picker (month + year selects; <input type="month"> is missing in some browsers) ────────

const MONTH_NUMBERS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

export const MonthPicker = ({
  value,
  onChange,
  label,
  disabled,
  optional,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label: string;
  disabled?: boolean;
  optional?: boolean;
}) => {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [year, month] = value ? [value.slice(0, 4), value.slice(5, 7)] : ['', ''];
  // Partial input (only month or only year) is kept locally until both are chosen.
  const [draft, setDraft] = useState<{ y: string; m: string }>({ y: year, m: month });
  const y = value ? year : draft.y;
  const m = value ? month : draft.m;
  const now = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: now - 1955 + 1 }, (_, i) => String(now - i)), [now]);
  const monthName = (mm: string) => new Intl.DateTimeFormat(i18n.language, { month: 'short' }).format(new Date(2020, Number(mm) - 1, 1));
  const set = (ny: string, nm: string) => {
    setDraft({ y: ny, m: nm });
    onChange(ny && nm ? `${ny}-${nm}` : null);
  };
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="label">{label}</legend>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`${id}-m`}>
          {label}: {t('cvb.fields.month')}
        </label>
        <select id={`${id}-m`} className="input min-w-0 flex-1 px-2" value={m} onChange={(e) => set(y, e.target.value)}>
          <option value="">{optional ? '—' : t('cvb.fields.month')}</option>
          {MONTH_NUMBERS.map((mm) => (
            <option key={mm} value={mm}>
              {mm} · {monthName(mm)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`${id}-y`}>
          {label}: {t('cvb.fields.year')}
        </label>
        <select id={`${id}-y`} className="input w-24 shrink-0 px-2" value={y} onChange={(e) => set(e.target.value, m)}>
          <option value="">{optional ? '—' : t('cvb.fields.year')}</option>
          {years.map((yy) => (
            <option key={yy} value={yy}>
              {yy}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
};

// ─── Text input with label ───────────────────────────────────────────────

export const TextField = ({
  label,
  value,
  onChange,
  max,
  placeholder,
  className,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
  className?: string;
  required?: boolean;
}) => {
  const id = useId();
  return (
    <div className={clsx('min-w-0', className)}>
      <label htmlFor={id} className="label">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <input id={id} className="input" value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
};

// ─── Tag list (skills, interests, licences) ──────────────────────────────

export const TagInput = ({
  values,
  onChange,
  max,
  maxLength,
  placeholder,
  label,
  upper,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  max: number;
  maxLength: number;
  placeholder: string;
  label: string;
  upper?: boolean;
}) => {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState('');
  const add = () => {
    const parts = text
      .split(/[,;\n]/)
      .map((s) => (upper ? s.trim().toUpperCase() : s.trim()))
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p.slice(0, maxLength));
    onChange(next);
    setText('');
  };
  return (
    <div>
      {values.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {values.map((v, i) => (
            <li key={`${v}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-1 pr-1 pl-3 text-sm text-ink">
              {v}
              <button
                type="button"
                className="grid size-6 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"
                aria-label={`${t('cvb.actions.remove')}: ${v}`}
                onClick={() => onChange(values.filter((_, j) => j !== i))}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {values.length < max && (
        <div className="flex gap-2">
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <input
            id={id}
            className="input min-w-0 flex-1"
            value={text}
            maxLength={maxLength * 4}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
          />
          <button type="button" className="btn-ghost btn-sm shrink-0" onClick={add} disabled={!text.trim()}>
            <Plus className="size-4" aria-hidden /> {t('cvb.add.item')}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Section card + entry toolbar ────────────────────────────────────────

export const SectionCard = ({ title, icon: Icon, hint, count, children, action }: { title: string; icon: LucideIcon; hint?: string; count?: number; children: ReactNode; action?: ReactNode }) => (
  <section className="card card-pad" aria-label={title}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 className="flex items-center gap-2.5 text-lg font-bold text-ink">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="size-4.5" aria-hidden />
        </span>
        {title}
        {count != null && count > 0 && <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted tabular-nums">{count}</span>}
      </h2>
      {action}
    </div>
    {hint && <p className="mt-2 text-sm leading-relaxed text-muted">{hint}</p>}
    <div className="mt-5">{children}</div>
  </section>
);

export const EntryToolbar = ({ index, count, onMove, onRemove, label }: { index: number; count: number; onMove: (to: number) => void; onRemove: () => void; label: string }) => {
  const { t } = useTranslation();
  const btn = 'grid size-9 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button type="button" className={btn} disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`${t('cvb.actions.up')}: ${label}`} title={t('cvb.actions.up')}>
        <ArrowUp className="size-4" aria-hidden />
      </button>
      <button type="button" className={btn} disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={`${t('cvb.actions.down')}: ${label}`} title={t('cvb.actions.down')}>
        <ArrowDown className="size-4" aria-hidden />
      </button>
      <button type="button" className={clsx(btn, 'hover:bg-danger/10 hover:text-danger')} onClick={onRemove} aria-label={`${t('cvb.actions.remove')}: ${label}`} title={t('cvb.actions.remove')}>
        <Trash2 className="size-4" aria-hidden />
      </button>
    </div>
  );
};

export const moveItem = <T,>(list: T[], from: number, to: number) => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

// ─── Save indicator ──────────────────────────────────────────────────────

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export const SaveIndicator = ({ state, onRetry }: { state: SaveState; onRetry?: () => void }) => {
  const { t } = useTranslation();
  if (state === 'idle') return null;
  const map = {
    dirty: { icon: AlertCircle, text: t('cvb.status.dirty'), cls: 'text-muted' },
    saving: { icon: Loader2, text: t('cvb.status.saving'), cls: 'text-muted' },
    saved: { icon: Check, text: t('cvb.status.saved'), cls: 'text-emerald-600' },
    error: { icon: CloudOff, text: t('cvb.status.error'), cls: 'text-danger' },
  } as const;
  const { icon: Icon, text, cls } = map[state];
  return (
    <span role="status" aria-live="polite" className={clsx('inline-flex items-center gap-1.5 text-xs font-semibold', cls)}>
      <Icon className={clsx('size-3.5', state === 'saving' && 'animate-spin')} aria-hidden />
      {text}
      {state === 'error' && onRetry && (
        <button type="button" className="underline underline-offset-2" onClick={onRetry}>
          {t('cvb.status.retry')}
        </button>
      )}
    </span>
  );
};

// ─── Template mini preview ───────────────────────────────────────────────

const Bar = ({ w, className }: { w: string; className?: string }) => <span className={clsx('block h-1 rounded-full bg-line', className)} style={{ width: w }} />;

export const TemplatePreview = ({ template }: { template: CvTemplate }) =>
  template === 'europass' ? (
    <div className="flex aspect-[1/1.414] w-full overflow-hidden rounded-md border border-line bg-card" aria-hidden>
      <div className="w-[34%] space-y-1.5 bg-brand-50 p-1.5">
        <span className="mx-auto block aspect-[3/4] w-3/5 rounded-sm bg-brand-200" />
        <Bar w="90%" className="bg-brand-400" />
        <Bar w="70%" />
        <Bar w="80%" />
        <Bar w="60%" />
      </div>
      <div className="flex-1 space-y-1.5 p-1.5">
        <Bar w="50%" className="bg-brand-500" />
        <Bar w="95%" />
        <Bar w="85%" />
        <Bar w="40%" className="mt-2 bg-brand-500" />
        <Bar w="90%" />
        <Bar w="75%" />
        <div className="mt-2 grid grid-cols-5 gap-0.5">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="h-1.5 rounded-[1px] bg-brand-100" />
          ))}
        </div>
      </div>
    </div>
  ) : (
    <div className="aspect-[1/1.414] w-full space-y-1.5 overflow-hidden rounded-md border border-line bg-card p-2" aria-hidden>
      <div className="flex items-start justify-between">
        <Bar w="45%" className="h-1.5 bg-brand-600" />
        <span className="block aspect-[3/4] w-[18%] rounded-sm bg-brand-100" />
      </div>
      <Bar w="35%" className="bg-brand-500" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-1.5">
          <Bar w="22%" />
          <Bar w="55%" />
        </div>
      ))}
      <Bar w="35%" className="mt-2 bg-brand-500" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-1.5">
          <Bar w="22%" />
          <Bar w={`${70 - i * 8}%`} />
        </div>
      ))}
    </div>
  );

// ─── Switch ──────────────────────────────────────────────────────────────

export const Switch = ({ checked, onChange, labelledBy, describedBy }: { checked: boolean; onChange: (v: boolean) => void; labelledBy: string; describedBy?: string }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
    onClick={() => onChange(!checked)}
    className={clsx('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-line')}
  >
    <span className={clsx('inline-block size-5 rounded-full bg-white shadow transition-transform duration-200', checked ? 'translate-x-6' : 'translate-x-1')} aria-hidden />
  </button>
);
