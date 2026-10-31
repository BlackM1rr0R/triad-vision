import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, FileText, Upload, XCircle } from 'lucide-react';
import { checkFile, isImageFile, result as toResult, type DocCheckIssue, type DocCheckResult } from '@/lib/docCheck';
import { api } from '@/lib/api';
import { asChecks } from './api';
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
                  i.level === 'error' || i.severe ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning-fg',
                )}
              >
                {i.level === 'error' || i.severe ? <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}
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

/** What the file is for: a passport / ID photo is also checked by the server (MRZ expiry) before the upload. */
export interface GateContext {
  requirementKey?: string | null;
  kind?: string | null;
}
const MRZ_TARGETS = ['PASSPORT', 'ID_CARD'];
const PRECHECK_CODES = ['PASSPORT_EXPIRED', 'PASSPORT_EXPIRES_SOON', 'WRONG_TYPE_SUSPECTED'] as const;

/**
 * Server pre-upload check of a passport / ID photo (POST /api/vault/precheck): an expired or soon expiring
 * passport and an unreadable MRZ, as non-blocking issues. Nothing is stored; any failure → no issues.
 */
export const precheckOnServer = async (file: File, ctx: GateContext): Promise<DocCheckIssue[]> => {
  const target = ctx.kind ?? ctx.requirementKey ?? null;
  if (!target || !MRZ_TARGETS.includes(target) || !isImageFile(file) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return [];
  const form = new FormData();
  form.append('file', file);
  if (ctx.kind) form.append('kind', ctx.kind);
  else if (ctx.requirementKey) form.append('requirementKey', ctx.requirementKey);
  try {
    const { data } = await api.post<{ checks?: unknown }>('/vault/precheck', form, { timeout: 15_000 });
    const checks = asChecks(data.checks);
    return (checks?.issues ?? [])
      .filter((i) => (PRECHECK_CODES as readonly string[]).includes(i.code))
      .map((i) => ({
        code: i.code as DocCheckIssue['code'],
        level: 'warn' as const,
        key: `vault.check.server.${i.code}`,
        ...(i.params ? { params: i.params } : {}),
        ...(i.level === 'error' ? { severe: true } : {}),
      }));
  } catch {
    return []; // offline, rate limited, OCR unavailable: the check after the upload still runs
  }
};

/**
 * Hook that runs the client-side check before an upload:
 *   const { gate, dialog } = useDocCheckGate();
 *   if (!(await gate(file, { requirementKey }))) return;   // the user chose another file
 * Files without findings pass straight through; otherwise the dialog decides. With a passport / ID context
 * the photo is also pre-checked by the server (expiry from the MRZ).
 */
export const useDocCheckGate = (): { gate: (file: File, ctx?: GateContext) => Promise<boolean>; dialog: ReactNode; checking: boolean } => {
  const [state, setState] = useState<{ file: File; result: DocCheckResult } | null>(null);
  const [checking, setChecking] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const finish = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setState(null);
  }, []);

  const gate = useCallback(async (file: File, ctx: GateContext = {}) => {
    setChecking(true);
    let result: DocCheckResult;
    try {
      result = await checkFile(file);
      if (result.level !== 'error') {
        const server = await precheckOnServer(file, ctx);
        if (server.length) result = toResult([...result.issues, ...server]);
      }
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
