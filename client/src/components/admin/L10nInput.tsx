import { useId, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import type { L10n, L10nList } from '@/lib/types';

export const LANGS = ['az', 'de', 'en', 'ru'] as const;
export type Lang = (typeof LANGS)[number];

const LANG_META: Record<Lang, { short: string; tone: string }> = {
  az: { short: 'AZ', tone: 'bg-az-blue/15 text-[#0089ab]' },
  de: { short: 'DE', tone: 'bg-de-gold/25 text-[#8a6d00]' },
  en: { short: 'EN', tone: 'bg-brand-100 text-brand-700' },
  ru: { short: 'RU', tone: 'bg-red-100 text-red-700' },
};

export const emptyL10n = (): L10n => ({ az: '', de: '', en: '', ru: '' });
export const emptyL10nList = (): L10nList => ({ az: [], de: [], en: [], ru: [] });

/** Copy the Azerbaijani text into every language left empty. */
export const fillFromAz = (v: L10n): L10n => ({
  az: v.az.trim(),
  de: v.de.trim() || v.az.trim(),
  en: v.en.trim() || v.az.trim(),
  ru: v.ru.trim() || v.az.trim(),
});

export const fillListFromAz = (v: L10nList): L10nList => ({
  az: v.az,
  de: v.de.length ? v.de : v.az,
  en: v.en.length ? v.en : v.az,
  ru: v.ru.length ? v.ru : v.az,
});

export const LangTag = ({ lang }: { lang: Lang }) => (
  <span className={clsx('inline-flex w-7 justify-center rounded px-1 py-0.5 text-[10px] font-bold tracking-wide', LANG_META[lang].tone)}>
    {LANG_META[lang].short}
  </span>
);

const Tabs = ({
  active,
  onChange,
  filled,
  id,
}: {
  active: Lang;
  onChange: (l: Lang) => void;
  filled: Record<Lang, boolean>;
  id: string;
}) => {
  const { t } = useTranslation();
  return (
    <div role="tablist" className="flex gap-1 rounded-lg bg-surface p-0.5">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          role="tab"
          id={`${id}-tab-${l}`}
          aria-selected={active === l}
          aria-controls={`${id}-panel`}
          title={t(`admin.l10n.lang.${l}`)}
          onClick={() => onChange(l)}
          className={clsx(
            'relative min-h-8 rounded-md px-2.5 py-1 text-[11px] font-bold tracking-wide transition',
            active === l ? 'bg-white text-navy-900 shadow-sm' : 'text-muted hover:text-navy-900',
          )}
        >
          {LANG_META[l].short}
          {!filled[l] && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-warning" aria-label={t('admin.l10n.empty')} />}
        </button>
      ))}
    </div>
  );
};

/** Text (or textarea) in four languages, switched with tabs. */
export const L10nInput = ({
  label,
  value,
  onChange,
  multiline = false,
  rows = 4,
  required = false,
  hint,
}: {
  label: string;
  value: L10n;
  onChange: (v: L10n) => void;
  multiline?: boolean;
  rows?: number;
  required?: boolean;
  hint?: string;
}) => {
  const { t } = useTranslation();
  const id = useId();
  const [lang, setLang] = useState<Lang>('az');
  const filled = { az: !!value.az.trim(), de: !!value.de.trim(), en: !!value.en.trim(), ru: !!value.ru.trim() };
  const common = {
    id: `${id}-panel`,
    'aria-labelledby': `${id}-label ${id}-tab-${lang}`,
    className: 'input',
    value: value[lang],
    required: required && lang === 'az',
    placeholder: lang === 'az' ? '' : value.az ? t('admin.l10n.fallbackPlaceholder') : '',
  };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span id={`${id}-label`} className="text-xs font-semibold text-ink/80">
          {label}
          {required && <span className="text-danger"> *</span>}
        </span>
        <Tabs active={lang} onChange={setLang} filled={filled} id={id} />
      </div>
      {multiline ? (
        <textarea {...common} rows={rows} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} />
      ) : (
        <input {...common} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} />
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
};

/** List of strings in four languages; one item per line. */
export const L10nListInput = ({
  label,
  value,
  onChange,
  rows = 5,
}: {
  label: string;
  value: L10nList;
  onChange: (v: L10nList) => void;
  rows?: number;
}) => {
  const { t } = useTranslation();
  const id = useId();
  const [lang, setLang] = useState<Lang>('az');
  // Keep raw text per language so blank lines don't vanish while typing.
  const [raw, setRaw] = useState<Record<Lang, string>>(() => ({
    az: value.az.join('\n'),
    de: value.de.join('\n'),
    en: value.en.join('\n'),
    ru: value.ru.join('\n'),
  }));
  const filled = { az: value.az.length > 0, de: value.de.length > 0, en: value.en.length > 0, ru: value.ru.length > 0 };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span id={`${id}-label`} className="text-xs font-semibold text-ink/80">
          {label}
        </span>
        <Tabs active={lang} onChange={setLang} filled={filled} id={id} />
      </div>
      <textarea
        id={`${id}-panel`}
        aria-labelledby={`${id}-label ${id}-tab-${lang}`}
        className="input font-mono text-[13px]"
        rows={rows}
        value={raw[lang]}
        onChange={(e) => {
          const text = e.target.value;
          setRaw((r) => ({ ...r, [lang]: text }));
          onChange({
            ...value,
            [lang]: text
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
          });
        }}
      />
      <p className="mt-1 text-xs text-muted">{t('admin.l10n.listHint')}</p>
    </div>
  );
};
