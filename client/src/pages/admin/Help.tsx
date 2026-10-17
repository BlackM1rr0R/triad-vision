import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ChevronRight, LifeBuoy, Search } from 'lucide-react';
import { usePageTitle } from '@/lib/usePageTitle';
import { HelpGuide } from '@/components/admin/help/HelpGuide';
import { HELP_GROUPS, HELP_KEYS, type HelpKey } from '@/components/admin/help/helpKeys';
import { registerHelpCopy } from '@/components/admin/help/registerHelp';

registerHelpCopy();

/** Help centre: every admin guide in one place, grouped like the menu, with a search box. */
export default function AdminHelp() {
  const { t } = useTranslation();
  usePageTitle(t('adminHelpUi.centerTitle'));
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const selected = (HELP_KEYS as readonly string[]).includes(params.get('g') ?? '') ? (params.get('g') as HelpKey) : 'general';

  /** Search matches the title, summary, steps and tips in the current language. */
  const haystack = (k: HelpKey) => {
    const parts = [t(`adminHelp.${k}.title`), t(`adminHelp.${k}.summary`)];
    for (const field of ['steps', 'tips']) {
      const v = t(`adminHelp.${k}.${field}`, { returnObjects: true });
      if (Array.isArray(v)) parts.push(...v.map(String));
    }
    return parts.join(' ').toLowerCase();
  };
  const needle = q.trim().toLowerCase();
  const groups = useMemo(
    () => HELP_GROUPS.map((g) => ({ ...g, keys: needle ? g.keys.filter((k) => haystack(k).includes(needle)) : g.keys })).filter((g) => g.keys.length),
    [needle, t], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
          <LifeBuoy className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">{t('adminHelpUi.centerTitle')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('adminHelpUi.centerIntro')}</p>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <label className="relative mb-3 block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('adminHelpUi.search')} className="input !pl-9" />
          </label>
          <nav className="max-h-[70vh] space-y-4 overflow-y-auto rounded-xl border border-line bg-card p-2">
            {groups.map((g) => (
              <div key={g.id}>
                <p className="px-2 pt-1 pb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">{t(`adminHelpUi.groups.${g.id}`)}</p>
                <ul>
                  {g.keys.map((k) => (
                    <li key={k}>
                      <button
                        type="button"
                        onClick={() => setParams({ g: k }, { replace: true })}
                        className={clsx(
                          'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm',
                          selected === k ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink hover:bg-surface',
                        )}
                      >
                        <span className="truncate">{t(`adminHelp.${k}.title`, { defaultValue: k })}</span>
                        <ChevronRight className="size-3.5 shrink-0 opacity-50" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!groups.length && <p className="px-2 py-3 text-sm text-muted">{t('adminHelpUi.nothing')}</p>}
          </nav>
        </aside>
        <article className="card p-5 sm:p-7">
          <HelpGuide helpKey={selected} />
        </article>
      </div>
    </div>
  );
}
