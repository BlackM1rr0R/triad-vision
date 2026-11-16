import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Car, ChefHat, HardHat, HeartHandshake, Stethoscope, Zap, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { registerCopy } from '@/i18n';
import { pagesProfessionHubs } from '@/i18n/pagesProfessionHubs';
import { PROFESSION_HUB_SLUGS, hubPath, type ProfessionHubSlug } from '@/lib/professionHubs';

registerCopy(pagesProfessionHubs);

const ICONS: Record<ProfessionHubSlug, LucideIcon> = {
  'truck-driver': Car,
  cook: ChefHat,
  nurse: Stethoscope,
  'care-worker': HeartHandshake,
  electrician: Zap,
  'construction-worker': HardHat,
};

/** "I am a …" chips linking the profession hubs (/for/<slug>): tools hub, home page and the hubs themselves. */
export const ProfessionPicker = ({ current, heading, className }: { current?: ProfessionHubSlug; heading?: string; className?: string }) => {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('profHub.picker.aria')} className={className}>
      <p className="font-display text-lg font-semibold text-ink">{heading ?? t('profHub.picker.title')}</p>
      {!heading && <p className="mt-1 text-sm text-muted">{t('profHub.picker.text')}</p>}
      <ul className="mt-3 flex flex-wrap gap-2">
        {PROFESSION_HUB_SLUGS.filter((s) => s !== current).map((s) => {
          const Icon = ICONS[s];
          return (
            <li key={s}>
              <Link
                to={hubPath(s)}
                className={clsx(
                  'inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold text-ink shadow-[var(--tv-shadow-card)] transition-colors hover:border-line-strong hover:bg-raised',
                )}
              >
                <Icon className="size-4 text-primary" aria-hidden /> {t(`profHub.hubs.${s}.chip`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
