import { useTranslation } from 'react-i18next';
import FamilyAdminPanel from '@/components/family/FamilyAdminPanel';
import { FamilyPanel } from '@/components/journey/Family';
import type { CaseDetail } from '@/lib/types';
import type { CaseTabProps } from './types';

type Extra = CaseDetail & { parentCaseId?: string | null };

/** Ailə: main case = members with their checklists / family reunion; member case = who it is for + the group links. */
export default function FamilyTab({ c }: CaseTabProps) {
  const { t } = useTranslation();
  const parentCaseId = (c as Extra).parentCaseId;
  return (
    <div className="stack-page">
      <div className="peer stack-page empty:hidden">
        <FamilyAdminPanel caseId={c.id} parentCaseId={parentCaseId} />
        {!!parentCaseId && <FamilyPanel caseId={c.id} parentCaseId={parentCaseId} />}
      </div>
      <p className="hidden rounded-xl border border-dashed border-line bg-card px-4 py-6 text-center text-sm text-muted peer-empty:block">{t('caseLayout.family.none')}</p>
    </div>
  );
}
