import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, CircleAlert, ExternalLink } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesLegalDocs } from '@/i18n/pagesLegalDocs';
import { LEGAL_PATH, versionPath, type LegalKind } from './api';

registerCopy(pagesLegalDocs);

export interface LegalAcceptance {
  kind: LegalKind;
  current: { id: string | null; version: string };
  accepted: { version: string; legalDocumentId: string | null; at: string } | null;
}

/** Privacy centre: the current AGB / privacy version and the version the user accepted (GET /api/privacy → legal). */
export const LegalVersions = ({ items }: { items: LegalAcceptance[] }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  return (
    <section aria-labelledby="privacy-legal-versions" className="mt-4 rounded-xl border border-line bg-sunken p-4">
      <h3 id="privacy-legal-versions" className="text-sm font-semibold text-ink">
        {t('legalDocs.center.title')}
      </h3>
      <ul className="mt-2 divide-y divide-line">
        {items.map((l) => {
          const upToDate = !!l.accepted && (l.accepted.legalDocumentId ? l.accepted.legalDocumentId === l.current.id : l.accepted.version === l.current.version);
          return (
            <li key={l.kind} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium text-ink">
                  {upToDate ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <CircleAlert className="size-4 text-warning" aria-hidden />}
                  {t(`legalDocs.reaccept.kinds.${l.kind}`)}
                </span>
                <span className="block text-xs text-muted">
                  {l.accepted ? (
                    <>
                      {t('legalDocs.center.accepted', { version: l.accepted.version, date: date(l.accepted.at) })}
                      {l.accepted.legalDocumentId && (
                        <>
                          {' · '}
                          <Link to={versionPath(l.kind, l.accepted.version)} target="_blank" rel="noopener" className="text-link hover:underline">
                            {t('legalDocs.center.open')}
                          </Link>
                        </>
                      )}
                    </>
                  ) : (
                    t('legalDocs.center.notAccepted')
                  )}
                  {' · '}
                  {t('legalDocs.center.current', { version: l.current.version })}
                </span>
              </span>
              <Link to={LEGAL_PATH[l.kind]} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-link hover:underline">
                {t('legalDocs.center.open')}
                <ExternalLink className="size-3" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
