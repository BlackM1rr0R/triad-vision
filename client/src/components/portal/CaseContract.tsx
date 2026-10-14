import { useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BadgeCheck, Download, ExternalLink, FileSignature, PenTool } from 'lucide-react';
import { api, fileUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';
import { useApiError } from './useApiError';

/** Contract info, PDF links and — while the contract awaits signature — the e-signature form. */
export const CaseContract = ({ data, onChanged }: { data: CaseDetail; onChanged: () => Promise<unknown> }) => {
  const { t } = useTranslation();
  const { date, dateTime } = useL10n();
  const { user } = useAuth();
  const onError = useApiError();
  const padRef = useRef<SignaturePadHandle>(null);
  const nameId = useId();
  const agreeId = useId();
  const [signerName, setSignerName] = useState(() =>
    `${user?.firstName ?? data.client.firstName} ${user?.lastName ?? data.client.lastName}`.trim(),
  );
  const [agree, setAgree] = useState(false);
  const [padEmpty, setPadEmpty] = useState(true);
  const [signing, setSigning] = useState(false);

  const contract = data.contract;
  if (!contract) return null;

  const canSign = data.status === 'CONTRACT_SENT';
  const showSigned = !canSign && !!contract.signedAt;

  const sign = async () => {
    const pad = padRef.current;
    if (signerName.trim().length < 3) {
      toast.error(t('portal.contract.nameRequired'));
      return;
    }
    if (!pad || pad.isEmpty()) {
      toast.error(t('portal.contract.emptySignature'));
      return;
    }
    if (!agree) return;
    setSigning(true);
    try {
      await api.post(`/cases/${data.id}/contract/sign`, {
        signerName: signerName.trim(),
        signature: pad.toDataURL(),
        agree: true,
      });
      toast.success(t('portal.contract.signed'));
      await onChanged();
    } catch (err) {
      onError(err);
    } finally {
      setSigning(false);
    }
  };

  return (
    <section id="contract" className="card scroll-mt-28 lg:scroll-mt-36 overflow-hidden" aria-labelledby="contract-title">
      <div className="flex flex-wrap items-center gap-4 border-b border-line p-5 sm:p-6">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/25">
          <FileSignature className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="contract-title" className="text-xl font-bold text-navy-900">
            {t('portal.contract.title')}
          </h3>
          <p className="mt-0.5 text-sm break-words text-muted">
            {t('portal.contract.version')} {contract.version} · {t('portal.contract.sentAt')}: {date(contract.sentAt)}
          </p>
        </div>
        {contract.file && (
          <a href={fileUrl(contract.file.id)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm w-full sm:w-auto">
            <ExternalLink className="size-4" aria-hidden />
            {t('portal.contract.read')}
          </a>
        )}
      </div>

      {showSigned && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 bg-emerald-50/60 p-5 sm:flex-row sm:items-center sm:p-6"
        >
          <BadgeCheck className="size-9 shrink-0 text-success" aria-hidden />
          <dl className="grid flex-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-muted">{t('portal.contract.signed')}</dt>
              <dd className="font-semibold text-navy-900">{contract.signerName}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">{t('portal.contract.signedAt')}</dt>
              <dd className="font-semibold text-navy-900">{contract.signedAt && dateTime(contract.signedAt)}</dd>
            </div>
          </dl>
          {contract.signedFile && (
            <a href={fileUrl(contract.signedFile.id, true)} className="btn-primary btn-sm w-full sm:w-auto">
              <Download className="size-4" aria-hidden />
              {t('portal.contract.signedFile')}
            </a>
          )}
        </motion.div>
      )}

      {canSign && (
        <form
          className="space-y-4 p-5 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void sign();
          }}
        >
          <div>
            <h4 className="mb-2 flex items-center gap-2 font-sans text-base font-semibold text-navy-900">
              <PenTool className="size-4 text-brand-600" aria-hidden />
              {t('portal.contract.signTitle')}
            </h4>
            <p className="text-sm text-muted">{t('portal.contract.signText')}</p>
          </div>

          <SignaturePad ref={padRef} onChange={setPadEmpty} />

          <div>
            <label htmlFor={nameId} className="label">
              {t('portal.contract.fullName')}
            </label>
            <input
              id={nameId}
              className="input"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              autoComplete="name"
              required
              minLength={3}
              maxLength={160}
            />
          </div>

          <label htmlFor={agreeId} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface/70 p-4 text-sm leading-relaxed text-navy-900 [&:has(input:focus-visible)]:ring-4 [&:has(input:focus-visible)]:ring-brand-500/20">
            <input
              id={agreeId}
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-brand-600"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              required
            />
            {t('portal.contract.agree')}
          </label>

          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted empty:hidden" aria-live="polite">
              {padEmpty ? t('portal.contract.emptySignature') : ''}
            </p>
            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={!agree || signing}>
              {signing ? <Spinner className="size-4" /> : <FileSignature className="size-4" aria-hidden />}
              {signing ? t('portal.contract.signing') : t('portal.contract.sign')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

export default CaseContract;
