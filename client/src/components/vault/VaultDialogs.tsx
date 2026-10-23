import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check, FileText, Info, Upload } from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { CaseStatus } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { ACCEPT } from '@/components/portal/FileDrop';
import { VAULT_KINDS, suggestionsQuery, type ServerChecks, type VaultDoc, type VaultKind, type VaultSuggestion } from './api';
import { useDocCheckGate } from './DocCheckDialog';
import { CheckResultNotice } from './CheckResultNotice';
import { VaultModal } from './VaultModal';
import { useVaultError } from './useVaultError';
import { optimizeImage } from '@/lib/imageCompress';

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

const KindSelect = ({ value, onChange, id }: { value: VaultKind; onChange: (k: VaultKind) => void; id: string }) => {
  const { t } = useTranslation();
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as VaultKind)}>
      {VAULT_KINDS.map((k) => (
        <option key={k} value={k}>
          {t(`vault.kinds.${k}`)}
        </option>
      ))}
    </select>
  );
};

// ─── Upload ───────────────────────────────────────────────────────────

/** Upload dialog: file (client-side check first), kind, title, holder, dates. */
export const VaultUploadDialog = ({
  open,
  initialKind,
  onClose,
  onUploaded,
}: {
  open: boolean;
  initialKind?: VaultKind;
  onClose: () => void;
  onUploaded: () => Promise<unknown> | void;
}) => {
  const { t } = useTranslation();
  const onError = useVaultError();
  const ids = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { gate, dialog, checking } = useDocCheckGate();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<VaultKind>(initialKind ?? 'PASSPORT');
  const [title, setTitle] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ checks: ServerChecks | null; prefilled: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setKind(initialKind ?? 'PASSPORT');
    setTitle('');
    setOwnerName('');
    setIssuedAt('');
    setExpiresAt('');
    setResult(null);
  }, [open, initialKind]);

  const choose = async (f: File | undefined) => {
    if (!f) return;
    if (await gate(f)) setFile(f);
  };

  const submit = async () => {
    if (!file) return;
    const form = new FormData();
    form.append('file', await optimizeImage(file));
    form.append('kind', kind);
    form.append('title', title.trim() || t(`vault.kinds.${kind}`));
    if (ownerName.trim()) form.append('ownerName', ownerName.trim());
    if (issuedAt) form.append('issuedAt', issuedAt);
    if (expiresAt) form.append('expiresAt', expiresAt);
    setProgress(0);
    try {
      const { data } = await api.post<{ checks: ServerChecks | null; prefilled: boolean }>('/vault', form, {
        onUploadProgress: (e) => setProgress(e.total ? e.loaded / e.total : 0),
      });
      toast.success(t('vault.uploaded'));
      await onUploaded();
      // Stay open only when there is something to read (check findings or the passport prefill).
      if ((data.checks && data.checks.issues.length) || data.prefilled || data.checks?.pending) setResult(data);
      else onClose();
    } catch (err) {
      onError(err);
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;

  return (
    <>
      <VaultModal
        open={open}
        onClose={onClose}
        busy={busy}
        title={t('vault.uploadDialog.title')}
        footer={
          result ? (
            <button type="button" className="btn-primary min-h-11" onClick={onClose}>
              <Check className="size-4" aria-hidden />
              {t('common.close')}
            </button>
          ) : (
            <>
              <button type="button" className="btn min-h-11 border border-line text-ink hover:bg-surface" onClick={onClose} disabled={busy}>
                {t('vault.actions.cancel')}
              </button>
              <button type="button" className="btn-primary min-h-11" onClick={submit} disabled={!file || busy}>
                {busy ? <Spinner className="size-4" /> : <Upload className="size-4" aria-hidden />}
                {busy ? `${t('vault.uploadDialog.uploading')} ${Math.round((progress ?? 0) * 100)}%` : t('vault.upload')}
              </button>
            </>
          )
        }
      >
        {result ? (
          <div className="space-y-3">
            {result.prefilled && (
              <p className="flex gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:bg-brand-950/40 dark:text-brand-200">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t('vault.uploadDialog.prefilled')}
              </p>
            )}
            <CheckResultNotice checks={result.checks} />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <span className="label">{t('vault.fields.file')}</span>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  void choose(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy || checking}
                className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-line bg-surface/60 px-4 py-3 text-left transition hover:border-brand-400"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600">
                  {checking ? <Spinner className="size-4" /> : file ? <FileText className="size-5" aria-hidden /> : <Upload className="size-5" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {checking ? t('vault.check.checking') : file ? file.name : t('vault.uploadDialog.choose')}
                  </span>
                  <span className="block text-xs text-muted">{file ? `${formatBytes(file.size)} · ${t('vault.uploadDialog.change')}` : t('vault.uploadDialog.formats')}</span>
                </span>
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={`${ids}-kind`}>
                  {t('vault.fields.kind')}
                </label>
                <KindSelect id={`${ids}-kind`} value={kind} onChange={setKind} />
              </div>
              <div>
                <label className="label" htmlFor={`${ids}-title`}>
                  {t('vault.fields.title')}
                </label>
                <input id={`${ids}-title`} className="input" maxLength={200} value={title} placeholder={t(`vault.kinds.${kind}`)} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor={`${ids}-owner`}>
                  {t('vault.fields.ownerName')}
                </label>
                <input id={`${ids}-owner`} className="input" maxLength={160} value={ownerName} placeholder={t('vault.fields.ownerPlaceholder')} onChange={(e) => setOwnerName(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor={`${ids}-issued`}>
                  {t('vault.fields.issuedAt')}
                </label>
                <input id={`${ids}-issued`} type="date" className="input" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor={`${ids}-expires`}>
                  {t('vault.fields.expiresAt')}
                </label>
                <input id={`${ids}-expires`} type="date" className="input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>
            {kind === 'PASSPORT' && (
              <p className="flex gap-2 text-xs text-muted">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t('vault.uploadDialog.passportHint')}
              </p>
            )}
          </div>
        )}
      </VaultModal>
      {dialog}
    </>
  );
};

// ─── Edit ─────────────────────────────────────────────────────────────

export const VaultEditDialog = ({ doc, onClose, onSaved }: { doc: VaultDoc | null; onClose: () => void; onSaved: () => Promise<unknown> | void }) => {
  const { t } = useTranslation();
  const onError = useVaultError();
  const ids = useId();
  const [kind, setKind] = useState<VaultKind>('OTHER');
  const [title, setTitle] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!doc) return;
    setKind(doc.kind);
    setTitle(doc.title);
    setOwnerName(doc.ownerName ?? '');
    setIssuedAt(toDateInput(doc.issuedAt));
    setExpiresAt(toDateInput(doc.expiresAt));
  }, [doc]);

  const save = async () => {
    if (!doc || !title.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/vault/${doc.id}`, { kind, title: title.trim(), ownerName: ownerName.trim() || null, issuedAt: issuedAt || null, expiresAt: expiresAt || null });
      toast.success(t('vault.saved'));
      await onSaved();
      onClose();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <VaultModal
      open={!!doc}
      onClose={onClose}
      busy={busy}
      title={t('vault.editTitle')}
      footer={
        <>
          <button type="button" className="btn min-h-11 border border-line text-ink hover:bg-surface" onClick={onClose} disabled={busy}>
            {t('vault.actions.cancel')}
          </button>
          <button type="button" className="btn-primary min-h-11" onClick={save} disabled={busy || !title.trim()}>
            {busy && <Spinner className="size-4" />}
            {t('vault.actions.save')}
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${ids}-kind`}>
            {t('vault.fields.kind')}
          </label>
          <KindSelect id={`${ids}-kind`} value={kind} onChange={setKind} />
        </div>
        <div>
          <label className="label" htmlFor={`${ids}-title`}>
            {t('vault.fields.title')}
          </label>
          <input id={`${ids}-title`} className="input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`${ids}-owner`}>
            {t('vault.fields.ownerName')}
          </label>
          <input id={`${ids}-owner`} className="input" maxLength={160} value={ownerName} placeholder={t('vault.fields.ownerPlaceholder')} onChange={(e) => setOwnerName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor={`${ids}-issued`}>
            {t('vault.fields.issuedAt')}
          </label>
          <input id={`${ids}-issued`} type="date" className="input" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor={`${ids}-expires`}>
            {t('vault.fields.expiresAt')}
          </label>
          <input id={`${ids}-expires`} type="date" className="input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
      </div>
    </VaultModal>
  );
};

// ─── Use for a case ───────────────────────────────────────────────────

const OPEN_STATUSES: CaseStatus[] = ['DOCUMENTS_PENDING', 'EMBASSY_DOCUMENTS'];

/** Picks one of the client's cases that accepts documents and a requirement, then copies the file in. */
export const UseInCaseDialog = ({ doc, onClose }: { doc: VaultDoc | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const onError = useVaultError();
  const ids = useId();
  const [caseId, setCaseId] = useState('');
  const [requirementId, setRequirementId] = useState('');
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<ServerChecks | null | undefined>(undefined);

  const cases = useQuery({
    queryKey: ['cases'],
    queryFn: async () => (await api.get<{ cases: { id: string; number: string; profession: string; status: CaseStatus }[] }>('/cases')).data.cases,
    enabled: !!doc,
  });
  const openCases = (cases.data ?? []).filter((c) => OPEN_STATUSES.includes(c.status));

  useEffect(() => {
    if (!doc) return;
    setChecks(undefined);
    setRequirementId('');
    setCaseId('');
  }, [doc]);
  useEffect(() => {
    if (doc && !caseId && openCases.length) setCaseId(openCases[0].id);
  }, [doc, caseId, openCases]);

  const sugg = useQuery({
    queryKey: suggestionsQuery(caseId),
    queryFn: async () => (await api.get<{ suggestions: VaultSuggestion[] }>('/vault/suggestions', { params: { caseId } })).data.suggestions,
    enabled: !!doc && !!caseId,
  });
  // Requirements whose kind matches this document come first.
  const reqs = [...(sugg.data ?? [])].sort((a, b) => Number(b.documents.some((d) => d.id === doc?.id)) - Number(a.documents.some((d) => d.id === doc?.id)));
  useEffect(() => {
    if (reqs.length && !reqs.some((r) => r.requirementId === requirementId)) setRequirementId(reqs[0].requirementId);
  }, [reqs, requirementId]);

  const submit = async () => {
    if (!doc || !caseId || !requirementId) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ checks: ServerChecks | null }>(`/vault/${doc.id}/use`, { caseId, requirementId });
      toast.success(t('vault.use.done'));
      if (data.checks && data.checks.issues.length) setChecks(data.checks);
      else onClose();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const done = checks !== undefined;

  return (
    <VaultModal
      open={!!doc}
      onClose={onClose}
      busy={busy}
      title={t('vault.use.title')}
      footer={
        done ? (
          <button type="button" className="btn-primary min-h-11" onClick={onClose}>
            {t('common.close')}
          </button>
        ) : (
          <>
            <button type="button" className="btn min-h-11 border border-line text-ink hover:bg-surface" onClick={onClose} disabled={busy}>
              {t('vault.actions.cancel')}
            </button>
            <button type="button" className="btn-primary min-h-11" onClick={submit} disabled={busy || !caseId || !requirementId}>
              {busy && <Spinner className="size-4" />}
              {t('vault.use.submit')}
            </button>
          </>
        )
      }
    >
      {done ? (
        <CheckResultNotice checks={checks} />
      ) : cases.isLoading ? (
        <div className="grid place-items-center py-8 text-brand-600">
          <Spinner />
        </div>
      ) : openCases.length === 0 ? (
        <p className="py-4 text-sm text-muted">{t('vault.use.noCases')}</p>
      ) : (
        <div className="space-y-4">
          <p className="truncate text-sm font-semibold text-ink">{doc?.title}</p>
          <div>
            <label className="label" htmlFor={`${ids}-case`}>
              {t('vault.use.case')}
            </label>
            <select id={`${ids}-case`} className="input" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              {openCases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number} · {c.profession}
                </option>
              ))}
            </select>
          </div>
          <fieldset>
            <legend className="label">{t('vault.use.requirement')}</legend>
            {sugg.isLoading ? (
              <Spinner className="size-4 text-brand-600" />
            ) : reqs.length === 0 ? (
              <p className="text-sm text-muted">{t('vault.use.noRequirements')}</p>
            ) : (
              <div className="space-y-1.5">
                {reqs.map((r) => {
                  const match = r.documents.some((d) => d.id === doc?.id);
                  return (
                    <label
                      key={r.requirementId}
                      className={clsx(
                        'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition',
                        requirementId === r.requirementId ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30' : 'border-line hover:bg-surface',
                      )}
                    >
                      <input type="radio" name={`${ids}-req`} checked={requirementId === r.requirementId} onChange={() => setRequirementId(r.requirementId)} />
                      <span className="min-w-0 flex-1 text-ink">{tr(r.title)}</span>
                      {match && <span className="badge bg-success-bg text-success-fg">{t('vault.use.match')}</span>}
                      {r.satisfied && <Check className="size-4 shrink-0 text-success" aria-hidden />}
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>
        </div>
      )}
    </VaultModal>
  );
};
