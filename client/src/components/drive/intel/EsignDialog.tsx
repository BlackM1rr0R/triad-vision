import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowUp, PenLine, Plus, Search, Trash2, UserPlus, X } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { driveError } from '../api';
import type { DriveItem } from '../types';
import { fetchSignPrefill, searchCases, sendForSignature, type CaseHit, type SignerInput, type SignerRole } from './api';

const ROLES: SignerRole[] = ['CANDIDATE', 'COMPANY', 'STAFF', 'OTHER'];
type Row = SignerInput & { key: string };
let seq = 0;
const row = (s: Partial<SignerInput> = {}): Row => ({ role: 'OTHER', name: '', email: '', phone: '', ...s, key: `s${seq++}` });
const sameSigner = (a: SignerInput, b: SignerInput) => a.email.trim().toLowerCase() === b.email.trim().toLowerCase();

/**
 * "İmzaya göndər" from the drive: a compact version of the e-sign request form for a PDF that is already in
 * the drive (title, optional case, signers with order, message, deadline). The server reads the PDF from the
 * drive; the signed copy comes back next to the original.
 */
export default function EsignDialog({ item, onClose, onSent }: { item: DriveItem; onClose: () => void; onSent: () => void }) {
  const { t } = useTranslation();
  const ids = { title: useId(), message: useId(), expires: useId(), order: useId(), case: useId() };
  const [title, setTitle] = useState(item.name.replace(/\.pdf$/i, ''));
  const [caseHit, setCaseHit] = useState<CaseHit | null>(null);
  const [caseQuery, setCaseQuery] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [order, setOrder] = useState<'SEQUENTIAL' | 'PARALLEL'>('SEQUENTIAL');
  const [message, setMessage] = useState('');
  const [expires, setExpires] = useState(14);
  const [busy, setBusy] = useState(false);

  const caseId = caseHit?.id ?? item.caseId ?? undefined;
  const prefill = useQuery({ queryKey: ['drive-intel', 'sign-prefill', caseId ?? ''], queryFn: () => fetchSignPrefill(caseId) });
  const hits = useQuery({ queryKey: ['drive-intel', 'cases', caseQuery], queryFn: () => searchCases(caseQuery), enabled: caseQuery.trim().length >= 2 });

  // The client of the case is suggested as first signer.
  useEffect(() => {
    const p = prefill.data;
    if (!p) return;
    setExpires(p.defaults.expiresInDays);
    const candidate = p.signers.find((s) => s.role === 'CANDIDATE');
    if (candidate) setRows((rs) => (rs.some((r) => sameSigner(r, candidate)) ? rs : [row(candidate), ...rs]));
  }, [prefill.data]);

  const suggestions = [...(prefill.data?.signers ?? []).map((s) => ({ s, me: false })), ...(prefill.data?.staff ? [{ s: prefill.data.staff, me: true }] : [])].filter(
    (x) => !rows.some((r) => sameSigner(r, x.s)),
  );

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const moveUp = (i: number) => setRows((rs) => (i <= 0 ? rs : [...rs.slice(0, i - 1), rs[i], rs[i - 1], ...rs.slice(i + 1)]));

  const submit = async () => {
    const signers = rows.filter((r) => r.name.trim() || r.email.trim());
    if (!signers.length) return toast.error(t('driveIntel.esign.needSigner'));
    setBusy(true);
    try {
      await sendForSignature(item.id, {
        title: title.trim(),
        caseId: caseId ?? null,
        message: message.trim() || null,
        expiresInDays: expires,
        order,
        signers: signers.map((r, i) => ({
          role: r.role,
          name: r.name.trim(),
          email: r.email.trim(),
          phone: r.phone?.trim() || null,
          userId: r.userId ?? null,
          locale: r.locale ?? null,
          order: order === 'PARALLEL' ? 1 : i + 1,
        })),
      });
      toast.success(t('driveIntel.esign.sent'));
      onSent();
      onClose();
    } catch (e) {
      toast.error(driveError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="inline-flex items-center gap-2">
          <PenLine className="size-4 text-link" aria-hidden />
          {t('driveIntel.esign.title')}
        </span>
      }
      description={item.name}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('admin.common.close')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={busy || title.trim().length < 2} onClick={() => void submit()}>
            {busy ? <Spinner className="size-3.5" /> : <PenLine className="size-3.5" aria-hidden />}
            {busy ? t('driveIntel.esign.sending') : t('driveIntel.esign.send')}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">{t('driveIntel.esign.hint')}</p>
        <div>
          <label htmlFor={ids.title} className="label">
            {t('driveIntel.esign.docTitle')}
          </label>
          <input id={ids.title} className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </div>

        {!item.caseId && (
          <div>
            <label htmlFor={ids.case} className="label">
              {t('driveIntel.esign.case')}
            </label>
            {caseHit ? (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-sunken px-3 py-2 text-sm">
                <span className="font-semibold text-ink">{caseHit.number}</span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {caseHit.client.firstName} {caseHit.client.lastName}
                </span>
                <button type="button" onClick={() => setCaseHit(null)} className="text-muted hover:text-ink" aria-label={t('driveIntel.esign.remove')}>
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                  <input id={ids.case} className="input pl-9" value={caseQuery} onChange={(e) => setCaseQuery(e.target.value)} placeholder="TV-2026-…" autoComplete="off" />
                </div>
                {!!hits.data?.length && caseQuery.trim().length >= 2 && (
                  <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-line bg-card">
                    {hits.data.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sunken"
                          onClick={() => {
                            setCaseHit(c);
                            setCaseQuery('');
                          }}
                        >
                          <span className="font-semibold text-ink">{c.number}</span>
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

        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-bold text-ink">{t('driveIntel.esign.signers')}</h3>
            {prefill.isFetching && <Spinner className="size-3.5" />}
          </div>
          {suggestions.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted">{t('driveIntel.esign.suggested')}:</span>
              {suggestions.map(({ s, me }) => (
                <button key={s.email} type="button" onClick={() => setRows((rs) => [...rs, row(s)])} className="inline-flex items-center gap-1 rounded-full border border-line bg-sunken px-2.5 py-1 font-medium text-ink hover:border-line-strong">
                  <UserPlus className="size-3.5" aria-hidden /> {s.name}
                  {me && <span className="text-muted">({t('driveIntel.esign.me')})</span>}
                </button>
              ))}
            </div>
          )}
          <ol className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.key} className="rounded-xl border border-line p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted">
                  <span className="grid size-6 place-items-center rounded-full bg-primary/[0.06] text-link dark:bg-brand-500/15 dark:text-brand-300">{order === 'PARALLEL' ? '•' : i + 1}</span>
                  <select className="input !w-auto !py-1 !text-xs" value={r.role} onChange={(e) => update(r.key, { role: e.target.value as SignerRole })} aria-label={t('driveIntel.esign.role')}>
                    {ROLES.map((x) => (
                      <option key={x} value={x}>
                        {t(`driveIntel.esign.roles.${x}`)}
                      </option>
                    ))}
                  </select>
                  <span className="flex-1" />
                  {order === 'SEQUENTIAL' && i > 0 && (
                    <button type="button" onClick={() => moveUp(i)} className="grid size-7 place-items-center rounded-lg hover:bg-sunken hover:text-ink" title={t('driveIntel.esign.moveUp')} aria-label={t('driveIntel.esign.moveUp')}>
                      <ArrowUp className="size-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="grid size-7 place-items-center rounded-lg text-danger-fg hover:bg-danger-bg" title={t('driveIntel.esign.remove')} aria-label={t('driveIntel.esign.remove')}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <input className="input !py-1.5 !text-sm" placeholder={t('driveIntel.esign.name')} value={r.name} onChange={(e) => update(r.key, { name: e.target.value, userId: null })} aria-label={t('driveIntel.esign.name')} />
                  <input className="input !py-1.5 !text-sm" type="email" placeholder={t('driveIntel.esign.email')} value={r.email} onChange={(e) => update(r.key, { email: e.target.value, userId: null })} aria-label={t('driveIntel.esign.email')} />
                  <input className="input !py-1.5 !text-sm" type="tel" placeholder={t('driveIntel.esign.phone')} value={r.phone ?? ''} onChange={(e) => update(r.key, { phone: e.target.value })} aria-label={t('driveIntel.esign.phone')} />
                </div>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => setRows((rs) => [...rs, row()])} className="btn-secondary btn-sm mt-2 border border-line">
            <Plus className="size-3.5" /> {t('driveIntel.esign.addSigner')}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.order} className="label">
              {t('driveIntel.esign.order')}
            </label>
            <select id={ids.order} className="input" value={order} onChange={(e) => setOrder(e.target.value as 'SEQUENTIAL' | 'PARALLEL')}>
              <option value="SEQUENTIAL">{t('driveIntel.esign.sequential')}</option>
              <option value="PARALLEL">{t('driveIntel.esign.parallel')}</option>
            </select>
          </div>
          <div>
            <label htmlFor={ids.expires} className="label">
              {t('driveIntel.esign.expires')}
            </label>
            <input id={ids.expires} className="input" type="number" min={1} max={90} value={expires} onChange={(e) => setExpires(Math.max(1, Math.min(90, Number(e.target.value) || 14)))} />
          </div>
        </div>
        <div>
          <label htmlFor={ids.message} className="label">
            {t('driveIntel.esign.message')}
          </label>
          <textarea id={ids.message} className="input min-h-20" maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
