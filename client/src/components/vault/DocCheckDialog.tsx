import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, FileText, Upload, XCircle } from 'lucide-react';
import { checkFile, isImageFile, type DocCheckResult } from '@/lib/docCheck';
import { VaultModal } from './VaultModal';
import './api';

/**
 * Shows the client-side check result for a chosen file: preview, friendly explanations and the two
 * choices. Warnings can be ignored ("Upload anyway"); errors (wrong type, too big, empty, not a PDF)
 * only allow choosing another file.
 */
export const DocCheckDialog = ({
  file,
  result,
  onUpload,
  onCancel,
}: {
  file: File | null;
  result: DocCheckResult | null;
  onUpload: () => void;
  onCancel: () => void;
}) => {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !isImageFile(file)) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const open = !!file && !!result && result.level !== 'ok';
  const blocked = result?.level === 'error';

  return (
    <VaultModal
      open={open}
      onClose={onCancel}
      title={
        <span className="flex items-center gap-2">
          {blocked ? <XCircle className="size-5 shrink-0 text-danger" aria-hidden /> : <AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden />}
          {blocked ? t('vault.check.titleError') : t('vault.check.titleWarn')}
        </span>
      }
      footer={
        <>
          <button type="button" className="btn min-h-11 border border-line text-ink hover:bg-sunken" onClick={onCancel}>
            {t('vault.check.chooseAnother')}
          </button>
          {!blocked && (
            <button type="button" className="btn-primary min-h-11" onClick={onUpload}>
              <Upload className="size-4" aria-hidden />
              {t('vault.check.uploadAnyway')}
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="grid h-40 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-sunken sm:w-40">
          {preview ? (
            <img src={preview} alt="" className="size-full object-contain" />
          ) : (
            <FileText className="size-10 text-muted" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink" title={file?.name}>
            {file?.name}
          </p>
          <p className="mt-1 text-sm text-muted">{t('vault.check.intro')}</p>
          <ul className="mt-3 space-y-2">
            {result?.issues.map((i) => (
              <li
                key={i.code}
                className={clsx(
                  'flex gap-2 rounded-lg px-3 py-2 text-sm leading-relaxed',
                  i.level === 'error' ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning-fg',
                )}
              >
                {i.level === 'error' ? <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}
                <span>{t(i.key, i.params)}</span>
              </li>
            ))}
          </ul>
          {!blocked && <p className="mt-3 text-xs text-muted">{t('vault.check.warnNote')}</p>}
        </div>
      </div>
    </VaultModal>
  );
};

/**
 * Hook that runs the client-side check before an upload:
 *   const { gate, dialog } = useDocCheckGate();
 *   if (!(await gate(file))) return;   // the user chose another file
 * Files without findings pass straight through; otherwise the dialog decides.
 */
export const useDocCheckGate = (): { gate: (file: File) => Promise<boolean>; dialog: ReactNode; checking: boolean } => {
  const [state, setState] = useState<{ file: File; result: DocCheckResult } | null>(null);
  const [checking, setChecking] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const finish = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setState(null);
  }, []);

  const gate = useCallback(async (file: File) => {
    setChecking(true);
    let result: DocCheckResult;
    try {
      result = await checkFile(file);
    } finally {
      setChecking(false);
    }
    if (result.level === 'ok') return true;
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setState({ file, result });
    });
  }, []);

  const dialog = <DocCheckDialog file={state?.file ?? null} result={state?.result ?? null} onUpload={() => finish(true)} onCancel={() => finish(false)} />;
  return { gate, dialog, checking };
};

export default DocCheckDialog;
