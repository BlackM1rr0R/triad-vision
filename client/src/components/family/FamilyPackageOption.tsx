import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesFamilyLanguage } from '@/i18n/pagesFamilyLanguage';
import { Switch } from '@/components/admin/ui';

registerCopy(pagesFamilyLanguage);

export interface FamilyPackageMember {
  caseId: string;
  number: string;
  name: string;
  relation: string | null;
  heading: string;
  summary: Record<string, number>;
  included: number;
}

/** Embassy package drawer (main case): add one section per family member (build option `family`). */
export const FamilyPackageOption = ({ members, checked, onChange }: { members: FamilyPackageMember[]; checked: boolean; onChange: (v: boolean) => void }) => {
  const { t } = useTranslation();
  if (!members.length) return null;
  return (
    <div className="rounded-xl border border-line p-3 sm:p-4">
      <label className="flex items-center justify-between gap-3 text-sm font-semibold text-ink">
        <span className="flex items-center gap-2">
          <Users className="size-4 text-danger-fg" aria-hidden /> {t('familyMembers.pkg.include')}
        </span>
        <Switch checked={checked} onChange={onChange} label={t('familyMembers.pkg.include')} />
      </label>
      <ul className="mt-2 space-y-1 text-xs text-muted">
        {members.map((m) => (
          <li key={m.caseId} className="flex flex-wrap justify-between gap-2">
            <span className="min-w-0 truncate">
              {m.relation ? t(`familyMembers.relation.${m.relation}`) : t('familyMembers.member')}: <span className="font-medium text-ink">{m.name}</span> · {m.number}
            </span>
            <span className="tabular-nums">{m.included ? t('familyMembers.pkg.docs', { count: m.included }) : t('familyMembers.pkg.none')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default FamilyPackageOption;
