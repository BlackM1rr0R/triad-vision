import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileSignature, FileUp, Fingerprint, Globe, Monitor, User } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CaseDetail } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDateTime, toastError } from '../labels';
import { Panel } from '../ui';
import { DocIcon, DocLinks, uploadCaseDocument, useCaseRefresh } from './shared';

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
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCaseRefresh(c.id);

  const onFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('Müqavilə yalnız PDF formatında ola bilər.');
      return;
    }
    setBusy(true);
    try {
      await uploadCaseDocument(c.id, file, 'CONTRACT');
      await refresh();
      toast.success('Müqavilə yükləndi və müştəriyə imza üçün göndərildi.');
    } catch (err) {
      toastError(err, 'Müqavilə yüklənmədi.');
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
        className={variant === 'primary' ? 'btn-primary btn-sm' : 'btn-white btn-sm border border-line'}
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
  const k = c.contract;
  const canReupload = c.status === 'CONTRACT_SENT' || c.status === 'CONTRACT_SIGNED';

  return (
    <Panel
      title="Müqavilə"
      icon={FileSignature}
      actions={canReupload ? <ContractUpload c={c} label="Yeni versiya yüklə" variant="ghost" /> : undefined}
    >
      {!k ? (
        <p className="text-sm text-muted">
          Müqavilə hələ göndərilməyib. İlkin sənədlər qəbul edildikdən sonra PDF faylı “Növbəti addım” bölməsindən yükləyin.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="badge bg-navy-900 text-white">v{k.version}</span>
              <span className="min-w-0 text-xs text-muted">Göndərilib: {fmtDateTime(k.sentAt)}</span>
            </div>
            {k.file && (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 py-2">
                <DocIcon mime={k.file.mimeType} className="size-4 shrink-0 text-brand-600" />
                <span className="min-w-0 flex-1 truncate text-sm">{k.file.originalName}</span>
                <DocLinks doc={k.file} />
              </div>
            )}
            {k.signedFile ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <FileSignature className="size-4 shrink-0 text-success" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-emerald-900">İmzalanmış müqavilə</span>
                <DocLinks doc={k.signedFile} />
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">Müştərinin imzası gözlənilir.</p>
            )}
          </div>
          {k.signedAt && (
            <div className="rounded-lg border border-line px-3 py-1.5">
              <Row icon={User} label="İmzalayan">
                {k.signerName ?? '—'}
              </Row>
              <Row icon={Fingerprint} label="İmza tarixi">
                {fmtDateTime(k.signedAt)}
              </Row>
              <Row icon={Globe} label="IP ünvanı">
                <span className="font-mono text-xs">{k.signerIp ?? '—'}</span>
              </Row>
              <Row icon={Monitor} label="Brauzer (user-agent)">
                <span className="font-mono text-[11px] leading-snug text-ink/80">{k.signerUserAgent ?? '—'}</span>
              </Row>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};
