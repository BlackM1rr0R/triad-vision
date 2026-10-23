import { STATUS_STEP } from '@/lib/caseStatus';
import { SignaturesPanel } from '@/components/esign/CaseSignatures';
import { EmbassyPackagePanel } from '@/components/caseNext/EmbassyPackagePanel';
import CaseOriginalsPanel from '@/components/originals/CaseOriginalsPanel';
import { ClientFiles } from '../ClientFiles';
import { ContractBox } from '../Contract';
import { RequirementsSection } from '../Requirements';
import type { CaseTabProps } from './types';

/**
 * Sənədlər: requirement review (accept / reject / request, smart-upload suggestions), the embassy package,
 * contract + e-signatures, staff files with the document-intelligence packet / forms, physical originals.
 */
export default function DocumentsTab({ c }: CaseTabProps) {
  const step = STATUS_STEP[c.status];
  // The embassy stage shows once the case reached it (or was reopened there / requirements exist).
  const showEmbassy = c.requirements.some((r) => r.stage === 'EMBASSY') || step >= 2;
  // The stage being worked on comes first.
  const embassyFirst = c.status === 'EMBASSY_DOCUMENTS' || c.status === 'EMBASSY_REVIEW';
  const embassy = showEmbassy && (
    <div id="case-docs-embassy">
      <RequirementsSection c={c} stage="EMBASSY" />
    </div>
  );
  return (
    <div className="stack-page">
      {embassyFirst && embassy}
      <div id="case-docs-initial">
        <RequirementsSection c={c} stage="INITIAL" />
      </div>
      {!embassyFirst && embassy}
      <EmbassyPackagePanel c={c} />
      <div id="case-contract">
        <ContractBox c={c} />
      </div>
      <div id="case-signatures">
        <SignaturesPanel caseId={c.id} />
      </div>
      <div id="case-files" className="stack-page">
        <ClientFiles c={c} />
      </div>
      <div id="case-originals" className="empty:hidden">
        <CaseOriginalsPanel caseId={c.id} />
      </div>
    </div>
  );
}
