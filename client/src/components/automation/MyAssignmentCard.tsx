import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Save, UserCog } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAutomation } from '@/i18n/pagesAutomation';
import { Panel, Switch } from '@/components/admin/ui';
import { Spinner } from '@/components/ui/Spinner';
import { MultiChips } from './MultiChips';
import { LANGS, VISA_TYPES, toastAutomationError, type Lang, type StaffPrefs, type VisaType } from './types';

registerCopy(pagesAutomation);

/** Workspace → Team → Leave: the staff member's own assignment profile (languages, visa types, max open, days). */
export const MyAssignmentCard = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['assignment-me'], queryFn: async () => (await api.get<{ prefs: StaffPrefs }>('/admin/assignment/me')).data.prefs });
  const [p, setP] = useState<StaffPrefs | null>(null);
  useEffect(() => setP(data ?? null), [data]);
  const save = useMutation({
    mutationFn: () => api.put('/admin/assignment/me', p),
    onSuccess: () => {
      toast.success(t('automation.staff.saved'));
      void qc.invalidateQueries({ queryKey: ['assignment-me'] });
    },
    onError: toastAutomationError,
  });
  if (!p) return null;
  return (
    <Panel
      title={t('automation.tabs.assignment')}
      icon={UserCog}
      actions={<button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />} {t('automation.common.save')}</button>}
    >
      <div className="space-y-4">
        <p className="text-xs text-muted">{t('automation.staff.hint')}</p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-navy-900">{t('automation.staff.autoAssign')}</span>
          <Switch checked={p.autoAssign} onChange={(v) => setP({ ...p, autoAssign: v })} label={t('automation.staff.autoAssign')} />
        </div>
        <div><span className="label">{t('automation.staff.languages')}</span><MultiChips options={LANGS} value={p.languages} onChange={(languages) => setP({ ...p, languages: languages as Lang[] })} label={(l) => t(`automation.locales.${l}`)} /></div>
        <div><span className="label">{t('automation.staff.visaTypes')}</span><MultiChips options={VISA_TYPES} value={p.visaTypes} onChange={(visaTypes) => setP({ ...p, visaTypes: visaTypes as VisaType[] })} label={(v) => t(`automation.visaTypes.${v}`)} /></div>
        <label className="block">
          <span className="label">{t('automation.staff.maxOpen')}</span>
          <input type="number" min={1} max={1000} className="input w-40" placeholder={t('automation.staff.unlimited')} value={p.maxOpenCases ?? ''} onChange={(e) => setP({ ...p, maxOpenCases: e.target.value === '' ? null : Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })} />
        </label>
        <div>
          <span className="label">{t('automation.staff.workingDays')}</span>
          <MultiChips options={['1', '2', '3', '4', '5', '6', '7']} value={p.workingDays.map(String)} onChange={(d) => setP({ ...p, workingDays: d.map(Number).sort() })} label={(d) => t(`automation.staff.weekdays.${d}`)} anyLabel={t('automation.staff.everyDay')} />
        </div>
      </div>
    </Panel>
  );
};

export default MyAssignmentCard;
