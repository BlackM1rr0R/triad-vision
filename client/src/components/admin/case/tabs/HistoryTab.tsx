import CaseHistoryPanel from '@/components/history/CaseHistoryPanel';
import ClientAccessLogPanel from '@/components/privacy/ClientAccessLogPanel';
import { Timeline } from '../Communication';
import { fullName } from '../../labels';
import type { CaseTabProps } from './types';

/** Tarixçə: case events, field-level change history with one-click revert, the client's access log (ADMIN+). */
export default function HistoryTab({ c, isAdmin }: CaseTabProps) {
  return (
    <div className="stack-page">
      <div id="case-timeline">
        <Timeline c={c} />
      </div>
      <CaseHistoryPanel caseId={c.id} clientId={c.client.id} clientName={fullName(c.client)} />
      {isAdmin && (
        <div id="case-access">
          <ClientAccessLogPanel clientId={c.client.id} />
        </div>
      )}
    </div>
  );
}
