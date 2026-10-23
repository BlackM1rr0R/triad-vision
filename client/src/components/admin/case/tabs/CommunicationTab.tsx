import CaseCallsPanel from '@/components/calls/CaseCallsPanel';
import AdminCaseTasks from '@/components/clientProcess/AdminCaseTasks';
import { CaseTasks } from '@/components/tasks/CaseTasks';
import { InternalNotes, Messages } from '../Communication';
import { fullName } from '../../labels';
import type { CaseTabProps } from './types';

/** Ünsiyyət: messages (translation, voice, three-party thread), calls, the client's tasks, team tasks, internal notes. */
export default function CommunicationTab({ c }: CaseTabProps) {
  const name = fullName(c.client);
  return (
    <div className="stack-page">
      <div id="case-messages">
        <Messages c={c} />
      </div>
      <div id="case-calls">
        <CaseCallsPanel caseId={c.id} clientId={c.client.id} phone={c.client.phone} name={name} />
      </div>
      <AdminCaseTasks c={c} />
      <div id="case-tasks">
        <CaseTasks caseId={c.id} number={c.number} clientName={name} />
      </div>
      <div id="case-notes">
        <InternalNotes c={c} />
      </div>
    </div>
  );
}
