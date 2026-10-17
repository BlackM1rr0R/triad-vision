import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleHelp, LifeBuoy } from 'lucide-react';
import { Drawer } from '../Drawer';
import { HelpGuide } from './HelpGuide';
import { helpKeyFor } from './helpKeys';
import { registerHelpCopy } from './registerHelp';

registerHelpCopy();

/** "Help" button in the admin header: opens the guide of the current page in a side panel. */
export const HelpButton = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const key = helpKeyFor(pathname);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-xs font-semibold whitespace-nowrap text-ink/80 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
        aria-label={t('adminHelpUi.open')}
        title={t('adminHelpUi.open')}
      >
        <CircleHelp className="size-4" /> <span className="hidden sm:inline">{t('adminHelpUi.button')}</span>
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <LifeBuoy className="size-4 text-brand-600" /> {t(`adminHelp.${key}.title`, { defaultValue: t('adminHelpUi.button') })}
          </span>
        }
        footer={
          <Link to="/admin/help" onClick={() => setOpen(false)} className="text-sm font-semibold text-brand-600 hover:underline">
            {t('adminHelpUi.allGuides')} →
          </Link>
        }
      >
        <HelpGuide helpKey={key} compact />
      </Drawer>
    </>
  );
};
