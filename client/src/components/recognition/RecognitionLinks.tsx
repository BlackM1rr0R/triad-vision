import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesStaffTools } from '@/i18n/pagesStaffTools';

registerCopy(pagesStaffTools);

/**
 * Official lookups for a recognition procedure (checked Nov 2026):
 * - anabin (KMK / ZAB): universities (H+ / H± / H−) and degree assessments — https://anabin.kmk.org
 * - Anerkennungs-Finder (BIBB portal "Anerkennung in Deutschland"): reference profession, competent body, documents.
 */
export const RECOGNITION_LINKS = [
  { key: 'anabinInst', href: 'https://anabin.kmk.org/db/institutionen' },
  { key: 'anabinDegree', href: 'https://anabin.kmk.org/db/hochschulabschluesse' },
  { key: 'finder', href: 'https://www.anerkennung-in-deutschland.de/html/de/anerkennungs-finder.php' },
] as const;

export const RecognitionLinks = ({ compact = false }: { compact?: boolean }) => {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('staffTools.recLinks.title')} className="rounded-xl border border-line bg-sunken/40 px-3 py-2">
      <p className="text-xs font-semibold text-ink">{t('staffTools.recLinks.title')}</p>
      <ul className="mt-1 space-y-1">
        {RECOGNITION_LINKS.map((l) => (
          <li key={l.key}>
            <a href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1.5 text-sm text-link hover:underline">
              <ExternalLink className="size-3.5 shrink-0" aria-hidden /> {t(`staffTools.recLinks.${l.key}`)}
            </a>
          </li>
        ))}
      </ul>
      {!compact && <p className="mt-1 text-[11px] text-muted">{t('staffTools.recLinks.hint')}</p>}
      <p className="text-[11px] text-muted">{t('staffTools.recLinks.asOf')}</p>
    </nav>
  );
};

export default RecognitionLinks;
