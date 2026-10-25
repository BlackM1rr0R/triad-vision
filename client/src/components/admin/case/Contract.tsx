import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FileSignature, FileUp, Fingerprint, Globe, Monitor, User } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CaseDetail } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDateTime, toastError } from '../labels';
import { Panel } from '../ui';
import { DocIcon, DocLinks, uploadCaseDocument, useCaseRefresh } from './shared';
import { SendContractForSignature } from '@/components/esign/CaseSignatures';
import { ContractCheckButton } from '@/components/aiCase/ContractCheckButton';

/** PDF picker that uploads a contract (stage CONTRACT). The server sends it to the client and moves the status. */
export const ContractUpload = ({
  c,
  label,
  disabled = false,
  variant = 'primary',
}: {
  c: CaseDetail;
  label: string;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
}) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCaseRefresh(c.id);

  const onFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error(t('admin.case.contract.pdfOnly'));
      return;
    }
    setBusy(true);
    try {
      await uploadCaseDocument(c.id, file, 'CONTRACT');
      await refresh();
      toast.success(t('admin.case.contract.uploaded'));
    } catch (err) {
      toastError(err, t('admin.case.contract.uploadFailed'));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <button
        type="button"
        className={variant === 'primary' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
        disabled={disabled || busy}
        onClick={() => ref.current?.click()}
      >
        {busy ? <Spinner className="size-3.5" /> : <FileUp className="size-3.5" />}
        {label}
      </button>
    </>
  );
};

const Row = ({ icon: IconCmp, label, children }: { icon: typeof User; label: string; children: ReactNode }) => (
  <div className="flex items-start gap-2.5 py-1.5">
    <IconCmp className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
    <div className="min-w-0 flex-1">
      <p className="text-[11px] text-muted">{label}</p>
      <div className="text-sm break-words text-ink">{children}</div>
    </div>
  </div>
);

export const ContractBox = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const k = c.contract;
  const canReupload = c.status === 'CONTRACT_SENT' || c.status === 'CONTRACT_SIGNED';

  return (
    <Panel
      title={t('admin.case.contract.title')}
      icon={FileSignature}
      actions={
        k?.file || canReupload ? (
          <>
            {k?.file && <ContractCheckButton caseId={c.id} source={{ documentId: k.file.id }} />}
            {canReupload && <SendContractForSignature caseId={c.id} label={t('admin.case.contract.newVersion')} variant="ghost" />}
          </>
        ) : undefined
      }
    >
      {!k ? (
        <p className="text-sm text-muted">{t('admin.case.contract.notSent')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="badge bg-primary text-primary-contrast">v{k.version}</span>
              <span className="min-w-0 text-xs text-muted">{t('admin.case.contract.sentAt', { date: fmtDateTime(k.sentAt) })}</span>
            </div>
            {k.file && (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 py-2">
                <DocIcon mime={k.file.mimeType} className="size-4 shrink-0 text-link" />
                <span className="min-w-0 flex-1 truncate text-sm">{k.file.originalName}</span>
                <DocLinks doc={k.file} />
              </div>
            )}
            {k.signedFile ? (
              <div className="flex items-center gap-2 rounded-lg border border-success-border bg-success-bg px-3 py-2">
                <FileSignature className="size-4 shrink-0 text-success-fg" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-success-fg">{t('admin.case.contract.signed')}</span>
                <DocLinks doc={k.signedFile} />
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">{t('admin.case.contract.awaitingSignature')}</p>
            )}
          </div>
          {k.signedAt && (
            <div className="rounded-lg border border-line px-3 py-1.5">
              <Row icon={User} label={t('admin.case.contract.signer')}>
                {k.signerName ?? '—'}
              </Row>
              <Row icon={Fingerprint} label={t('admin.case.contract.signedAt')}>
                {fmtDateTime(k.signedAt)}
              </Row>
              <Row icon={Globe} label={t('admin.case.contract.ip')}>
                <span className="code-id text-xs">{k.signerIp ?? '—'}</span>
              </Row>
              <Row icon={Monitor} label={t('admin.case.contract.ua')}>
                <span className="code-id text-[11px] leading-snug text-ink/80">{k.signerUserAgent ?? '—'}</span>
              </Row>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};
