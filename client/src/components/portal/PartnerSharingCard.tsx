import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Handshake, ShieldCheck, ShieldOff } from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPartnerClients } from '@/i18n/pagesPartnerClients';
import { Spinner } from '@/components/ui/Spinner';

registerCopy(pagesPartnerClients);

// GET / POST /api/partner-sharing (server routes/partnerSharing.ts)
interface Sharing {
  partner: { name: string } | null;
  granted: boolean | null;
}

const KEY = ['account', 'partner-sharing'] as const;

/**
 * Portal home of a client who belongs to a referral partner: names the partner and lets the client allow or
 * withdraw sharing more of their application with the partner (consent log PARTNER_SHARING). Renders nothing
 * for clients without a partner.
 */
export const PartnerSharingCard = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<Sharing>('/partner-sharing')).data, staleTime: 5 * 60_000 });
  const save = useMutation({
    mutationFn: async (granted: boolean) => (await api.post<Sharing>('/partner-sharing', { granted })).data,
    onSuccess: (data) => {
      qc.setQueryData(KEY, data);
      toast.success(t('partnerClients.sharing.saved'));
    },
    onError: () => toast.error(t('partnerClients.sharing.failed')),
  });
  const data = q.data;
  if (!data?.partner) return null;
  const name = data.partner.name;
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="partner-sharing-title">
      <h2 id="partner-sharing-title" className="type-card-title flex items-center gap-2">
        <Handshake className="size-5 text-link" aria-hidden /> {t('partnerClients.sharing.title', { name })}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('partnerClients.sharing.text', { name })}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className={clsx('inline-flex items-center gap-1.5 text-sm font-medium', data.granted ? 'text-success-fg' : 'text-muted')}>
          {data.granted ? <ShieldCheck className="size-4" aria-hidden /> : <ShieldOff className="size-4" aria-hidden />}
          {data.granted ? t('partnerClients.sharing.granted') : t('partnerClients.sharing.declined')}
        </span>
        <button type="button" className={data.granted ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'} disabled={save.isPending} onClick={() => save.mutate(!data.granted)}>
          {save.isPending && <Spinner className="size-4" />} {data.granted ? t('partnerClients.sharing.revoke') : t('partnerClients.sharing.allow')}
        </button>
      </div>
    </section>
  );
};
