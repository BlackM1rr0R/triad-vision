import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, ExternalLink, FileText, Save, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAvv } from '@/i18n/pagesAvv';
import { pagesTrust } from '@/i18n/pagesTrust';
import { ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { fmtDate } from '@/components/admin/labels';
import { TONE_CLASS } from '@/components/ui/status';
import { Spinner } from '@/components/ui/Spinner';

registerCopy(pagesAvv);
registerCopy(pagesTrust);

interface TrustSettings {
  dataLocation: string;
  dataLocationConfirmed: boolean;
  backupLocation: string;
  securityEmail: string;
  note: string;
}
interface AdminTrust {
  trust: TrustSettings;
  avv: { approved: boolean; approvedVersion: string | null; approvedAt: string | null; effective: boolean; templateVersion: string };
  measures: { key: string; category: string; de: string; evidence: string }[];
  subprocessors: { key: string; name: string; purposeDe: string; locationDe: string; optional: boolean }[];
  agreements: { id: string; companyId: string; companyName: string; status: string; templateVersion: string; createdAt: string; completedAt: string | null; companySigned: boolean; countersigned: boolean }[];
}

const KEY = ['admin', 'trust'] as const;

/** Admin › Trust Center & AVV (/admin/trust, ADMIN+): owner facts, AVV template approval (default OFF), agreements. */
export default function AdminTrust() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<AdminTrust>('/admin/trust')).data });
  const [form, setForm] = useState<TrustSettings | null>(null);
  const approve = useMutation({
    mutationFn: async (approved: boolean) => (await api.put('/admin/trust/avv-approval', { approved })).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: () => toast.error(t('avv.company.errors.default')),
  });
  const save = useMutation({
    mutationFn: async (v: TrustSettings) => (await api.put('/admin/trust/settings', v)).data,
    onSuccess: () => {
      toast.success(t('avv.admin.saved'));
      setForm(null);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: () => toast.error(t('avv.company.errors.INVALID_VALUES')),
  });

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const f = form ?? d.trust;
  const set = <K extends keyof TrustSettings>(k: K, v: TrustSettings[K]) => setForm({ ...f, [k]: v });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(f);
  };

  return (
    <div className="space-y-6">
      <PageHead
        title={t('admin.nav.trust')}
        subtitle={t('avv.admin.subtitle')}
        actions={
          <Link to="/trust" target="_blank" className="btn-secondary btn-sm">
            <ExternalLink className="size-4" aria-hidden />
            /trust
          </Link>
        }
      />

      <div className={clsx('flex items-start gap-3 rounded-2xl border border-warning-border px-4 py-3 text-sm', TONE_CLASS.warning)} role="alert">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p className="font-semibold">{t('avv.admin.lawyerBanner')}</p>
      </div>

      <Panel title={t('avv.admin.approvedLabel')} icon={ShieldCheck}>
        <div className="space-y-3 p-5 sm:p-6">
          <Switch checked={d.avv.effective} disabled={approve.isPending} onChange={(v) => approve.mutate(v)} label={t('avv.admin.approvedLabel')} />
          <p className="text-sm text-muted">{t('avv.admin.approvedHint', { version: d.avv.templateVersion })}</p>
          {d.avv.effective && d.avv.approvedAt && <p className="text-xs text-muted">{t('avv.admin.approvedOn', { date: fmtDate(d.avv.approvedAt) })}</p>}
          <div className="flex flex-wrap gap-2">
            <a href="/api/admin/trust/avv-sample.pdf" target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
              <FileText className="size-4" aria-hidden />
              {t('avv.admin.sample')}
            </a>
            <Link to="/admin/countersign" className="btn-secondary btn-sm">
              {t('avv.admin.countersignLink')}
            </Link>
          </div>
        </div>
      </Panel>

      <Panel title={t('avv.admin.trustTitle')}>
        <form className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6" onSubmit={onSubmit}>
          <p className="text-sm text-muted sm:col-span-2">{t('avv.admin.trustHint')}</p>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="tr-loc">
              {t('avv.admin.dataLocation')}
            </label>
            <input id="tr-loc" className="input" maxLength={200} value={f.dataLocation} onChange={(e) => set('dataLocation', e.target.value)} />
            <p className="mt-1 text-xs text-muted">{t('avv.admin.dataLocationHint')}</p>
          </div>
          <div className="sm:col-span-2">
            <Switch checked={f.dataLocationConfirmed} onChange={(v) => set('dataLocationConfirmed', v)} label={t('avv.admin.dataLocationConfirmed')} />
          </div>
          <div>
            <label className="label" htmlFor="tr-bk">
              {t('avv.admin.backupLocation')}
            </label>
            <input id="tr-bk" className="input" maxLength={200} value={f.backupLocation} onChange={(e) => set('backupLocation', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="tr-sec">
              {t('avv.admin.securityEmail')}
            </label>
            <input id="tr-sec" type="email" className="input" maxLength={200} value={f.securityEmail} onChange={(e) => set('securityEmail', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="tr-note">
              {t('avv.admin.note')}
            </label>
            <textarea id="tr-note" className="input" rows={3} maxLength={1000} value={f.note} onChange={(e) => set('note', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {save.isPending ? <Spinner className="size-4" /> : <Save className="size-4" aria-hidden />}
              {t('avv.admin.save')}
            </button>
          </div>
        </form>
      </Panel>

      <Panel title={t('avv.admin.measuresTitle')}>
        <ul className="divide-y divide-line text-sm">
          {d.measures.map((m) => (
            <li key={m.key} className="px-5 py-3 sm:px-6">
              <p className="text-ink">{m.de}</p>
              <p className="mt-0.5 text-xs text-muted">
                {t('avv.admin.evidence')}: <code>{m.evidence}</code>
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={t('avv.admin.subsTitle')}>
        <ul className="divide-y divide-line text-sm">
          {d.subprocessors.map((s) => (
            <li key={s.key} className="px-5 py-3 sm:px-6">
              <p className="font-semibold text-ink">
                {s.name} {s.optional && <span className="badge ml-1">{t('avv.admin.optional')}</span>}
              </p>
              <p className="text-xs text-muted">
                {s.purposeDe} · {s.locationDe}
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={t('avv.admin.agreementsTitle')}>
        {!d.agreements.length ? (
          <p className="px-5 py-4 text-sm text-muted sm:px-6">{t('avv.admin.noAgreements')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-5 py-2 sm:px-6">{t('avv.admin.company')}</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">{t('avv.admin.companySigned')}</th>
                  <th className="px-3 py-2">{t('avv.admin.countersigned')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.agreements.map((a) => (
                  <tr key={a.id}>
                    <td className="px-5 py-2 sm:px-6">
                      <Link to={`/admin/companies/${a.companyId}`} className="font-semibold text-link hover:underline">
                        {a.companyName}
                      </Link>
                      <p className="text-xs text-muted">
                        {fmtDate(a.createdAt)} · {a.templateVersion}
                      </p>
                    </td>
                    <td className="px-3 py-2">{t(`avv.company.status.${a.status}`)}</td>
                    <td className="px-3 py-2">{a.companySigned ? '✓' : '—'}</td>
                    <td className="px-3 py-2">{a.countersigned ? '✓' : '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted">{a.completedAt ? fmtDate(a.completedAt) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
