import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { Modal } from './Modal';
import { RULES, type Beneficiary, type Currency, type Rule } from './types';
import { confirmDialog } from '@/components/ui/ConfirmHost';

interface Draft {
  id?: string;
  name: string;
  rule: Rule;
  /** Units for FIXED, percent for PERCENT_OF_NET. */
  value: string;
  currency: Currency;
  active: boolean;
}

const toDraft = (b: Beneficiary): Draft => ({
  id: b.id,
  name: b.name,
  rule: b.rule,
  value: b.rule === 'FIXED' ? String(b.value / 100) : b.rule === 'PERCENT_OF_NET' ? String(b.value / 100) : '',
  currency: b.currency ?? 'AZN',
  active: b.active,
});

/** Beneficiaries and their rules + the AZN↔EUR rate (ADMIN+ edit, staff read). */
export const RulesDialog = ({ beneficiaries, rate, canManage, onClose, onSaved }: { beneficiaries: Beneficiary[]; rate: number; canManage: boolean; onClose: () => void; onSaved: () => void }) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Draft[]>(beneficiaries.map(toDraft));
  const [eurAzn, setEurAzn] = useState(String(rate));
  const [busy, setBusy] = useState(false);

  const fail = (err: unknown) => {
    const code = errorCode(err);
    const k = `settlement.errors.${code}`;
    const s = t(k);
    toast.error(s === k ? t('settlement.errors.generic') : s);
  };

  const payload = (d: Draft) => ({
    name: d.name.trim(),
    rule: d.rule,
    value: d.rule === 'FIXED' ? Math.round(Number(d.value.replace(',', '.')) * 100) || 0 : d.rule === 'PERCENT_OF_NET' ? Math.round(Number(d.value.replace(',', '.')) * 100) || 0 : 0,
    currency: d.rule === 'FIXED' ? d.currency : null,
    active: d.active,
  });

  const saveRow = async (i: number) => {
    const d = rows[i]!;
    if (!d.name.trim()) return;
    setBusy(true);
    try {
      if (d.id) await api.patch(`/admin/settlements/beneficiaries/${d.id}`, payload(d));
      else {
        const { data } = await api.post<{ beneficiary: Beneficiary }>('/admin/settlements/beneficiaries', payload(d));
        setRows((r) => r.map((x, j) => (j === i ? toDraft(data.beneficiary) : x)));
      }
      toast.success(t('settlement.rules.saved'));
      onSaved();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (i: number) => {
    const d = rows[i]!;
    if (d.id && !(await confirmDialog({ message: t('settlement.rules.confirmDelete', { name: d.name }), confirmLabel: t('ui.confirmDlg.delete') }))) return;
    try {
      if (d.id) await api.delete(`/admin/settlements/beneficiaries/${d.id}`);
      setRows((r) => r.filter((_, j) => j !== i));
      onSaved();
    } catch (err) {
      fail(err);
    }
  };

  const saveRate = async () => {
    const n = Number(eurAzn.replace(',', '.'));
    if (!(n > 0)) return;
    try {
      await api.put('/admin/settlements/settings', { eurAzn: n });
      toast.success(t('settlement.rules.saved'));
      onSaved();
    } catch (err) {
      fail(err);
    }
  };

  const set = (i: number, patch: Partial<Draft>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Modal wide title={t('settlement.rules.title')} onClose={onClose}>
      <p className="text-sm text-muted">{t('settlement.rules.hint')}</p>
      {!canManage && <p className="mt-2 text-sm font-medium text-warning-fg">{t('settlement.rules.readOnly')}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="px-2 py-1 text-left">{t('settlement.rules.name')}</th>
              <th className="px-2 py-1 text-left">{t('settlement.rules.rule')}</th>
              <th className="px-2 py-1 text-left">{t('settlement.rules.value')}</th>
              <th className="px-2 py-1 text-left">{t('settlement.rules.currency')}</th>
              <th className="px-2 py-1 text-center">{t('settlement.rules.active')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((d, i) => (
              <tr key={d.id ?? `new-${i}`} className="border-t border-line">
                <td className="px-2 py-1.5">
                  <input className="input py-1.5" value={d.name} disabled={!canManage} maxLength={80} onChange={(e) => set(i, { name: e.target.value })} />
                </td>
                <td className="px-2 py-1.5">
                  <select className="input py-1.5" value={d.rule} disabled={!canManage} onChange={(e) => set(i, { rule: e.target.value as Rule })}>
                    {RULES.map((r) => (
                      <option key={r} value={r}>
                        {t(`settlement.rules.ruleNames.${r}`)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  {(d.rule === 'FIXED' || d.rule === 'PERCENT_OF_NET') && (
                    <div className="flex items-center gap-1">
                      <input className="input w-24 py-1.5" inputMode="decimal" value={d.value} disabled={!canManage} onChange={(e) => set(i, { value: e.target.value })} />
                      {d.rule === 'PERCENT_OF_NET' && <span className="text-muted">{t('settlement.rules.percent')}</span>}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {d.rule === 'FIXED' && (
                    <select className="input w-24 py-1.5" value={d.currency} disabled={!canManage} onChange={(e) => set(i, { currency: e.target.value as Currency })}>
                      <option value="AZN">AZN</option>
                      <option value="EUR">EUR</option>
                    </select>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input type="checkbox" className="size-4 accent-primary" checked={d.active} disabled={!canManage} onChange={(e) => set(i, { active: e.target.checked })} />
                </td>
                <td className="px-2 py-1.5">
                  {canManage && (
                    <span className="flex justify-end gap-1">
                      <button type="button" className="rounded-lg p-1.5 text-link hover:bg-primary/[0.06]" disabled={busy} title={t('settlement.toolbar.save')} onClick={() => void saveRow(i)}>
                        <Save className="size-4" />
                      </button>
                      <button type="button" className="rounded-lg p-1.5 text-danger-fg hover:bg-danger-bg" title={t('settlement.rules.delete')} onClick={() => void remove(i)}>
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canManage && (
        <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => setRows((r) => [...r, { name: '', rule: 'REMAINDER', value: '', currency: 'AZN', active: true }])}>
          <Plus className="size-4" /> {t('settlement.rules.add')}
        </button>
      )}
      <div className="mt-6 flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <label className="block">
          <span className="label">{t('settlement.rules.rate')}</span>
          <input className="input w-32" inputMode="decimal" value={eurAzn} disabled={!canManage} onChange={(e) => setEurAzn(e.target.value)} />
        </label>
        {canManage && (
          <button type="button" className="btn-primary btn-sm" onClick={() => void saveRate()}>
            {t('settlement.rules.saveRate')}
          </button>
        )}
      </div>
    </Modal>
  );
};
