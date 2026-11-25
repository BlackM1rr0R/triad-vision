import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesMailAccess } from '@/i18n/pagesMailAccess';
import { fmtDateTime } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';

registerCopy(pagesMailAccess);

/**
 * Mail settings › Accounts: "who can see this mailbox" for its owner (transparency, server GET /mail/accounts/:id/access).
 * Grants are managed by a super admin in Access Center › Mailboxes; the owner only sees them here.
 */
interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}
interface AccessInfo {
  superAdmins: Person[];
  grants: { id: string; level: 'READ' | 'SEND'; createdAt: string; user: Person }[];
  opens: { at: string; user: Person | null }[];
}

const nameOf = (p: Person | null) => (p ? `${p.firstName} ${p.lastName}`.trim() || p.email || '' : '—');

export const MailboxAccessPanel = ({ accountId }: { accountId: string }) => {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['mail', 'account-access', accountId], queryFn: async () => (await api.get<AccessInfo>(`/mail/accounts/${accountId}/access`)).data, staleTime: 30_000 });
  if (q.isLoading) return <Spinner className="size-4 text-link" />;
  if (!q.data) return <p className="text-xs text-danger-fg">{t('mailAccess.admin.error')}</p>;
  const { superAdmins, grants, opens } = q.data;
  return (
    <div className="space-y-2 text-xs">
      <p className="font-semibold text-ink">{t('mailAccess.owner.title')}</p>
      <p className="text-muted">{t('mailAccess.owner.intro')}</p>
      <div>
        <p className="text-muted">{t('mailAccess.owner.grants')}</p>
        {grants.length ? (
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {grants.map((g) => (
              <li key={g.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-sunken px-2 py-0.5 text-ink">
                {nameOf(g.user)} <span className="font-semibold text-link">· {t(`mailAccess.level.${g.level}`)}</span>
                <span className="text-muted">· {t('mailAccess.owner.since', { date: fmtDateTime(g.createdAt) })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink">{t('mailAccess.owner.noGrants')}</p>
        )}
      </div>
      <div>
        <p className="text-muted">{t('mailAccess.owner.superAdmins')}</p>
        <p className="text-ink">{superAdmins.length ? superAdmins.map(nameOf).join(', ') : '—'}</p>
      </div>
      <div>
        <p className="text-muted">{t('mailAccess.owner.opens')}</p>
        {opens.length ? (
          <ul className="mt-1 space-y-0.5 text-ink">
            {opens.map((o, i) => (
              <li key={i}>
                {fmtDateTime(o.at)} · {nameOf(o.user)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink">{t('mailAccess.owner.noOpens')}</p>
        )}
      </div>
    </div>
  );
};
