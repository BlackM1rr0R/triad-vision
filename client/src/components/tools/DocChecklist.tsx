import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import clsx from 'clsx';
import { checklistKey, type DocKey, type Profession } from '@/lib/anerkennung/data';

const read = (id: string): DocKey[] => {
  try {
    const v = JSON.parse(localStorage.getItem(checklistKey(id)) ?? '[]');
    return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as DocKey[]) : [];
  } catch {
    return [];
  }
};

const write = (id: string, keys: DocKey[]) => {
  try {
    localStorage.setItem(checklistKey(id), JSON.stringify(keys));
  } catch {
    // Private mode / storage disabled: the checklist simply isn't remembered.
  }
};

/** Document checklist for one profession; ticks persist per profession in localStorage. Render with key={profession.id}. */
export const DocChecklist = ({ profession }: { profession: Profession }) => {
  const { t } = useTranslation();
  const [done, setDone] = useState<DocKey[]>(() => read(profession.id));

  const toggle = (k: DocKey) =>
    setDone((prev) => {
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      write(profession.id, next);
      return next;
    });

  const count = profession.docs.filter((d) => done.includes(d)).length;
  const total = profession.docs.length;

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface ring-1 ring-line" aria-hidden>
          <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${(count / total) * 100}%` }} />
        </div>
        <span className="text-xs font-semibold text-ink tabular-nums" aria-live="polite">
          {t('anerkPage.steps.progress', { done: count, total })}
        </span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {profession.docs.map((k) => {
          const checked = done.includes(k);
          return (
            <li key={k}>
              <label
                className={clsx(
                  'flex h-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500',
                  checked ? 'border-emerald-200 bg-emerald-50' : 'border-line bg-card hover:border-brand-200',
                )}
              >
                <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(k)} />
                <span
                  aria-hidden
                  className={clsx(
                    'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 transition-colors',
                    checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-line',
                  )}
                >
                  {checked && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                <span className={clsx('leading-snug', checked ? 'text-ink' : 'text-ink/85')}>
                  {t(`anerkPage.docs.${k}`, { level: profession.language ?? 'B1' })}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-muted">{t('anerkPage.steps.saved')}</p>
    </div>
  );
};
