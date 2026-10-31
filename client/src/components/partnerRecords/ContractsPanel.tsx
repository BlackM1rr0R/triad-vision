import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Download, Eye, FilePlus2, FileSignature, FileText, MoreHorizontal, Pencil, Plus, RefreshCw, Repeat, Send, Trash2, Upload, Wand2 } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPartnerRecords } from '@/i18n/pagesPartnerRecords';
import { useL10n } from '@/lib/l10n';
import { Badge, Button, IconButton, Menu, Modal, Spinner, confirmDialog } from '@/components/ui';
import { Panel } from '@/components/admin/ui';
import { fmtDate } from '@/components/admin/labels';
import {
  CONTRACT_KINDS,
  CONTRACT_STATUSES,
  STATUS_TONE,
  contractsApi,
  dayLabel,
  daysTone,
  missingLabel,
  missingOf,
  moneyLabel,
  useContractTemplates,
  useContracts,
  useRecordsMutation,
  type ContractInput,
  type MissingField,
  type PartnerContract,
  type PartnerOwner,
} from './api';

registerCopy(pagesPartnerRecords);

/**
 * Contracts of an employer or referral partner (generic: `owner` = { companyId } | { referralPartnerId }):
 * table with status, term and days left, create / edit, upload of the contract and the signed copy, "create
 * from template" (EMPLOYER / PARTNER templates, missing data listed before generating), e-signature, delete.
 * `onFillData` (optional) is offered next to missing fields, e.g. to switch to the profile's data tab.
 */
export interface ContractsPanelProps {
  owner: PartnerOwner;
  onFillData?: () => void;
  className?: string;
  /** Panel title override (default "Müqavilələr"). */
  title?: string;
}

const useDaysText = () => {
  const { t } = useTranslation();
  return (c: PartnerContract) => {
    if (c.daysLeft === null) return t('partnerRecords.contracts.openEnded');
    if (c.daysLeft === 0) return t('partnerRecords.contracts.endsToday');
    return c.daysLeft > 0 ? t('partnerRecords.contracts.daysLeft', { count: c.daysLeft }) : t('partnerRecords.contracts.endedAgo', { count: -c.daysLeft });
  };
};

const fileLink = (href: string, label: string, icon: typeof Eye) => {
  const Icon = icon;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-link hover:underline">
      <Icon className="size-3.5 shrink-0" aria-hidden /> <span className="max-w-[12rem] truncate">{label}</span>
    </a>
  );
};

export function ContractsPanel({ owner, onFillData, className, title }: ContractsPanelProps) {
  const { t } = useTranslation();
  const { locale } = useL10n();
  const daysText = useDaysText();
  const { data, isLoading, error, refetch } = useContracts(owner);
  const [editing, setEditing] = useState<PartnerContract | 'new' | null>(null);
  const [fromTemplate, setFromTemplate] = useState<{ contract?: PartnerContract } | null>(null);
  const [signing, setSigning] = useState<PartnerContract | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ id: string; slot: 'file' | 'signed' } | null>(null);

  const upload = useRecordsMutation(owner, (v: { id: string; slot: 'file' | 'signed'; file: File }) => contractsApi.upload(v.id, v.slot, v.file), { success: t('partnerRecords.contracts.uploaded') });
  const removeFile = useRecordsMutation(owner, (v: { id: string; slot: 'file' | 'signed' }) => contractsApi.removeFile(v.id, v.slot), { success: t('partnerRecords.common.deleted') });
  const remove = useRecordsMutation(owner, (id: string) => contractsApi.remove(id), { success: t('partnerRecords.common.deleted') });

  const pickFile = (id: string, slot: 'file' | 'signed') => {
    setUploadTarget({ id, slot });
    fileInput.current?.click();
  };

  const askRemove = async (c: PartnerContract) => {
    if (await confirmDialog({ title: t('partnerRecords.contracts.deleteTitle'), message: t('partnerRecords.contracts.deleteText', { title: c.title }) })) remove.mutate(c.id);
  };
  const askRemoveFile = async (c: PartnerContract, slot: 'file' | 'signed') => {
    const name = (slot === 'file' ? c.fileName : c.signedFileName) ?? '';
    if (await confirmDialog({ title: t('partnerRecords.contracts.removeFile'), message: t('partnerRecords.contracts.removeFileText', { name }) })) removeFile.mutate({ id: c.id, slot });
  };

  const actions = (c: PartnerContract) => (
    <Menu
      label={t('partnerRecords.contracts.cols.actions')}
      trigger={<IconButton icon={MoreHorizontal} label={t('partnerRecords.contracts.cols.actions')} size="sm" />}
      items={[
        { label: t('partnerRecords.common.edit'), icon: Pencil, onSelect: () => setEditing(c) },
        { label: c.hasFile ? `${t('partnerRecords.contracts.file')}: ${t('partnerRecords.contracts.replace')}` : t('partnerRecords.contracts.upload'), icon: Upload, onSelect: () => pickFile(c.id, 'file') },
        { label: t('partnerRecords.contracts.uploadSigned'), icon: FileSignature, onSelect: () => pickFile(c.id, 'signed') },
        { label: t('partnerRecords.contracts.template.regenerate'), icon: RefreshCw, onSelect: () => setFromTemplate({ contract: c }) },
        { label: t('partnerRecords.contracts.sendSignature'), icon: Send, disabled: !c.hasFile || c.mimeType !== 'application/pdf' || c.status === 'EXPIRED' || c.status === 'TERMINATED', onSelect: () => setSigning(c), hint: c.hasFile && c.mimeType !== 'application/pdf' ? 'PDF' : undefined },
        ...(c.hasFile ? [{ label: `${t('partnerRecords.contracts.file')}: ${t('partnerRecords.contracts.removeFile')}`, icon: Trash2, onSelect: () => void askRemoveFile(c, 'file') }] : []),
        ...(c.hasSignedFile ? [{ label: `${t('partnerRecords.contracts.signed')}: ${t('partnerRecords.contracts.removeFile')}`, icon: Trash2, onSelect: () => void askRemoveFile(c, 'signed') }] : []),
        'separator' as const,
        { label: t('partnerRecords.common.delete'), icon: Trash2, danger: true, onSelect: () => void askRemove(c) },
      ]}
    />
  );

  const files = (c: PartnerContract) => (
    <div className="flex flex-col gap-1">
      {c.hasFile ? (
        <span className="flex flex-wrap items-center gap-2">
          {fileLink(contractsApi.fileUrl(c.id, 'file'), c.fileName ?? t('partnerRecords.contracts.file'), FileText)}
          <a href={contractsApi.fileUrl(c.id, 'file', true)} className="text-muted hover:text-ink" aria-label={t('partnerRecords.contracts.download')} title={t('partnerRecords.contracts.download')}>
            <Download className="size-3.5" />
          </a>
        </span>
      ) : (
        <button type="button" className="inline-flex items-center gap-1 text-xs text-muted hover:text-link" onClick={() => pickFile(c.id, 'file')}>
          <Upload className="size-3.5" aria-hidden /> {t('partnerRecords.contracts.upload')}
        </button>
      )}
      {c.hasSignedFile ? (
        <span className="flex flex-wrap items-center gap-2">
          {fileLink(contractsApi.fileUrl(c.id, 'signed'), `${t('partnerRecords.contracts.signed')}`, CheckCircle2)}
          <a href={contractsApi.fileUrl(c.id, 'signed', true)} className="text-muted hover:text-ink" aria-label={t('partnerRecords.contracts.download')} title={t('partnerRecords.contracts.download')}>
            <Download className="size-3.5" />
          </a>
        </span>
      ) : (
        <button type="button" className="inline-flex items-center gap-1 text-xs text-muted hover:text-link" onClick={() => pickFile(c.id, 'signed')}>
          <FileSignature className="size-3.5" aria-hidden /> {t('partnerRecords.contracts.uploadSigned')}
        </button>
      )}
    </div>
  );

  const term = (c: PartnerContract) => (
    <div className="text-xs">
      <p className="whitespace-nowrap text-ink">
        {dayLabel(c.startDate, fmtDate)} – {c.endDate ? dayLabel(c.endDate, fmtDate) : t('partnerRecords.contracts.openEnded')}
      </p>
      {c.noticeDeadline && c.status === 'ACTIVE' && <p className={clsx('mt-0.5', daysTone(c.noticeDaysLeft))}>{t('partnerRecords.contracts.noticeBy', { date: dayLabel(c.noticeDeadline, fmtDate) })}</p>}
      {c.autoRenew && (
        <p className="mt-0.5 inline-flex items-center gap-1 text-muted">
          <Repeat className="size-3" aria-hidden /> {t('partnerRecords.contracts.autoRenew')}
        </p>
      )}
    </div>
  );

  const daysCell = (c: PartnerContract) =>
    c.status === 'ACTIVE' || c.status === 'SENT' || c.status === 'DRAFT' ? (
      <span className={clsx('text-xs font-semibold whitespace-nowrap tabular-nums', daysTone(c.daysLeft))}>{daysText(c)}</span>
    ) : (
      <span className="text-xs text-muted">—</span>
    );

  return (
    <Panel
      title={title ?? t('partnerRecords.contracts.title')}
      icon={FileText}
      className={className}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={Wand2} onClick={() => setFromTemplate({})}>
            {t('partnerRecords.contracts.fromTemplate')}
          </Button>
          <Button size="sm" icon={Plus} onClick={() => setEditing('new')}>
            {t('partnerRecords.contracts.add')}
          </Button>
        </div>
      }
    >
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file && uploadTarget) upload.mutate({ ...uploadTarget, file });
        }}
      />
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner className="size-5 text-link" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-2 text-sm text-danger-fg">
          <span>{t('admin.common.opFailed')}</span>
          <Button size="sm" variant="secondary" onClick={() => refetch()}>
            {t('admin.common.retry', { defaultValue: 'Retry' })}
          </Button>
        </div>
      ) : !data?.length ? (
        <p className="py-4 text-center text-sm text-muted">{t('partnerRecords.contracts.empty')}</p>
      ) : (
        <>
          {/* Table (md+) */}
          <div className="-mx-4 hidden overflow-x-auto sm:-mx-5 md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wide text-muted uppercase">
                  <th className="px-4 py-2 font-semibold sm:px-5">{t('partnerRecords.contracts.cols.title')}</th>
                  <th className="px-2 py-2 font-semibold">{t('partnerRecords.contracts.cols.status')}</th>
                  <th className="px-2 py-2 font-semibold">{t('partnerRecords.contracts.cols.term')}</th>
                  <th className="px-2 py-2 font-semibold">{t('partnerRecords.contracts.cols.daysLeft')}</th>
                  <th className="px-2 py-2 font-semibold">{t('partnerRecords.contracts.cols.files')}</th>
                  <th className="px-4 py-2 sm:px-5">
                    <span className="sr-only">{t('partnerRecords.contracts.cols.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="px-4 py-3 sm:px-5">
                      <button type="button" className="text-left font-semibold text-ink hover:text-link" onClick={() => setEditing(c)}>
                        {c.title}
                      </button>
                      <p className="mt-0.5 text-xs text-muted">
                        {t(`partnerRecords.contracts.kinds.${c.kind}`)}
                        {c.valueCents !== null && ` · ${moneyLabel(c.valueCents, c.currency, locale)}`}
                      </p>
                    </td>
                    <td className="px-2 py-3">
                      <Badge tone={STATUS_TONE[c.status]} dot>
                        {t(`partnerRecords.contracts.statuses.${c.status}`)}
                      </Badge>
                    </td>
                    <td className="px-2 py-3">{term(c)}</td>
                    <td className="px-2 py-3">{daysCell(c)}</td>
                    <td className="px-2 py-3">{files(c)}</td>
                    <td className="px-4 py-3 text-right sm:px-5">{actions(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Cards (mobile) */}
          <ul className="grid gap-3 md:hidden">
            {data.map((c) => (
              <li key={c.id} className="rounded-lg border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button type="button" className="text-left font-semibold text-ink" onClick={() => setEditing(c)}>
                      {c.title}
                    </button>
                    <p className="text-xs text-muted">{t(`partnerRecords.contracts.kinds.${c.kind}`)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge tone={STATUS_TONE[c.status]} dot size="sm">
                      {t(`partnerRecords.contracts.statuses.${c.status}`)}
                    </Badge>
                    {actions(c)}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
                  {term(c)}
                  {daysCell(c)}
                </div>
                <div className="mt-2 border-t border-line pt-2">{files(c)}</div>
              </li>
            ))}
          </ul>
        </>
      )}
      {upload.isPending && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <Spinner className="size-3.5" /> {t('partnerRecords.contracts.upload')}…
        </p>
      )}

      <ContractDialog owner={owner} contract={editing} onClose={() => setEditing(null)} />
      <TemplateDialog owner={owner} state={fromTemplate} onClose={() => setFromTemplate(null)} onFillData={onFillData} />
      <SignatureDialog owner={owner} contract={signing} onClose={() => setSigning(null)} />
    </Panel>
  );
}

// ─── Create / edit ──────────────────────────────────────────────────────

interface ContractForm {
  title: string;
  kind: string;
  status: string;
  startDate: string;
  endDate: string;
  signedAt: string;
  autoRenew: boolean;
  noticePeriodDays: string;
  reminderDays: string;
  value: string;
  currency: string;
  note: string;
}

const formOf = (c?: PartnerContract | null): ContractForm => ({
  title: c?.title ?? '',
  kind: c?.kind ?? 'COOPERATION',
  status: c?.status ?? 'DRAFT',
  startDate: c?.startDate ?? '',
  endDate: c?.endDate ?? '',
  signedAt: c?.signedAt ?? '',
  autoRenew: c?.autoRenew ?? false,
  noticePeriodDays: c?.noticePeriodDays != null ? String(c.noticePeriodDays) : '',
  reminderDays: String(c?.reminderDays ?? 30),
  value: c?.valueCents != null ? String(c.valueCents / 100) : '',
  currency: c?.currency ?? 'EUR',
  note: c?.note ?? '',
});

const centsOf = (v: string) => {
  const n = Number(v.replace(/\s/g, '').replace(',', '.'));
  return v.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
const intOf = (v: string) => (v.trim() && /^\d+$/.test(v.trim()) ? Number(v.trim()) : null);

const termPayload = (f: ContractForm): ContractInput => ({
  startDate: f.startDate || null,
  endDate: f.endDate || null,
  autoRenew: f.autoRenew,
  noticePeriodDays: intOf(f.noticePeriodDays),
  reminderDays: intOf(f.reminderDays) ?? 30,
  valueCents: centsOf(f.value),
  currency: f.currency.trim().toUpperCase() || 'EUR',
});

/** Term fields shared by the create / edit and the template dialogs. */
const TermFields = ({ f, setF, idp }: { f: ContractForm; setF: (f: ContractForm) => void; idp: string }) => {
  const { t } = useTranslation();
  const L = (k: string) => t(`partnerRecords.fields.${k}`);
  return (
    <>
      <div>
        <label className="label" htmlFor={`${idp}-start`}>
          {L('startDate')}
        </label>
        <input id={`${idp}-start`} type="date" className="input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor={`${idp}-end`}>
          {L('endDate')}
        </label>
        <input id={`${idp}-end`} type="date" className="input" min={f.startDate || undefined} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor={`${idp}-notice`}>
          {L('noticePeriodDays')}
        </label>
        <input id={`${idp}-notice`} inputMode="numeric" className="input" value={f.noticePeriodDays} onChange={(e) => setF({ ...f, noticePeriodDays: e.target.value })} />
        <p className="mt-1 text-[11px] text-muted">{t('partnerRecords.contracts.noticeHint')}</p>
      </div>
      <div>
        <label className="label" htmlFor={`${idp}-rem`}>
          {L('reminderDays')}
        </label>
        <input id={`${idp}-rem`} inputMode="numeric" className="input" value={f.reminderDays} onChange={(e) => setF({ ...f, reminderDays: e.target.value })} />
        <p className="mt-1 text-[11px] text-muted">{t('partnerRecords.contracts.reminderHint')}</p>
      </div>
      <div>
        <label className="label" htmlFor={`${idp}-value`}>
          {L('valueCents')}
        </label>
        <div className="flex gap-2">
          <input id={`${idp}-value`} inputMode="decimal" className="input" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
          <input aria-label={L('currency')} className="input w-20 uppercase" maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} />
        </div>
        <p className="mt-1 text-[11px] text-muted">{t('partnerRecords.contracts.valueHint')}</p>
      </div>
      <label className="flex items-start gap-2 self-center text-sm">
        <input type="checkbox" className="mt-0.5" checked={f.autoRenew} onChange={(e) => setF({ ...f, autoRenew: e.target.checked })} />
        <span>
          <span className="font-medium text-ink">{L('autoRenew')}</span>
          <span className="block text-[11px] text-muted">{t('partnerRecords.contracts.autoRenewHint')}</span>
        </span>
      </label>
    </>
  );
};

const ContractDialog = ({ owner, contract, onClose }: { owner: PartnerOwner; contract: PartnerContract | 'new' | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const existing = contract && contract !== 'new' ? contract : null;
  const [f, setF] = useState<ContractForm>(formOf(existing));
  useEffect(() => {
    if (contract) setF(formOf(existing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract]);
  const save = useRecordsMutation(
    owner,
    () => {
      const body: ContractInput = { title: f.title.trim(), kind: f.kind as ContractInput['kind'], status: f.status as ContractInput['status'], signedAt: f.signedAt || null, note: f.note.trim() || null, ...termPayload(f) };
      return existing ? contractsApi.update(existing.id, body) : contractsApi.create(owner, body);
    },
    { success: existing ? t('partnerRecords.common.saved') : t('partnerRecords.contracts.created'), onSuccess: onClose },
  );
  const L = (k: string) => t(`partnerRecords.fields.${k}`);
  return (
    <Modal
      open={!!contract}
      onClose={onClose}
      size="lg"
      title={existing ? t('partnerRecords.contracts.editTitle') : t('partnerRecords.contracts.newTitle')}
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
      busy={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('partnerRecords.common.cancel')}
          </Button>
          <Button type="submit" loading={save.isPending} disabled={f.title.trim().length < 2}>
            {t('partnerRecords.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="pc-title">
            {L('title')}
          </label>
          <input id="pc-title" className="input" required minLength={2} maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="pc-kind">
            {L('kind')}
          </label>
          <select id="pc-kind" className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {CONTRACT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`partnerRecords.contracts.kinds.${k}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pc-status">
            {L('status')}
          </label>
          <select id="pc-status" className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {CONTRACT_STATUSES.filter((s) => existing || s !== 'EXPIRED').map((s) => (
              <option key={s} value={s}>
                {t(`partnerRecords.contracts.statuses.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <TermFields f={f} setF={setF} idp="pc" />
        <div>
          <label className="label" htmlFor="pc-signed">
            {L('signedAt')}
          </label>
          <input id="pc-signed" type="date" className="input" value={f.signedAt} onChange={(e) => setF({ ...f, signedAt: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="pc-note">
            {L('note')}
          </label>
          <textarea id="pc-note" className="input min-h-20" maxLength={5000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
};

// ─── From template ──────────────────────────────────────────────────────

const MissingBox = ({ missing, onFillData }: { missing: MissingField[]; onFillData?: () => void }) => {
  const { t } = useTranslation();
  if (!missing.length)
    return (
      <p className="flex items-center gap-2 rounded-lg bg-success-bg px-3 py-2 text-xs text-success-fg">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden /> {t('partnerRecords.contracts.template.ready')}
      </p>
    );
  const labels = [...new Set(missing.map(missingLabel))];
  return (
    <div className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-fg" role="status">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="size-4 shrink-0" aria-hidden /> {t('partnerRecords.contracts.template.missingTitle')}
      </p>
      <p className="mt-1">{t('partnerRecords.contracts.template.missing', { fields: labels.join(', ') })}</p>
      {onFillData && missing.some((m) => m.group === 'company' || m.group === 'partner') && (
        <button type="button" className="mt-1.5 font-semibold underline" onClick={onFillData}>
          {t('partnerRecords.contracts.template.fillProfile')}
        </button>
      )}
    </div>
  );
};

const TemplateDialog = ({ owner, state, onClose, onFillData }: { owner: PartnerOwner; state: { contract?: PartnerContract } | null; onClose: () => void; onFillData?: () => void }) => {
  const { t } = useTranslation();
  const open = !!state;
  const existing = state?.contract ?? null;
  const templates = useContractTemplates(owner, open);
  const [templateId, setTemplateId] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('COOPERATION');
  const [f, setF] = useState<ContractForm>(formOf(existing));
  const [missing, setMissing] = useState<MissingField[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setF(formOf(existing));
    setTitle(existing?.title ?? '');
    setKind(existing?.kind ?? 'COOPERATION');
    setMissing(null);
    setTemplateId(existing?.templateId ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!templateId && templates.data?.length) setTemplateId(templates.data[0].id);
  }, [templates.data, templateId]);
  const selected = useMemo(() => templates.data?.find((x) => x.id === templateId) ?? null, [templates.data, templateId]);

  const generate = useRecordsMutation(
    owner,
    (allowMissing: boolean) =>
      contractsApi.generate(owner, { templateId, ...(existing ? { contractId: existing.id } : { kind: kind as ContractInput['kind'] }), ...(title.trim() ? { title: title.trim() } : {}), ...termPayload(f), allowMissing }),
    {
      success: t('partnerRecords.contracts.template.generated'),
      onSuccess: onClose,
    },
  );
  // 422: keep the dialog open and show what is missing (the shared onError toast is replaced here)
  const run = (allowMissing: boolean) =>
    generate.mutateAsync(allowMissing).catch((err) => {
      const m = missingOf(err);
      if (m) setMissing(m);
    });

  const kindName = 'companyId' in owner && owner.companyId ? 'EMPLOYER' : 'PARTNER';
  const ownerMissing = selected?.missing ?? [];
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={existing ? t('partnerRecords.contracts.template.regenerate') : t('partnerRecords.contracts.template.title')}
      description={t('partnerRecords.contracts.template.hint')}
      busy={generate.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('partnerRecords.common.cancel')}
          </Button>
          {missing && missing.length > 0 && (
            <Button variant="secondary" icon={FilePlus2} loading={generate.isPending} onClick={() => void run(true)}>
              {t('partnerRecords.contracts.template.generateAnyway')}
            </Button>
          )}
          <Button icon={Wand2} loading={generate.isPending} disabled={!templateId} onClick={() => void run(false)}>
            {t('partnerRecords.contracts.template.generate')}
          </Button>
        </>
      }
    >
      {templates.isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner className="size-5 text-link" />
        </div>
      ) : !templates.data?.length ? (
        <div className="space-y-3 text-sm">
          <p className="text-muted">{t('partnerRecords.contracts.template.none', { kind: t(`contractTpl.kinds.${kindName}`, { defaultValue: kindName }) })}</p>
          <Link to="/admin/contract-templates" className="font-semibold text-link hover:underline">
            {t('partnerRecords.contracts.template.manage')}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="pt-template">
                {t('partnerRecords.contracts.template.pick')}
              </label>
              <select
                id="pt-template"
                className="input"
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  setMissing(null);
                }}
              >
                {templates.data.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} · {x.language.toUpperCase()}
                    {x.missing.length ? ` (⚠ ${x.missing.length})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <MissingBox missing={missing ?? ownerMissing} onFillData={onFillData ? () => (onClose(), onFillData()) : undefined} />
            </div>
            <div className={existing ? 'sm:col-span-2' : undefined}>
              <label className="label" htmlFor="pt-title">
                {t('partnerRecords.fields.title')}
              </label>
              <input id="pt-title" className="input" maxLength={200} placeholder={selected?.name} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            {!existing && (
              <div>
                <label className="label" htmlFor="pt-kind">
                  {t('partnerRecords.fields.kind')}
                </label>
                <select id="pt-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
                  {CONTRACT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`partnerRecords.contracts.kinds.${k}`)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <TermFields f={f} setF={setF} idp="pt" />
          </div>
        </div>
      )}
    </Modal>
  );
};

// ─── E-signature ────────────────────────────────────────────────────────

const SignatureDialog = ({ owner, contract, onClose }: { owner: PartnerOwner; contract: PartnerContract | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (contract) {
      setName('');
      setEmail('');
      setMessage('');
    }
  }, [contract]);
  const send = useRecordsMutation(
    owner,
    () => contractsApi.sendSignature(contract!.id, { signer: name.trim() && email.trim() ? { name: name.trim(), email: email.trim().toLowerCase() } : null, message: message.trim() || null }),
    { success: t('partnerRecords.contracts.sent'), onSuccess: onClose },
  );
  return (
    <Modal
      open={!!contract}
      onClose={onClose}
      title={t('partnerRecords.contracts.sendSignatureTitle')}
      description={t('partnerRecords.contracts.sendSignatureText')}
      busy={send.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('partnerRecords.common.cancel')}
          </Button>
          <Button icon={Send} loading={send.isPending} disabled={!!email.trim() !== !!name.trim()} onClick={() => send.mutate(undefined)}>
            {t('partnerRecords.contracts.sendSignature')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-sm font-semibold text-ink">{contract?.title}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ps-name">
              {t('partnerRecords.contracts.signerName')}
            </label>
            <input id="ps-name" className="input" maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ps-email">
              {t('partnerRecords.contracts.signerEmail')}
            </label>
            <input id="ps-email" type="email" className="input" maxLength={191} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <p className="text-[11px] text-muted">{t('partnerRecords.contracts.signerHint')}</p>
        <div>
          <label className="label" htmlFor="ps-msg">
            {t('partnerRecords.contracts.message')}
          </label>
          <textarea id="ps-msg" className="input min-h-20" maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
};

export default ContractsPanel;
