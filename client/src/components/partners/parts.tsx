import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Building2, ExternalLink, Factory, HardHat, HeartPulse, Hotel, MapPin, Package, Tractor, Warehouse, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { DetailModal } from '@/components/ui/DetailModal';
import { useL10n } from '@/lib/l10n';
import type { Partner, PartnerSector } from '@/lib/types';

export const SECTORS: PartnerSector[] = ['logistics', 'courier', 'industry', 'construction', 'hospitality', 'healthcare', 'agriculture', 'other'];

export const SECTOR_ICON: Record<PartnerSector, LucideIcon> = {
  logistics: Warehouse,
  courier: Package,
  industry: Factory,
  construction: HardHat,
  hospitality: Hotel,
  healthcare: HeartPulse,
  agriculture: Tractor,
  other: Building2,
};

export const sectorOf = (p: Partner): PartnerSector => (p.sector && SECTORS.includes(p.sector) ? p.sector : 'other');

export const initials = (name: string) =>
  name
    .split(/[\s+\-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Logo if uploaded, otherwise a typographic wordmark. */
export const Wordmark = ({ partner, size = 'md', className }: { partner: Partner; size?: 'sm' | 'md' | 'lg'; className?: string }) =>
  partner.logo ? (
    <img src={partner.logo} alt={partner.name} loading="lazy" decoding="async" className={clsx('object-contain', size === 'lg' ? 'max-h-14 max-w-[200px]' : 'max-h-9 max-w-[130px]', className)} />
  ) : (
    <span
      className={clsx(
        'block truncate font-display font-black tracking-tight text-navy-900 uppercase',
        size === 'lg' ? 'text-2xl sm:text-3xl' : size === 'md' ? 'text-lg' : 'text-base',
        className,
      )}
    >
      {partner.name}
    </span>
  );

export const SectorBadge = ({ sector, dark = false }: { sector: PartnerSector; dark?: boolean }) => {
  const { t } = useTranslation();
  const I = SECTOR_ICON[sector];
  return (
    <span className={clsx('badge shrink-0 gap-1.5 whitespace-nowrap', dark ? 'bg-white/10 text-white' : 'bg-brand-50 text-brand-700')}>
      <I className="size-3.5" /> {t(`partnersPage.sector.${sector}`)}
    </span>
  );
};

export const CityLine = ({ city, className }: { city?: string | null; className?: string }) => {
  const { t } = useTranslation();
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-sm', city ? 'text-navy-900/80' : 'text-muted', className)}>
      <MapPin className="size-4 shrink-0 text-brand-600" /> {city ?? t('partnersPage.card.noCity')}
    </span>
  );
};

/** Full partner info in the shared detail dialog. */
export const PartnerModal = ({ partner, onClose }: { partner: Partner | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const p = partner;
  const sector = p ? sectorOf(p) : 'other';
  const I = SECTOR_ICON[sector];
  return (
    <DetailModal
      open={!!p}
      onClose={onClose}
      title={p?.name ?? ''}
      eyebrow={t(`partnersPage.sector.${sector}`)}
      icon={<I className="size-6" />}
      footer={
        p && (
          <>
            {p.website && (
              <a href={p.website} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                {t('partnersPage.card.visit')} <ExternalLink className="size-4" />
              </a>
            )}
            <Link to="/cooperation" onClick={onClose} className="btn-primary">
              {t('partnersPage.card.request')} <ArrowRight className="size-4" />
            </Link>
          </>
        )
      }
    >
      {p && (
        <div className="space-y-5">
          <div className="grid place-items-center rounded-2xl bg-surface px-4 py-8">
            <Wordmark partner={p} size="lg" />
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-line p-3">
              <dt className="text-xs font-semibold text-muted">{t('partnersPage.card.sector')}</dt>
              <dd className="mt-1 font-semibold text-navy-900">{t(`partnersPage.sector.${sector}`)}</dd>
            </div>
            <div className="rounded-xl border border-line p-3">
              <dt className="text-xs font-semibold text-muted">{t('partnersPage.card.location')}</dt>
              <dd className="mt-1 font-semibold text-navy-900">{p.city ?? '—'}</dd>
            </div>
          </dl>
          {p.description && (
            <div>
              <h4 className="text-xs font-bold tracking-widest text-brand-600 uppercase">{t('partnersPage.card.about')}</h4>
              <p className="mt-2">{tr(p.description)}</p>
            </div>
          )}
        </div>
      )}
    </DetailModal>
  );
};
