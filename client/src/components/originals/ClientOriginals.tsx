import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink, FileText, Vault } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesOriginals } from '@/i18n/pagesOriginals';
import { useL10n } from '@/lib/l10n';
import { myActUrl, type Kind, type OriginalStatus } from './api';
import { StatusChip } from './parts';

registerCopy(pagesOriginals);

interface MyOriginals {
  originals: { id: string; title: string; kind: Kind; status: OriginalStatus; receivedAt: string; updatedAt: string; carrier: string | null; trackingNo: string | null; trackingUrl: string | null }[];
  acts: { eventId: string; action: string; at: string; titles: string[] }[];
}

/** Client portal: read-only list of the originals the office holds for this case, plus the acts to download. */
export const ClientOriginals = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const { data } = useQuery({
    queryKey: ['my-originals', caseId],
    queryFn: async () => (await api.get<MyOriginals>(`/originals/my/cases/${caseId}`)).data,
  });
  if (!data || data.originals.length === 0) return null;

  return (
    <section className="card p-5 sm:p-6" aria-labelledby={`orig-${caseId}`}>
      <h2 id={`orig-${caseId}`} className="flex items-center gap-2 text-base font-semibold text-ink">
        <Vault className="size-5 text-primary" aria-hidden />
        {t('originals.portal.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('originals.portal.hint')}</p>
      <ul className="mt-4 divide-y divide-line">
        {data.originals.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{o.title}</p>
              <p className="text-xs text-muted">
                {t(`originals.kinds.${o.kind}`)} · {t('originals.portal.received')}: {date(o.receivedAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={o.status} />
              {o.trackingUrl && (
                <a href={o.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline">
                  {t('originals.portal.track')} <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      {data.acts.length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="text-sm font-semibold text-ink">{t('originals.portal.acts')}</h3>
          <ul className="mt-2 space-y-1.5">
            {data.acts.map((a) => (
              <li key={a.eventId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="truncate">
                    {t(`originals.actions.${a.action}`)} · {date(a.at)}
                  </span>
                </span>
                <a href={myActUrl(a.eventId, true)} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-link hover:underline">
                  <Download className="size-3.5" aria-hidden /> {t('originals.portal.download')}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default ClientOriginals;
