import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAccessPartners } from '@/i18n/pagesAccessPartners';
import { pagesPartnerAccess } from '@/i18n/pagesPartnerAccess';
import type { PartnerPerms, PartnerTemplate } from '@/components/partnerPortal/api';
import { usePermSummary } from '@/components/partnerPortal/PermissionMatrix';
import { TeamManager } from '@/pages/partner/Team';

registerCopy(pagesAccessPartners);
registerCopy(pagesPartnerAccess);

/**
 * Admin partner page › Portal: the partner's portal permissions (read here, edited in Access Center › Partners by
 * SUPER_ADMIN / "manage access") and the partner's team members (staff with partner rights manage them here).
 */
export function PartnerAccessPanel({ partnerId }: { partnerId: string }) {
  const { t } = useTranslation();
  const summary = usePermSummary();
  const me = useQuery({
    queryKey: ['access-me'],
    queryFn: async () => (await api.get<{ canManage: boolean; superAdmin: boolean }>('/admin/access/me')).data,
    staleTime: 60_000,
  });
  const detail = useQuery({
    queryKey: ['access-partner', partnerId],
    queryFn: async () => (await api.get<{ template: PartnerTemplate; perms: PartnerPerms }>(`/admin/access/partners/${partnerId}`)).data,
    enabled: !!me.data?.canManage,
  });
  return (
    <section className="space-y-3 rounded-xl border border-line bg-card p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <ShieldCheck className="size-4 text-link" aria-hidden /> {t('accessPartners.matrix')}
      </h3>
      {detail.data && (
        <p className="text-xs text-muted">
          <span className="badge mr-1.5 bg-accent-bg text-accent-fg">{t(`partnerAccess.template.${detail.data.template}`)}</span>
          {summary(detail.data.perms)}
        </p>
      )}
      {me.data?.canManage && (
        <Link to={`/admin/access?tab=partners&partner=${encodeURIComponent(partnerId)}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-link hover:underline">
          {t('accessPartners.detailLink')}
        </Link>
      )}
      <div className="border-t border-line pt-3">
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Users className="size-4 text-muted" aria-hidden /> {t('accessPartners.team')}
        </h4>
        <TeamManager base={`/admin/access/partners/${partnerId}/members`} />
      </div>
    </section>
  );
}
