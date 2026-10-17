import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Download, FileSignature, FileText, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesContracts } from '@/i18n/pagesContracts';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { toastError } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { BLANK, placeholderLabelKey, usePlaceholders, type ContractTemplate, type Preview } from './shared';

registerCopy(pagesContracts);

/** Rendered contract text with filled values tinted and blanks highlighted (titles / headings bolded). */
export const PreviewText = ({ preview }: { preview: Preview }) => {
  const { t } = useTranslation();
  return (
    <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-line bg-card p-4 font-serif text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
      {preview.segments.map((s, i) =>
        'text' in s ? (
          <span key={i}>{s.text}</span>
        ) : s.value ? (
          <mark key={i} className="rounded bg-brand-100/70 px-0.5 text-inherit" title={t(placeholderLabelKey(s.key), { defaultValue: s.key })}>
            {s.value}
          </mark>
        ) : (
          <mark key={i} className="rounded bg-amber-200 px-0.5 font-sans text-amber-900" title={t(placeholderLabelKey(s.key), { defaultValue: s.key })}>
            {BLANK}
          </mark>
        ),
      )}
    </div>
  );
};

const useDebounced = <T,>(value: T, ms: number) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
};

/**
 * "Create contract from template": pick a template, fill the input placeholders, see a live preview with
 * blanks highlighted, then download the PDF or send it for e-signature (through the e-sign module).
 */
export const FromTemplateDialog = ({ open, onClose, caseId, caseNumber }: { open: boolean; onClose: () => void; caseId: string; caseNumber: string }) => {
  const { t } = useTranslation();
  const { data: defs } = usePlaceholders();
  const { data: templates, isLoading: loadingTemplates } = useQuery({
    queryKey: ['contract-templates', 'active'],
    queryFn: async () => (await api.get<{ items: ContractTemplate[] }>('/admin/contract-templates', { params: { active: 'true' } })).data.items,
    enabled: open,
  });
  const [templateId, setTemplateId] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSentId(null);
    if (!templateId && templates?.length) setTemplateId((templates.find((x) => x.isDefault) ?? templates[0]).id);
  }, [open, templates, templateId]);

  const template = templates?.find((x) => x.id === templateId);
  const inputDefs = useMemo(() => (defs ?? []).filter((d) => d.input && template?.placeholders.includes(d.key)), [defs, template]);
  const debouncedInputs = useDebounced(inputs, 350);
  const body = useMemo(() => ({ caseId, inputs: Object.fromEntries(Object.entries(debouncedInputs).filter(([, v]) => v.trim())) }), [caseId, debouncedInputs]);

  const preview = useQuery({
    queryKey: ['contract-preview', templateId, body],
    queryFn: async () => (await api.post<Preview>(`/admin/contract-templates/${templateId}/preview`, body)).data,
    enabled: open && !!templateId,
    placeholderData: (prev) => prev,
  });

  const requestBody = () => ({ caseId, inputs: Object.fromEntries(Object.entries(inputs).filter(([, v]) => v.trim())) });

  const download = async () => {
    if (!template) return;
    setDownloading(true);
    try {
      const res = await api.post<Blob>(`/admin/contract-templates/${template.id}/pdf`, requestBody(), { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.name.replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'Vertrag'}-${caseNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toastError(err);
    } finally {
      setDownloading(false);
    }
  };

  const send = async () => {
    if (!template) return;
    setSending(true);
    try {
      const res = await api.post<{ signatureRequestId: string; caseContract: boolean }>(`/admin/contract-templates/${template.id}/send`, requestBody());
      setConfirming(false);
      setSentId(res.data.signatureRequestId);
      toast.success(res.data.caseContract ? t('contractTpl.dialog.sentCaseContract') : t('contractTpl.dialog.sent'));
    } catch (err) {
      toastError(err);
    } finally {
      setSending(false);
    }
  };

  const missing = preview.data?.missing ?? [];
  const recipients = template?.kind === 'SERVICE' ? t('contractTpl.dialog.sendConfirmStaff') : t('contractTpl.dialog.sendConfirmCompany');

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            <FileSignature className="size-4 text-brand-600" aria-hidden /> {t('contractTpl.dialog.title')}
          </span>
        }
        description={t('contractTpl.dialog.description', { number: caseNumber })}
        footer={
          <>
            <button type="button" className="btn-white btn-sm border border-line" disabled={!template || downloading} onClick={() => void download()}>
              {downloading ? <Spinner className="size-3.5" /> : <Download className="size-3.5" />} {t('contractTpl.dialog.download')}
            </button>
            <button type="button" className="btn-primary btn-sm" disabled={!template || sending || !!sentId} onClick={() => setConfirming(true)}>
              <Send className="size-3.5" /> {t('contractTpl.dialog.send')}
            </button>
          </>
        }
      >
        {loadingTemplates ? (
          <div className="grid min-h-40 place-items-center text-brand-600">
            <Spinner className="size-6" />
          </div>
        ) : !templates?.length ? (
          <p className="py-6 text-center text-sm text-muted">{t('contractTpl.dialog.noTemplates')}</p>
        ) : (
          <div className="grid gap-4">
            {sentId && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" aria-hidden /> {t('contractTpl.dialog.sent')}
                </span>
                <Link to={`/admin/signatures?open=${sentId}`} className="font-semibold underline" onClick={onClose}>
                  {t('contractTpl.dialog.openSignature')}
                </Link>
              </div>
            )}
            <div>
              <label htmlFor="ftd-template" className="label">
                {t('contractTpl.dialog.template')}
              </label>
              <select
                id="ftd-template"
                className="input"
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  setSentId(null);
                }}
              >
                {templates.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} · {t(`contractTpl.kinds.${x.kind}`)} · {x.language.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {inputDefs.length > 0 && (
              <fieldset>
                <legend className="label">{t('contractTpl.dialog.inputs')}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {inputDefs.map((d) => (
                    <div key={d.key}>
                      <label htmlFor={`ftd-${d.key}`} className="mb-1 block text-xs text-muted">
                        {t(placeholderLabelKey(d.key))}
                      </label>
                      <input
                        id={`ftd-${d.key}`}
                        className="input"
                        type={d.type === 'date' ? 'date' : d.type === 'number' ? 'number' : 'text'}
                        min={d.type === 'number' ? 0 : undefined}
                        maxLength={500}
                        value={inputs[d.key] ?? ''}
                        onChange={(e) => setInputs((v) => ({ ...v, [d.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>
            )}

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="label mb-0">{t('contractTpl.dialog.preview')}</span>
                {preview.isFetching && <Spinner className="size-3.5 text-brand-600" />}
              </div>
              {preview.data ? (
                <PreviewText preview={preview.data} />
              ) : preview.error ? (
                <p className="text-sm text-danger">{t('admin.common.loadFailed')}</p>
              ) : (
                <div className="grid min-h-32 place-items-center rounded-lg border border-line text-brand-600">
                  <Spinner className="size-5" />
                </div>
              )}
              {preview.data && (
                <p className={clsx('mt-2 flex items-start gap-1.5 text-xs', missing.length ? 'text-amber-800' : 'text-emerald-700')}>
                  {missing.length ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                  {missing.length
                    ? t('contractTpl.dialog.missing', { keys: missing.map((k) => t(placeholderLabelKey(k), { defaultValue: k })).join(', ') })
                    : t('contractTpl.dialog.allFilled')}
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void send()}
        tone="primary"
        loading={sending}
        title={t('contractTpl.dialog.send')}
        confirmLabel={t('contractTpl.dialog.send')}
        message={
          <>
            {t('contractTpl.dialog.sendConfirm', { company: recipients })}
            {missing.length > 0 && <span className="mt-2 block text-amber-800">{t('contractTpl.dialog.missingWarn')}</span>}
          </>
        }
      />
    </>
  );
};

/** Small button for the admin case header that opens the dialog. */
export const FromTemplateButton = ({ caseId, caseNumber }: { caseId: string; caseNumber: string }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="-my-2 inline-flex min-h-10 items-center gap-1 text-xs font-semibold whitespace-nowrap text-brand-600 hover:text-brand-700"
        onClick={() => setOpen(true)}
      >
        <FileText className="size-3.5" /> {t('contractTpl.dialog.open')}
      </button>
      {open && <FromTemplateDialog open={open} onClose={() => setOpen(false)} caseId={caseId} caseNumber={caseNumber} />}
    </>
  );
};
