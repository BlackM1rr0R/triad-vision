import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ListFilter, ListTree } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { registerCopy } from '@/i18n';
import { adminSimpleCopy } from '@/i18n/adminSimple';
import { useStaffNav } from '@/components/command/navPrefs';
import { WORK_PROFILES, isWorkProfile, type NavView } from '@/components/command/workProfiles';

registerCopy(adminSimpleCopy);

/**
 * Top of the admin sidebar: "Simple / Full view" (saved per user on the server, PUT /admin/me/nav navView) and,
 * in the simple view, the user's own work profile (which pages the simple menu lists; an admin can set it on
 * the Users page too). Search (Ctrl+K) keeps finding every page in both views.
 */
export const SidebarViewSwitch = ({ collapsed }: { collapsed: boolean }) => {
  const { t } = useTranslation();
  const { navView, setNavView, workProfile, workProfileChosen, defaultWorkProfile, setWorkProfile } = useStaffNav();
  const simple = navView === 'simple';

  if (collapsed) {
    const next: NavView = simple ? 'full' : 'simple';
    const label = t(`wprof.${next}`);
    return (
      <Tooltip content={label} side="right">
        <button
          type="button"
          onClick={() => setNavView(next)}
          aria-label={label}
          className="grid h-8 w-10 place-items-center rounded-lg text-muted transition hover:bg-line/60 hover:text-ink"
        >
          {simple ? <ListTree className="size-4" aria-hidden /> : <ListFilter className="size-4" aria-hidden />}
        </button>
      </Tooltip>
    );
  }

  return (
    <div className="space-y-1.5">
      <div role="radiogroup" aria-label={t('wprof.viewAria')} className="grid grid-cols-2 gap-0.5 rounded-lg bg-line/50 p-0.5 text-[12px] font-medium">
        {(['simple', 'full'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={navView === v}
            onClick={() => navView !== v && setNavView(v)}
            title={v === 'simple' ? t('wprof.simpleHint') : undefined}
            className={clsx(
              'min-h-7 rounded-md px-2 transition-colors pointer-coarse:min-h-9',
              navView === v ? 'bg-card text-ink shadow-[var(--tv-shadow-card)] ring-1 ring-line' : 'text-muted hover:text-ink',
            )}
          >
            {t(`wprof.${v}`)}
          </button>
        ))}
      </div>
      {simple && (
        <label className="block">
          <span className="sr-only">{t('wprof.profile')}</span>
          <select
            className="input h-8 w-full py-0 text-xs"
            title={t('wprof.profileHint')}
            value={workProfileChosen ?? ''}
            onChange={(e) => setWorkProfile(isWorkProfile(e.target.value) ? e.target.value : null)}
          >
            <option value="">{t('wprof.auto', { name: t(`wprof.names.${defaultWorkProfile}`) })}</option>
            {WORK_PROFILES.map((p) => (
              <option key={p} value={p}>
                {t(`wprof.names.${p}`)}
              </option>
            ))}
          </select>
          <span className="sr-only">{t(`wprof.descs.${workProfile}`)}</span>
        </label>
      )}
    </div>
  );
};
