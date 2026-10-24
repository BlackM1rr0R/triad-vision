import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileText, Send, Undo2, Wand2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesOfficialForms } from '@/i18n/pagesOfficialForms';
import { Panel, Switch } from '@/components/admin/ui';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { fmtDateTime } from '@/components/admin/labels';
import { goToCaseSection } from '@/components/admin/case/sections';
import { TONE_CLASS } from '@/components/ui/status';
import { Spinner } from '@/components/ui/Spinner';
import { FILL_TONE, fillFileUrl, toastFormError, type CaseFormEntry, type CaseFormResolution, type Fill, type MissingEntry } from './api';

registerCopy(pagesOfficialForms);

/**
 * Case page (Sənədlər tab): the official forms of the case — status of the latest fill, missing data with links
 * to where it is fixed, fill / re-generate with per-field overrides, download, data sheet, and for the
 * Erklärung zum Beschäftigungsverhältnis "Send to employer" (company portal + e-signature).
 */
export const CaseOfficialFormsPanel = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ['official-forms', 'case', caseId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: async () => (await api.get<{ companyId: string | null; forms: CaseFormEntry[] }>(`/admin/cases/${caseId}/official-forms`)).data });
  const [open, setOpen] = useState<CaseFormEntry | null>(null);
  const [confirmSend, setConfirmSend] = useState<CaseFormEntry | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const send = useMutation({
    mutationFn: async (k: string) => (await api.post(`/admin/cases/${caseId}/official-forms/${k}/send-to-employer`)).data,
    onSuccess: () => {
      toast.success(t('officialForms.panel.sent'));
      setConfirmSend(null);
      void refresh();
    },
    onError: toastFormError,
  });
  const withdraw = useMutation({
    mutationFn: async (fillId: string) => (await api.post(`/admin/official-forms/fills/${fillId}/withdraw`)).data,
    onSuccess: () => {
      toast.success(t('officialForms.panel.withdrawn'));
      void refresh();
    },
    onError: toastFormError,
  });
  const submitted = useMutation({
    mutationFn: async (fillId: string) => (await api.post(`/admin/official-forms/fills/${fillId}/submitted`)).data,
    onSuccess: () => {
      toast.success(t('officialForms.panel.submitted'));
      void refresh();
    },
    onError: toastFormError,
  });

  return (
    <Panel
      id="case-official-forms"
      title={t('officialForms.panel.title')}
      icon={FileText}
      actions={
        <Link to="/admin/official-forms" className="text-xs font-semibold text-brand-700 hover:underline">
          {t('officialForms.panel.installLink')}
        </Link>
      }
      bodyClassName="p-0"
    >
      <p className="px-5 pt-4 text-xs text-muted sm:px-6">{t('officialForms.panel.subtitle')}</p>
      {isLoading ? (
        <div className="grid place-items-center py-8 text-brand-600">
          <Spinner />
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {(data?.forms ?? []).map((f) => {
            const latest = f.latest;
            const status = latest?.status ?? 'NONE';
            const missing = (latest?.missing ?? []) as MissingEntry[];
            return (
              <li key={f.key} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4 sm:px-6">
                <div className="min-w-0 flex-[1_1_16rem]">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-navy-900">{f.title}</span>
                    <span className={clsx('badge', TONE_CLASS[FILL_TONE[status]])}>{t(`officialForms.panel.status.${status}`)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {f.template ? t('officialForms.panel.version', { version: f.template.version }) : t('officialForms.panel.notInstalled')}
                    {latest?.generatedAt ? ` · ${t('officialForms.panel.generatedAt', { date: fmtDateTime(latest.generatedAt) })}` : ''}
                  </p>
                  {latest && latest.status !== 'SIGNED' && latest.status !== 'SUBMITTED' && (
                    <p className={clsx('mt-1 flex items-center gap-1 text-xs', missing.length ? 'text-warning-fg' : 'text-success-fg')}>
                      {missing.length ? <AlertTriangle className="size-3.5" aria-hidden /> : <CheckCircle2 className="size-3.5" aria-hidden />}
                      {missing.length ? t('officialForms.panel.missing', { count: missing.length }) : t('officialForms.panel.allFilled')}
                    </p>
                  )}
                  {latest?.status === 'SENT_TO_EMPLOYER' && <p className="mt-1 text-xs text-muted">{t('officialForms.panel.waitingSignature')}</p>}
                  {f.employerForm && !data?.companyId && <p className="mt-1 text-xs text-muted">{t('officialForms.panel.noEmployer')}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {f.template && latest?.status !== 'SENT_TO_EMPLOYER' && (
                    <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(f)}>
                      <Wand2 className="size-3.5" aria-hidden />
                      {latest ? t('officialForms.panel.refill') : t('officialForms.panel.fill')}
                    </button>
                  )}
                  {latest?.hasFile && (
                    <a className="btn-secondary btn-sm" href={fillFileUrl(latest.id)} target="_blank" rel="noreferrer">
                      <Download className="size-3.5" aria-hidden />
                      {t('officialForms.panel.download')}
                    </a>
                  )}
                  {f.canSendToEmployer && latest?.status !== 'SENT_TO_EMPLOYER' && latest?.status !== 'SIGNED' && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirmSend(f)}>
                      <Send className="size-3.5" aria-hidden />
                      {t('officialForms.panel.sendEmployer')}
                    </button>
                  )}
                  {latest?.status === 'SENT_TO_EMPLOYER' && (
                    <button type="button" className="btn-ghost btn-sm" disabled={withdraw.isPending} onClick={() => withdraw.mutate(latest.id)}>
                      <Undo2 className="size-3.5" aria-hidden />
                      {t('officialForms.panel.withdraw')}
                    </button>
                  )}
                  {latest && (latest.status === 'GENERATED' || latest.status === 'SIGNED') && (
                    <button type="button" className="btn-ghost btn-sm" disabled={submitted.isPending} onClick={() => submitted.mutate(latest.id)}>
                      <CheckCircle2 className="size-3.5" aria-hidden />
                      {t('officialForms.panel.markSubmitted')}
                    </button>
                  )}
                  {(f.template || f.builtIn) && (
                    <a className="btn-ghost btn-sm" href={`/api/admin/cases/${caseId}/official-forms/${f.key}/datasheet`} title={t('officialForms.panel.datasheetHint')}>
                      <FileSpreadsheet className="size-3.5" aria-hidden />
                      {t('officialForms.panel.datasheet')}
                    </a>
                  )}
                </div>
                {f.history.length > 1 && (
                  <details className="w-full text-xs text-muted">
                    <summary className="cursor-pointer">{t('officialForms.panel.history')}</summary>
                    <ul className="mt-1 space-y-0.5">
                      {f.history.slice(1).map((h: Fill) => (
                        <li key={h.id} className="flex flex-wrap gap-2">
                          <span>{t(`officialForms.panel.status.${h.status}`)}</span>
                          <span>{fmtDateTime(h.generatedAt ?? h.createdAt)}</span>
                          {h.hasFile && (
                            <a className="text-brand-700 hover:underline" href={fillFileUrl(h.id)} target="_blank" rel="noreferrer">
                              {t('officialForms.panel.open')}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {open && (
        <FillDialog
          caseId={caseId}
          entry={open}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            void refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={!!confirmSend}
        onClose={() => setConfirmSend(null)}
        onConfirm={() => confirmSend && send.mutate(confirmSend.key)}
        title={t('officialForms.panel.sendEmployer')}
        message={t('officialForms.panel.sendConfirm')}
        tone="primary"
        busy={send.isPending}
      />
    </Panel>
  );
};

const FillDialog = ({ caseId, entry, onClose, onDone }: { caseId: string; entry: CaseFormEntry; onClose: () => void; onDone: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { data, isLoading } = useQuery({
    queryKey: ['official-forms', 'case', caseId, entry.key],
    queryFn: async () => (await api.get<CaseFormResolution>(`/admin/cases/${caseId}/official-forms/${entry.key}`)).data,
  });
  const [overrides, setOverrides] = useState<Record<string, string> | null>(null);
  const [flatten, setFlatten] = useState<boolean | null>(null);
  const [showAll, setShowAll] = useState(false);
  const ov = overrides ?? data?.fieldOverrides ?? {};
  const flat = flatten ?? data?.flatten ?? false;

  const generate = useMutation({
    mutationFn: async () => (await api.post(`/admin/cases/${caseId}/official-forms/${entry.key}/fill`, { fieldOverrides: ov, flatten: flat })).data,
    onSuccess: () => {
      toast.success(t('officialForms.panel.generated'));
      onDone();
    },
    onError: toastFormError,
  });

  const setOv = (field: string, value: string | null) => {
    const next = { ...ov };
    if (value === null) delete next[field];
    else next[field] = value;
    setOverrides(next);
  };
  const fieldInfo = new Map((data?.fields ?? []).map((f) => [f.name, f]));
  const rows = (data?.rows ?? []).filter((r) => showAll || r.value || r.missing || r.overridden || r.field in ov);

  const fix = (m: MissingEntry) => {
    if (m.fix?.section) {
      onClose();
      goToCaseSection(m.fix.section);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t('officialForms.panel.fillTitle', { title: entry.title })}
      busy={generate.isPending}
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-xs text-ink/80">
            <Switch checked={flat} onChange={setFlatten} label={t('officialForms.panel.flatten')} />
            {t('officialForms.panel.flatten')}
          </label>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('admin.common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button type="button" className="btn-primary" onClick={() => generate.mutate()} disabled={!data || generate.isPending}>
            {generate.isPending ? <Spinner className="size-4" /> : <Wand2 className="size-4" aria-hidden />}
            {t('officialForms.panel.generate')}
          </button>
        </>
      }
    >
      {isLoading || !data ? (
        <div className="grid place-items-center py-10 text-brand-600">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-navy-900">{t('officialForms.panel.missingTitle')}</h3>
            {data.missing.length ? (
              <ul className="space-y-1.5">
                {data.missing.map((m) => (
                  <li key={m.source} className={clsx('flex flex-wrap items-center gap-2 rounded-md px-2.5 py-1.5 text-xs', TONE_CLASS.warning)}>
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                    <span className="font-medium">{m.label ? tr(m.label) : m.source}</span>
                    <span className="opacity-70">({m.fields.length})</span>
                    {m.fix?.href ? (
                      <Link to={m.fix.href} className="ml-auto font-semibold underline" onClick={onClose}>
                        {t('officialForms.panel.fix')}
                      </Link>
                    ) : m.fix?.section ? (
                      <button type="button" className="ml-auto font-semibold underline" onClick={() => fix(m)}>
                        {t('officialForms.panel.fix')}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={clsx('rounded-md px-2.5 py-1.5 text-xs', TONE_CLASS.success)}>{t('officialForms.panel.allFilled')}</p>
            )}
          </section>
          <section>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-navy-900">{t('officialForms.panel.overrides')}</h3>
              <button type="button" className="ml-auto text-xs font-semibold text-brand-700 hover:underline" onClick={() => setShowAll((v) => !v)}>
                {showAll ? t('officialForms.panel.showMapped') : t('officialForms.panel.showAll')}
              </button>
            </div>
            <p className="mb-2 text-xs text-muted">{t('officialForms.panel.overrideHint')}</p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {rows.map((r) => {
                const info = fieldInfo.get(r.field);
                const has = r.field in ov;
                const current = has ? ov[r.field] : r.value;
                return (
                  <li key={r.field} className={clsx('grid gap-2 px-3 py-2 text-xs sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] sm:items-center', r.missing && !has && 'bg-warning-bg/40')}>
                    <span className="min-w-0 truncate text-muted" title={r.field}>
                      {r.field}
                    </span>
                    {r.type === 'checkbox' ? (
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={has ? ['1', 'true', 'x', 'yes', 'ja', 'on'].includes(current.toLowerCase()) : !!r.checked} onChange={(e) => setOv(r.field, e.target.checked ? 'X' : '')} />
                        {(has ? ['1', 'true', 'x', 'yes', 'ja', 'on'].includes(current.toLowerCase()) : r.checked) ? t('officialForms.panel.checked') : t('officialForms.panel.unchecked')}
                      </label>
                    ) : info && info.options.length > 0 ? (
                      <select className="input py-1 text-xs" value={current} onChange={(e) => setOv(r.field, e.target.value)} aria-label={r.field}>
                        <option value="">—</option>
                        {info.options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input className="input py-1 text-xs" value={current} onChange={(e) => setOv(r.field, e.target.value)} aria-label={r.field} />
                    )}
                    {has ? (
                      <button type="button" className="text-brand-700 hover:underline" onClick={() => setOv(r.field, null)} title={t('officialForms.panel.reset')}>
                        <Undo2 className="size-3.5" aria-hidden />
                        <span className="sr-only">{t('officialForms.panel.reset')}</span>
                      </button>
                    ) : (
                      <span />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </Modal>
  );
};

export default CaseOfficialFormsPanel;
