import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CaseDetail } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesReceivedDocs } from '@/i18n/pagesReceivedDocs';
import { ReceivedDocuments, useReceivedDocuments } from './ReceivedDocuments';
import { OtherFiles } from './CaseCards';

registerCopy(pagesReceivedDocs);

/**
 * The cabinet's one "Sənədlər" area (case page, tab "docs"):
 *  A) "Bizdən gələn sənədlər" — everything Triad Vision sent (anchor #received),
 *  B) "Mənim yüklədiklərim" — the client's own uploads with their status and the upload buttons (`mine` = the existing
 *     requirement lists of CaseDocuments; the "Sənəd siyahısı" link opens the full checklist).
 * `before` = notices / progress shown above both sections.
 */
export function ClientDocumentsArea({ data, before, mine }: { data: CaseDetail; before?: ReactNode; mine: ReactNode }) {
  const { t } = useTranslation();
  const received = useReceivedDocuments(data.id);
  // Files without a requirement that are not "from us" (the client's own free uploads, e.g. a task's file) stay listed under B.
  const sentIds = new Set(received.data?.groups.flatMap((g) => g.files.map((f) => f.id)) ?? []);
  const ownOther = received.data ? { ...data, otherDocuments: data.otherDocuments.filter((d) => !sentIds.has(d.id) && !d.originalName.includes('_Botschaft_')) } : null;
  return (
    <>
      {before}
      <ReceivedDocuments caseId={data.id} />
      <section id="mine" className="scroll-mt-40 space-y-4" aria-labelledby="mine-title">
        <div>
          <h3 id="mine-title" className="type-card-title">
            {t('recv.mine.title')}
          </h3>
          <p className="mt-1 text-sm text-muted">{t('recv.mine.intro')}</p>
          <Link to="/account/checklist" className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-link hover:underline">
            <ClipboardCheck className="size-4" aria-hidden /> {t('recv.mine.checklist')}
          </Link>
        </div>
        {mine}
        {ownOther && <OtherFiles data={ownOther} />}
      </section>
    </>
  );
}
