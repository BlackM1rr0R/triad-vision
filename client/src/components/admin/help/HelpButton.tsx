import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleHelp, LifeBuoy, Route } from 'lucide-react';
import { Drawer } from '../Drawer';
import { HelpGuide } from './HelpGuide';
import { helpKeyFor } from './helpKeys';
import { loadHelpGuides, registerHelpCopy, useHelpGuides } from './registerHelp';
import { Spinner } from '@/components/ui/Spinner';
import { LoadSwap } from '@/components/motion/app';
import { restartTour } from '@/components/onboarding/tour';
import { ADMIN_TOUR } from '@/components/onboarding/tours';

registerHelpCopy();

/** "Help" button in the admin header: opens the guide of the current page in a side panel. */
export const HelpButton = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const key = helpKeyFor(pathname);
  const ready = useHelpGuides(open);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={() => void loadHelpGuides().catch(() => undefined)}
        onFocus={() => void loadHelpGuides().catch(() => undefined)}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-xs font-semibold whitespace-nowrap text-ink/80 transition hover:border-line-strong hover:bg-primary/[0.06] hover:text-link"
        aria-label={t('adminHelpUi.open')}
        title={t('adminHelpUi.open')}
        data-tour="admin-help"
      >
        <CircleHelp className="size-4" /> <span className="hidden sm:inline">{t('adminHelpUi.button')}</span>
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <LifeBuoy className="size-4 text-link" /> {t(`adminHelp.${key}.title`, { defaultValue: t('adminHelpUi.button') })}
          </span>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link to="/admin/help" onClick={() => setOpen(false)} className="text-sm font-semibold text-link hover:underline">
              {t('adminHelpUi.allGuides')} →
            </Link>
            {/* the first-login staff tour, from step 1 (components/onboarding/tours.ts ADMIN_TOUR) */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.setTimeout(() => restartTour(ADMIN_TOUR), 220); // after the drawer has closed and returned focus
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-ink/80 transition hover:bg-sunken hover:text-ink"
            >
              <Route className="size-4" aria-hidden /> {t('pux.tour.start')}
            </button>
          </div>
        }
      >
        <LoadSwap
          loading={!ready}
          skeleton={
            <div className="grid min-h-40 place-items-center text-link" role="status" aria-label={t('ui.loading')}>
              <Spinner className="size-6" />
            </div>
          }
        >
          <HelpGuide helpKey={key} compact />
        </LoadSwap>
      </Drawer>
    </>
  );
};
