import { STATUS_STEP } from '@/lib/caseStatus';
import { SignaturesPanel } from '@/components/esign/CaseSignatures';
import { EmbassyPackagePanel } from '@/components/caseNext/EmbassyPackagePanel';
import { FourEyesPanel } from '@/components/caseNext/FourEyesPanel';
import CaseOriginalsPanel from '@/components/originals/CaseOriginalsPanel';
import { EmploymentContractPanel } from '@/components/placement/EmploymentContractPanel';
import { CaseOfficialFormsPanel } from '@/components/officialForms/CaseOfficialFormsPanel';
import { RecognitionPanel } from '@/components/recognition/RecognitionPanel';
import { AcceleratedPanel } from '@/components/recognition/AcceleratedPanel';
import { ClientFiles } from '../ClientFiles';
import { ContractBox } from '../Contract';
import { RequirementsSection } from '../Requirements';
import type { CaseTabProps } from './types';

/**
 * Sənədlər: requirement review (accept / reject / request, smart-upload suggestions), the embassy package,
 * contract + e-signatures, staff files with the document-intelligence packet / forms, physical originals.
 */
export default function DocumentsTab({ c, isAdmin }: CaseTabProps) {
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
      {/* Four-eyes check of the package before the embassy step (from the embassy stage on). */}
      {showEmbassy && <FourEyesPanel c={c} />}
      <div id="case-contract">
        <ContractBox c={c} />
      </div>
      {/* Employment contract with the employer (Arbeitsvertrag): terms, checks, probation end. */}
      <EmploymentContractPanel caseId={c.id} />
      {/* Official forms: national visa application, Erklärung zum Beschäftigungsverhältnis … (fill, missing data, employer signature). */}
      <CaseOfficialFormsPanel caseId={c.id} />
      {/* Recognition of the qualification (Anerkennung): procedures, checklist, letters, deficits, fee, deadline. */}
      <RecognitionPanel caseId={c.id} isAdmin={isAdmin} />
      {/* § 81a accelerated skilled-worker procedure (needs the case's employer): stepper, correspondence, deadlines. */}
      <AcceleratedPanel caseId={c.id} />
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
