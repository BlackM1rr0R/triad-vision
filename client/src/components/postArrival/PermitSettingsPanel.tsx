import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BellRing } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPermits } from '@/i18n/pagesPermits';
import { Panel } from '@/components/admin/ui';
import { toastError } from '@/components/admin/labels';
import type { PermitItem } from './PermitPanel';

registerCopy(pagesPermits);

// GET / PUT /api/admin/permits/settings (server lib/permits/rules.ts permitSettingsSchema)
interface Settings {
  enabled: boolean;
  windows: Record<PermitItem, number[]>;
  staffEmail: boolean;
}
const ITEMS: PermitItem[] = ['residence', 'blueCard', 'passport', 'insurance'];
const KEY = ['admin-permit-settings'];

/** "90, 60, 30" → [90, 60, 30]; null when not 1–6 whole numbers between 1 and 365. */
const parseList = (v: string): number[] | null => {
  const parts = v.split(/[\s,;/]+/).filter(Boolean);
  if (!parts.length || parts.length > 6) return null;
  const nums = parts.map(Number);
  return nums.every((n) => Number.isInteger(n) && n >= 1 && n <= 365) ? nums : null;
};

/** /admin/expiring (ADMIN+): reminder windows per item, staff e-mail, on / off for the permit reminders. */
export const PermitSettingsPanel = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<{ settings: Settings }>('/admin/permits/settings')).data.settings });
  const [enabled, setEnabled] = useState(true);
  const [staffEmail, setStaffEmail] = useState(true);
  const [text, setText] = useState<Record<PermitItem, string>>({ residence: '', blueCard: '', passport: '', insurance: '' });
  useEffect(() => {
    if (!q.data) return;
    setEnabled(q.data.enabled);
    setStaffEmail(q.data.staffEmail);
    setText(Object.fromEntries(ITEMS.map((i) => [i, q.data.windows[i].join(', ')])) as Record<PermitItem, string>);
  }, [q.data]);
  const parsed = Object.fromEntries(ITEMS.map((i) => [i, parseList(text[i])])) as Record<PermitItem, number[] | null>;
  const valid = ITEMS.every((i) => parsed[i]);
  const save = useMutation({
    mutationFn: async () => (await api.put<{ settings: Settings }>('/admin/permits/settings', { settings: { enabled, staffEmail, windows: parsed } })).data.settings,
    onSuccess: (s) => (qc.setQueryData(KEY, s), toast.success(t('permits.settings.saved'))),
    onError: (e) => toastError(e),
  });
  if (!q.data) return null;

  return (
    <Panel title={t('permits.settings.title')} icon={BellRing} id="permit-settings" className="mt-6" bodyClassName="p-4 sm:p-5 space-y-4">
      <p className="text-sm text-muted">{t('permits.settings.intro')}</p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {ITEMS.map((i) => (
            <label key={i} className="block min-w-0">
              <span className="label">{t('permits.settings.windowsLabel', { item: t(`permits.items.${i}`) })}</span>
              <input
                className="input"
                inputMode="numeric"
                value={text[i]}
                aria-invalid={!parsed[i]}
                onChange={(e) => setText((prev) => ({ ...prev, [i]: e.target.value }))}
              />
              {i === 'passport' && <span className="mt-1 block text-[11px] text-muted">{t('permits.settings.passportHint')}</span>}
            </label>
          ))}
        </div>
        {!valid && <p className="text-xs text-danger">{t('permits.settings.invalid')}</p>}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> {t('permits.settings.enabled')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={staffEmail} onChange={(e) => setStaffEmail(e.target.checked)} /> {t('permits.settings.staffEmail')}
        </label>
        <button type="submit" className="btn-primary btn-sm" disabled={save.isPending || !valid}>
          {t('permits.settings.save')}
        </button>
      </form>
    </Panel>
  );
};

export default PermitSettingsPanel;
