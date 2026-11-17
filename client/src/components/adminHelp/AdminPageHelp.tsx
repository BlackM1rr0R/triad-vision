import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpenText, CircleHelp, LifeBuoy } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { adminSimpleCopy } from '@/i18n/adminSimple';
import { adminHelpFor, helpLocale, kbHrefFor, loadAdminHelp, type PageHelpEntry } from '@/lib/adminHelp/registry';
import { helpKeyFor } from '@/components/admin/help/helpKeys';
import { useStaffNav } from '@/components/command/navPrefs';

registerCopy(adminSimpleCopy);

/**
 * "?" next to the page title in the admin header: a side panel with what the current page is for, three
 * steps, tips and a link to the page's Knowledge Base article (lib/adminHelp/registry.ts; texts shared with the
 * server KB seed). The texts are fetched the first time the panel opens (or on hover / focus of the button).
 */
export const AdminPageHelp = () => {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const { isModuleOn } = useStaffNav();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<PageHelpEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setFailed(false);
    void loadAdminHelp()
      .then(setEntries)
      .catch(() => setFailed(true));
  };
  useEffect(() => {
    if (open && !entries) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => setOpen(false), [pathname]);

  const entry = entries ? adminHelpFor(pathname, entries) : undefined;
  const text = entry?.text[helpLocale(i18n.language)];
  const guideKey = helpKeyFor(pathname);
  const kbOn = isModuleOn('knowledgeBase');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={() => void loadAdminHelp().catch(() => undefined)}
        onFocus={() => void loadAdminHelp().catch(() => undefined)}
        className="grid size-7 shrink-0 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink focus-visible:text-ink"
        aria-label={t('apHelp.button')}
        title={t('apHelp.button')}
        aria-haspopup="dialog"
        data-tour="admin-page-help"
      >
        <CircleHelp className="size-4" aria-hidden />
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width="sm"
        title={
          <span className="flex items-center gap-2">
            <CircleHelp className="size-4 text-link" aria-hidden /> {text?.title ?? t('apHelp.title')}
          </span>
        }
        description={text ? t('apHelp.title') : undefined}
        footer={
          entry ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {kbOn ? (
                <Link to={kbHrefFor(entry.route)} onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:underline">
                  <BookOpenText className="size-4" aria-hidden /> {t('apHelp.kb')} →
                </Link>
              ) : (
                <span />
              )}
              {guideKey !== 'general' && (
                <Link to="/admin/help" onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink/80 hover:text-ink hover:underline">
                  <LifeBuoy className="size-4" aria-hidden /> {t('apHelp.guide')}
                </Link>
              )}
            </div>
          ) : undefined
        }
      >
        {failed ? (
          <div className="space-y-3 text-sm" role="alert">
            <p>{t('apHelp.error')}</p>
            <button type="button" onClick={load} className="rounded-lg border border-line px-3 py-1.5 font-semibold hover:bg-sunken">
              {t('apHelp.retry')}
            </button>
          </div>
        ) : !entries ? (
          <div className="grid min-h-40 place-items-center text-link" role="status" aria-label={t('ui.loading')}>
            <Spinner className="size-6" />
          </div>
        ) : !text ? (
          <p className="text-sm text-muted">{t('apHelp.missing')}</p>
        ) : (
          <div className="space-y-5 text-sm leading-relaxed text-ink">
            <section>
              <h3 className="type-overline mb-1.5">{t('apHelp.purpose')}</h3>
              <p>{text.purpose}</p>
            </section>
            <section>
              <h3 className="type-overline mb-1.5">{t('apHelp.how')}</h3>
              <ol className="space-y-2">
                {text.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sunken text-xs font-semibold tabular-nums ring-1 ring-line" aria-hidden>
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
            </section>
            {text.tips.length > 0 && (
              <section>
                <h3 className="type-overline mb-1.5">{t('apHelp.tips')}</h3>
                <ul className="list-disc space-y-1.5 pl-5 marker:text-muted">
                  {text.tips.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
};
