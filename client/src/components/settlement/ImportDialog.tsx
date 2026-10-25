import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { FileUp, Loader2, ShieldAlert } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { Modal } from './Modal';
import { STAGE_CHIP } from './money';
import type { Stage } from './types';

interface Report {
  dryRun: boolean;
  sheets: { name: string; kind: 'project' | 'partner' | 'skipped'; partner: string | null; rows: number; created: number; updated: number; skippedEmpty: number }[];
  rows: number;
  created: number;
  updated: number;
  newPartners: string[];
  warnings: string[];
  skippedCredentials: number;
  preview: { sheet: string; row: number; partner: string | null; clientName: string; licence: string | null; employer: string | null; stage: Stage; tlsDate: string | null; visaDate: string | null; amount: string | null; partnerShare: string | null; action: 'create' | 'update' }[];
}

/** Excel import: choose a file → dry-run preview → confirm. */
export const ImportDialog = ({ onClose, onDone }: { onClose: () => void; onDone: () => void }) => {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (f: File, dryRun: boolean) => {
    const fd = new FormData();
    fd.append('file', f);
    const { data } = await api.post<Report>(`/admin/settlements/import${dryRun ? '?dryRun=1' : ''}`, fd);
    return data;
  };

  const errText = (err: unknown) => {
    const code = errorCode(err);
    const k = `settlement.errors.${code}`;
    const s = t(k);
    return s === k ? t('settlement.errors.generic') : s;
  };

  const choose = async (f: File | null) => {
    setFile(f);
    setReport(null);
    if (!f) return;
    setBusy(true);
    try {
      setReport(await send(f, true));
    } catch (err) {
      toast.error(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await send(file, false);
      toast.success(t('settlement.import.done', { created: r.created, updated: r.updated }));
      onDone();
      onClose();
    } catch (err) {
      toast.error(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={t('settlement.import.title')}
      onClose={onClose}
      footer={
        <button type="button" className="btn-primary btn-sm" disabled={!report || busy || !report.rows} onClick={() => void confirm()}>
          {busy && report ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
          {t('settlement.import.confirm')}
        </button>
      }
    >
      <p className="text-sm text-muted">{t('settlement.import.hint')}</p>
      <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line bg-sunken px-4 py-3 text-sm hover:border-line-strong">
        <FileUp className="size-5 text-link" />
        <span className="min-w-0 flex-1 truncate">{file ? file.name : t('settlement.import.choose')}</span>
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => void choose(e.target.files?.[0] ?? null)} />
      </label>
      {busy && !report && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> {t('settlement.import.previewing')}
        </p>
      )}
      {report && (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            {(['rows', 'created', 'updated'] as const).map((k) => (
              <div key={k} className="rounded-xl border border-line bg-sunken p-3">
                <div className="text-xl font-bold tabular-nums">{report[k]}</div>
                <div className="text-xs text-muted">{t(`settlement.import.${k}`)}</div>
              </div>
            ))}
          </div>
          {report.skippedCredentials > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-warning-bg p-3 text-sm text-warning-fg">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              {t('settlement.import.skippedCredentials', { count: report.skippedCredentials })}
            </p>
          )}
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('settlement.import.sheets')}</h3>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[420px] text-sm">
                <tbody>
                  {report.sheets.map((s) => (
                    <tr key={s.name} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2 text-muted">{t(`settlement.import.kind.${s.kind}`)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.rows}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted tabular-nums">
                        +{s.created} · ↻{s.updated}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {report.newPartners.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t('settlement.import.newPartners')}</h3>
              <div className="flex flex-wrap gap-1.5">
                {report.newPartners.map((p) => (
                  <span key={p} className="badge bg-primary/[0.06] text-link">
                    {p}
                  </span>
                ))}
              </div>
            </section>
          )}
          {report.warnings.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t('settlement.import.warnings')}</h3>
              <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-muted">
                {report.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('settlement.import.previewRows')}</h3>
            <div className="max-h-72 overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="sticky top-0 bg-sunken text-muted">
                  <tr>
                    <th className="px-2 py-1.5 text-left">{t('settlement.import.sheets')}</th>
                    <th className="px-2 py-1.5 text-left">{t('settlement.cols.partner')}</th>
                    <th className="px-2 py-1.5 text-left">{t('settlement.cols.client')}</th>
                    <th className="px-2 py-1.5 text-left">{t('settlement.cols.employer')}</th>
                    <th className="px-2 py-1.5 text-left">{t('settlement.cols.stage')}</th>
                    <th className="px-2 py-1.5 text-right">{t('settlement.cols.amount')}</th>
                    <th className="px-2 py-1.5 text-right">{t('settlement.cols.partnerShare')}</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {report.preview.slice(0, 100).map((p) => (
                    <tr key={`${p.sheet}:${p.row}`} className="border-t border-line">
                      <td className="px-2 py-1">{p.sheet}</td>
                      <td className="px-2 py-1">{p.partner ?? ''}</td>
                      <td className="px-2 py-1 font-medium">
                        {p.clientName}
                        {p.licence ? ` (${p.licence})` : ''}
                      </td>
                      <td className="px-2 py-1">{p.employer ?? ''}</td>
                      <td className="px-2 py-1">
                        <span className={clsx('rounded px-1.5 py-0.5 font-semibold', STAGE_CHIP[p.stage])}>{t(`settlement.stage.${p.stage}`)}</span>
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{p.amount ?? ''}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{p.partnerShare ?? ''}</td>
                      <td className="px-2 py-1 text-muted">{t(`settlement.import.action.${p.action}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
};
