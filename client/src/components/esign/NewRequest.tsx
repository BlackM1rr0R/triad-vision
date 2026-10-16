import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { FileUp, FolderOpen, Paperclip, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesSign } from '@/i18n/pagesSign';
import { Drawer } from '@/components/admin/Drawer';
import { Spinner } from '@/components/ui/Spinner';
import { useEsignError, type Prefill, type SignOrder, type SignerDraft, type SignerRole, type StaffRequestDetail } from './api';

registerCopy(pagesSign);

const ROLES: SignerRole[] = ['CANDIDATE', 'COMPANY', 'STAFF', 'OTHER'];
const LOCALES = ['az', 'de', 'en', 'ru'] as const;
type Source = 'upload' | 'caseDocument' | 'drive';
type Row = SignerDraft & { key: string; include: boolean };

let rowSeq = 0;
const row = (s: SignerDraft, include = true): Row => ({ ...s, key: `r${rowSeq++}`, include });

interface CaseHit {
  id: string;
  number: string;
  client: { firstName: string; lastName: string };
}

interface DriveHit {
  id: string;
  kind: 'FILE' | 'FOLDER';
  name: string;
  size: number | null;
  mimeType: string | null;
  virtual?: boolean;
}

/**
 * "Send for signature": PDF (upload / case document / drive file), parties (prefilled from the case
 * and its employer), order, message and deadline. Opened from a case, a company or the Signatures page.
 */
export const NewSignatureRequest = ({
  open,
  onClose,
  caseId: fixedCaseId,
  companyId,
  contract = false,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  caseId?: string;
  companyId?: string;
  contract?: boolean;
  onCreated?: (r: StaffRequestDetail) => void;
}) => {
  const { t } = useTranslation();
  const err = useEsignError();
  const qc = useQueryClient();
  const ids = { title: useId(), message: useId(), expires: useId(), contract: useId(), caseSearch: useId(), drive: useId() };
  const fileRef = useRef<HTMLInputElement>(null);

  const [caseId, setCaseId] = useState<string | undefined>(fixedCaseId);
  const [caseQuery, setCaseQuery] = useState('');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState<Source>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState('');
  const [driveQuery, setDriveQuery] = useState('');
  const [drivePick, setDrivePick] = useState<DriveHit | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [order, setOrder] = useState<SignOrder>('SEQUENTIAL');
  const [message, setMessage] = useState('');
  const [expires, setExpires] = useState(14);
  const [isContract, setIsContract] = useState(contract);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCaseId(fixedCaseId);
      setIsContract(contract);
    }
  }, [open, fixedCaseId, contract]);

  const prefill = useQuery({
    queryKey: ['esign', 'prefill', caseId ?? '', companyId ?? ''],
    queryFn: async () => (await api.get<Prefill>('/admin/signatures/prefill', { params: { caseId, companyId } })).data,
    enabled: open,
  });

  // Reset the parties whenever the context (case / company) changes.
  useEffect(() => {
    const p = prefill.data;
    if (!p || !open) return;
    const firstCompany = p.signers.findIndex((s) => s.role === 'COMPANY');
    setRows([
      ...p.signers.map((s, i) => row(s, s.role !== 'COMPANY' || i === firstCompany)),
      row(p.staff, !!p.case),
    ]);
    if (p.case && !title) setTitle(isContract ? `${t('esign.admin.detail.caseContract')} — ${p.case.number}` : '');
    if (p.case && !p.case.contractAllowed) setIsContract(false);
    setExpires(p.defaults.expiresInDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill.data, open]);

  const caseHits = useQuery({
    queryKey: ['esign', 'case-search', caseQuery],
    queryFn: async () => (await api.get<{ items: CaseHit[] }>('/admin/cases', { params: { search: caseQuery, page: 1 } })).data.items.slice(0, 8),
    enabled: open && !fixedCaseId && !caseId && caseQuery.trim().length >= 2,
  });

  const driveHits = useQuery({
    queryKey: ['esign', 'drive-search', driveQuery],
    queryFn: async () => (await api.get<{ items: DriveHit[] }>('/drive/search', { params: { q: driveQuery, type: 'pdf' } })).data.items.filter((i) => i.kind === 'FILE' && !i.virtual).slice(0, 10),
    enabled: open && source === 'drive' && driveQuery.trim().length >= 2,
  });

  const pdfDocs = prefill.data?.documents ?? [];
  const included = useMemo(() => rows.filter((r) => r.include), [rows]);

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const reset = () => {
    setTitle('');
    setFile(null);
    setDocumentId('');
    setDrivePick(null);
    setDriveQuery('');
    setMessage('');
    setSource('upload');
    setCaseQuery('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async (send: boolean) => {
    if (source === 'upload' && !file) return toast.error(t('esign.admin.form.needFile'));
    if (source === 'caseDocument' && !documentId) return toast.error(t('esign.admin.form.needFile'));
    if (source === 'drive' && !drivePick) return toast.error(t('esign.admin.form.needFile'));
    if (!included.length) return toast.error(t('esign.admin.form.needSigner'));
    const payload = {
      title: title.trim(),
      caseId: caseId ?? null,
      companyId: companyId ?? prefill.data?.company?.id ?? null,
      message: message.trim() || null,
      expiresInDays: expires,
      order,
      caseContract: !!caseId && isContract,
      send,
      source: source === 'upload' ? { type: 'upload' } : source === 'caseDocument' ? { type: 'caseDocument', documentId } : { type: 'drive', nodeId: drivePick!.id },
      signers: included.map((r, i) => ({
        role: r.role,
        name: r.name.trim(),
        email: r.email.trim(),
        userId: r.userId ?? null,
        locale: r.locale ?? null,
        order: order === 'PARALLEL' ? 1 : i + 1,
      })),
    };
    setBusy(true);
    try {
      let res;
      if (source === 'upload') {
        const fd = new FormData();
        fd.append('payload', JSON.stringify(payload));
        fd.append('file', file!);
        res = await api.post<{ request: StaffRequestDetail }>('/admin/signatures', fd);
      } else {
        res = await api.post<{ request: StaffRequestDetail }>('/admin/signatures', payload);
      }
      toast.success(send ? t('esign.admin.form.created') : t('esign.admin.form.drafted'));
      void qc.invalidateQueries({ queryKey: ['esign'] });
      if (caseId) void qc.invalidateQueries({ queryKey: ['admin-case', caseId] });
      onCreated?.(res.data.request);
      reset();
      onClose();
    } catch (e) {
      err.toast(e);
    } finally {
      setBusy(false);
    }
  };

  const p = prefill.data;
  const canContract = !!p?.case?.contractAllowed;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t('esign.admin.new')}
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={() => void submit(false)} disabled={busy || isContract}>
            {t('esign.admin.form.saveDraft')}
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={() => void submit(true)} disabled={busy || title.trim().length < 2}>
            {busy ? <Spinner className="size-3.5" /> : <FileUp className="size-3.5" aria-hidden />}
            {t('esign.admin.form.send')}
          </button>
        </>
      }
    >
      {prefill.isLoading ? (
        <div className="grid min-h-40 place-items-center text-brand-600">
          <Spinner className="size-6" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Context */}
          {!fixedCaseId && (
            <div>
              <label htmlFor={ids.caseSearch} className="label">
                {t('esign.admin.detail.case')}
              </label>
              {caseId && p?.case ? (
                <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.case.number}</span>
                  <button type="button" className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => setCaseId(undefined)}>
                    {t('esign.admin.form.remove')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                    <input id={ids.caseSearch} className="input pl-9" value={caseQuery} onChange={(e) => setCaseQuery(e.target.value)} placeholder="TV-2026-…" />
                  </div>
                  {!!caseHits.data?.length && (
                    <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-line bg-white">
                      {caseHits.data.map((c) => (
                        <li key={c.id}>
                          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface" onClick={() => setCaseId(c.id)}>
                            <span className="font-semibold">{c.number}</span>
                            <span className="truncate text-muted">
                              {c.client.firstName} {c.client.lastName}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {caseId && (
            <label htmlFor={ids.contract} className={clsx('flex items-start gap-3 rounded-xl border p-3.5 text-sm', canContract ? 'cursor-pointer border-line bg-surface/70' : 'border-dashed border-line opacity-70')}>
              <input id={ids.contract} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand-600" checked={isContract && canContract} disabled={!canContract} onChange={(e) => setIsContract(e.target.checked)} />
              <span>
                <span className="font-semibold text-navy-900">{t('esign.admin.form.caseContract')}</span>
                <span className="mt-0.5 block text-xs text-muted">{canContract ? t('esign.admin.form.caseContractHint') : t('esign.admin.form.contractNotAllowed')}</span>
              </span>
            </label>
          )}

          <div>
            <label htmlFor={ids.title} className="label">
              {t('esign.admin.form.title')}
            </label>
            <input id={ids.title} className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('esign.admin.form.titlePh')} maxLength={200} required />
          </div>

          {/* PDF */}
          <fieldset>
            <legend className="label">{t('esign.admin.form.source')}</legend>
            <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
              {(['upload', ...(caseId && pdfDocs.length ? ['caseDocument'] : []), 'drive'] as Source[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  aria-pressed={source === s}
                  className={clsx('inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition', source === s ? 'bg-card text-navy-900 shadow' : 'text-muted hover:text-navy-900')}
                >
                  {s === 'upload' ? <FileUp className="size-3.5" aria-hidden /> : s === 'drive' ? <FolderOpen className="size-3.5" aria-hidden /> : <Paperclip className="size-3.5" aria-hidden />}
                  {t(`esign.admin.form.${s}`)}
                </button>
              ))}
            </div>
            <div className="mt-2">
              {source === 'upload' && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line p-3">
                  <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  <button type="button" className="btn-white btn-sm border border-line" onClick={() => fileRef.current?.click()}>
                    <FileUp className="size-3.5" aria-hidden />
                    {t('esign.admin.form.chooseFile')}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{file ? `${file.name} · ${formatBytes(file.size)}` : t('esign.admin.form.maxSize')}</span>
                </div>
              )}
              {source === 'caseDocument' && (
                <select className="input" value={documentId} onChange={(e) => setDocumentId(e.target.value)} aria-label={t('esign.admin.form.caseDocument')}>
                  <option value="">—</option>
                  {pdfDocs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.originalName} · {formatBytes(d.size)}
                    </option>
                  ))}
                </select>
              )}
              {source === 'drive' && (
                <div>
                  {drivePick ? (
                    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-semibold">{drivePick.name}</span>
                      <button type="button" className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => setDrivePick(null)}>
                        {t('esign.admin.form.remove')}
                      </button>
                    </div>
                  ) : (
                    <>
                      <input id={ids.drive} className="input" value={driveQuery} onChange={(e) => setDriveQuery(e.target.value)} placeholder={t('esign.admin.form.driveSearch')} aria-label={t('esign.admin.form.driveSearch')} />
                      {driveQuery.trim().length >= 2 && (
                        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-line bg-white">
                          {driveHits.isLoading ? (
                            <li className="px-3 py-2 text-sm text-muted">…</li>
                          ) : !driveHits.data?.length ? (
                            <li className="px-3 py-2 text-sm text-muted">{t('esign.admin.form.noPdf')}</li>
                          ) : (
                            driveHits.data.map((d) => (
                              <li key={d.id}>
                                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface" onClick={() => setDrivePick(d)}>
                                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                                  {d.size != null && <span className="text-xs text-muted">{formatBytes(d.size)}</span>}
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </fieldset>

          {/* Parties */}
          <fieldset>
            <legend className="label">{t('esign.admin.form.signers')}</legend>
            <div className="mb-2 flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
              {(['SEQUENTIAL', 'PARALLEL'] as SignOrder[]).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOrder(o)}
                  aria-pressed={order === o}
                  title={t(o === 'SEQUENTIAL' ? 'esign.order.sequentialHint' : 'esign.order.parallelHint')}
                  className={clsx('min-h-9 flex-1 rounded-lg px-3 text-xs font-semibold transition', order === o ? 'bg-card text-navy-900 shadow' : 'text-muted hover:text-navy-900')}
                >
                  {t(`esign.order.${o}`)}
                </button>
              ))}
            </div>
            <p className="mb-3 text-xs text-muted">{t(order === 'SEQUENTIAL' ? 'esign.order.sequentialHint' : 'esign.order.parallelHint')}</p>
            <ol className="space-y-2">
              {rows.map((r) => {
                const pos = included.indexOf(r);
                return (
                  <li key={r.key} className={clsx('rounded-xl border p-3', r.include ? 'border-line bg-white' : 'border-dashed border-line opacity-60')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-ink">
                        <input type="checkbox" className="size-4 accent-brand-600" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} />
                        {order === 'SEQUENTIAL' && pos >= 0 ? `${pos + 1}.` : ''} {t('esign.admin.form.include')}
                      </label>
                      <select
                        className="input w-auto min-w-32 flex-1 py-1.5 text-xs sm:flex-none"
                        value={r.role}
                        onChange={(e) => update(r.key, { role: e.target.value as SignerRole })}
                        aria-label={t('esign.admin.form.role')}
                      >
                        {ROLES.map((x) => (
                          <option key={x} value={x}>
                            {t(`esign.role.${x}`)}
                          </option>
                        ))}
                      </select>
                      {!r.userId && (
                        <select
                          className="input w-auto py-1.5 text-xs"
                          value={r.locale ?? 'de'}
                          onChange={(e) => update(r.key, { locale: e.target.value as Row['locale'] })}
                          aria-label={t('esign.admin.form.language')}
                        >
                          {LOCALES.map((l) => (
                            <option key={l} value={l}>
                              {l.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        className="ml-auto grid size-9 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-danger"
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        aria-label={t('esign.admin.form.remove')}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input
                        className="input py-2"
                        value={r.name}
                        onChange={(e) => update(r.key, { name: e.target.value })}
                        placeholder={t('esign.admin.form.name')}
                        aria-label={t('esign.admin.form.name')}
                        maxLength={160}
                      />
                      <input
                        className="input py-2"
                        type="email"
                        value={r.email}
                        readOnly={!!r.userId}
                        onChange={(e) => update(r.key, { email: e.target.value })}
                        placeholder={t('esign.admin.form.email')}
                        aria-label={t('esign.admin.form.email')}
                        maxLength={191}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn-white btn-sm border border-line" onClick={() => setRows((rs) => [...rs, row({ role: 'OTHER', name: '', email: '', locale: 'de' })])}>
                <Plus className="size-3.5" aria-hidden />
                {t('esign.admin.form.addSigner')}
              </button>
              {p && !rows.some((r) => r.userId === p.staff.userId) && (
                <button type="button" className="btn-white btn-sm border border-line" onClick={() => setRows((rs) => [...rs, row(p.staff)])}>
                  <UserPlus className="size-3.5" aria-hidden />
                  {t('esign.admin.form.addMe')}
                </button>
              )}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div>
              <label htmlFor={ids.message} className="label">
                {t('esign.admin.form.message')}
              </label>
              <textarea id={ids.message} className="input min-h-20" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('esign.admin.form.messagePh')} maxLength={4000} />
            </div>
            <div>
              <label htmlFor={ids.expires} className="label">
                {t('esign.admin.form.expires')}
              </label>
              <input id={ids.expires} type="number" className="input" min={1} max={90} value={expires} onChange={(e) => setExpires(Math.max(1, Math.min(90, Number(e.target.value) || 14)))} />
            </div>
          </div>
          <p className="text-xs text-muted">{t('esign.legal')}</p>
        </div>
      )}
    </Drawer>
  );
};
