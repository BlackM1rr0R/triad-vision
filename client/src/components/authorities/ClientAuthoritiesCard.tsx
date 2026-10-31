import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Clock, ExternalLink, Landmark, Mail, MapPin, Phone } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { registerCopy } from '@/i18n';
import { pagesAuthorities } from '@/i18n/pagesAuthorities';
import { api } from '@/lib/api';
import { authorityPlace, safeUrl, type ClientAuthority } from './api';

registerCopy(pagesAuthorities);

/**
 * Client portal case page (overview, #authorities): read-only data of the embassy / Ausländerbehörde / other
 * authorities linked to the case in the catalogue (GET /api/account/authorities/cases/:caseId). No internal
 * notes or contact persons. Renders nothing while no authority is linked.
 */
export const ClientAuthoritiesCard = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['account-authorities', caseId], queryFn: async () => (await api.get<{ items: ClientAuthority[] }>(`/account/authorities/cases/${caseId}`)).data.items });
  const items = q.data ?? [];
  if (!items.length) return null;
  return (
    <div id="authorities" className="scroll-mt-40">
      <Card title={t('authorities.portal.title')} subtitle={t('authorities.portal.hint')} icon={Landmark}>
        <div className="space-y-5">
          {items.map((a) => {
            const url = safeUrl(a.website);
            return (
              <section key={a.id} className="space-y-2" aria-labelledby={`authority-${a.id}`}>
                <div>
                  <p className="text-xs font-medium text-muted">{t(`authorities.types.${a.type}`)}</p>
                  <h3 id={`authority-${a.id}`} className="text-sm font-semibold text-ink">
                    {a.name}
                    {authorityPlace(a) && <span className="font-normal text-muted"> · {authorityPlace(a)}</span>}
                  </h3>
                </div>
                <ul className="space-y-1.5 text-sm text-ink">
                  {a.address && (
                    <li className="flex items-start gap-2">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-accent-fg" aria-hidden />
                      <span className="min-w-0 break-words whitespace-pre-line">{a.address}</span>
                    </li>
                  )}
                  {a.phone && (
                    <li className="flex items-center gap-2">
                      <Phone className="size-4 shrink-0 text-muted" aria-hidden />
                      <span className="sr-only">{t('authorities.portal.phone')}:</span>
                      <a href={`tel:${a.phone.replace(/[^\d+]/g, '')}`} className="text-link hover:underline">
                        {a.phone}
                      </a>
                    </li>
                  )}
                  {a.email && (
                    <li className="flex items-center gap-2">
                      <Mail className="size-4 shrink-0 text-muted" aria-hidden />
                      <span className="sr-only">{t('authorities.portal.email')}:</span>
                      <a href={`mailto:${a.email}`} className="break-all text-link hover:underline">
                        {a.email}
                      </a>
                    </li>
                  )}
                  {url && (
                    <li className="flex items-center gap-2">
                      <ExternalLink className="size-4 shrink-0 text-muted" aria-hidden />
                      <span className="sr-only">{t('authorities.portal.website')}:</span>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-link hover:underline">
                        {url.replace(/^https?:\/\//i, '')}
                      </a>
                    </li>
                  )}
                  {a.openingHours && (
                    <li className="flex items-start gap-2">
                      <Clock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                      <span className="sr-only">{t('authorities.portal.hours')}:</span>
                      <span className="whitespace-pre-line">{a.openingHours}</span>
                    </li>
                  )}
                </ul>
                {a.waitingDays !== null && <p className="text-xs text-muted">{t('authorities.portal.waiting', { count: a.waitingDays })}</p>}
                {(a.requirements || a.checklist.length > 0) && (
                  <details className="rounded-xl bg-sunken/60 px-3 py-2 text-sm">
                    <summary className="cursor-pointer font-medium text-ink">{t('authorities.portal.requirements')}</summary>
                    {a.requirements && <p className="mt-1.5 whitespace-pre-line text-ink/90">{a.requirements}</p>}
                    {a.checklist.length > 0 && (
                      <>
                        <p className="mt-2 text-xs font-semibold text-ink">{t('authorities.portal.checklist')}</p>
                        <ul className="mt-1 list-inside list-disc text-ink/90">
                          {a.checklist.map((c, i) => (
                            <li key={i}>
                              {c.label}
                              {!c.required && <span className="text-muted"> ({t('authorities.portal.optional')})</span>}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </details>
                )}
              </section>
            );
          })}
        </div>
      </Card>
    </div>
  );
};
