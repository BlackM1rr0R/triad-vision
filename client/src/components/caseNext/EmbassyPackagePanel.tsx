import { useTranslation } from 'react-i18next';
import { Download, FileStack } from 'lucide-react';
import { fileUrl } from '@/lib/api';
import type { CaseDetail } from '@/lib/types';
import { Panel } from '@/components/admin/ui';
import { fmtDateTime } from '@/components/admin/labels';
import { openPackage, usePackageOpen } from './api';
import { EmbassyPackageDrawer } from './EmbassyPackageDrawer';

/** "Səfirlik paketi hazırla" next to the case AI checks: opens the preview checklist drawer (also opened from the next-step card). */
export const EmbassyPackagePanel = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const open = usePackageOpen(c.id);
  const last = c.otherDocuments.find((d) => d.stage === 'EMBASSY' && d.originalName.includes('_Botschaft_'));
  return (
    <Panel title={t('caseNext.pkg.panelTitle')} icon={FileStack} id="case-embassy-package" bodyClassName="p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted">{t('caseNext.pkg.panelDesc')}</p>
          {last && (
            <a href={fileUrl(last.id, true)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
              <Download className="size-3.5" aria-hidden /> {t('caseNext.pkg.lastPackage', { date: fmtDateTime(last.createdAt) })}
            </a>
          )}
        </div>
        <button type="button" className="btn-primary btn-sm shrink-0" onClick={() => openPackage(c.id)}>
          <FileStack className="size-3.5" aria-hidden /> {t('caseNext.pkg.button')}
        </button>
      </div>
      <EmbassyPackageDrawer caseId={c.id} open={open} onClose={() => openPackage(null)} />
    </Panel>
  );
};

export default EmbassyPackagePanel;
