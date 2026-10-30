import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Copy, History, Link2, RefreshCw, UserRoundCog } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPartnerClients } from '@/i18n/pagesPartnerClients';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { fmtDate, fmtDateTime } from '@/components/admin/labels';
import { PARTNERS_KEY, partnerError, usePartnerOptions, type Partner } from './api';

registerCopy(pagesPartnerClients);

/**
 * Partner-owned clients on the admin side (server lib/partners/owned.ts): the partner's sign-up code and
 * links, the commission rule and what the partner sees (ADMIN+), the partner's own clients, and the dialog
 * that changes the owning partner of a client (ADMIN+, with history).
 */

export type CommissionTrigger = 'ASSIGNED' | 'CONTRACT_SIGNED' | 'VISA_APPROVED';
export type PartnerVisibility = 'MINIMAL' | 'EXTENDED';
const TRIGGERS: CommissionTrigger[] = ['ASSIGNED', 'CONTRACT_SIGNED', 'VISA_APPROVED'];
const VISIBILITIES: PartnerVisibility[] = ['MINIMAL', 'EXTENDED'];

/** Fields of GET /admin/partners/:id that belong to client ownership. */
export interface PartnerOwnershipFields {
  code?: string | null;
  shareLink?: string | null;
  shortLink?: string | null;
  commissionTrigger?: CommissionTrigger;
  visibility?: PartnerVisibility;
}

export interface OwnedClient {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  createdAt: string;
  ownerPartnerAt: string | null;
}

const CopyButton = ({ value }: { value: string }) => {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost btn-sm"
      aria-label={t('partnerClients.link.copy')}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        } catch {
          // clipboard blocked: the value stays selectable
        }
      }}
    >
      {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  );
};

/** Code, links, commission rule, visibility and the partner's own clients (admin partner page). */
export const OwnershipPanel = ({ partner, ownedClients, isAdmin }: { partner: Partner & PartnerOwnershipFields; ownedClients: OwnedClient[]; isAdmin: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [code, setCode] = useState(partner.code ?? '');
  const [ownerOf, setOwnerOf] = useState<OwnedClient | null>(null);
  useEffect(() => setCode(partner.code ?? ''), [partner.code]);
  const refresh = () => qc.invalidateQueries({ queryKey: PARTNERS_KEY });
  const onError = (err: unknown) => (errorCode(err) === 'PARTNER_CODE_TAKEN' ? toast.error(t('partnerClients.admin.codeTaken')) : partnerError(err));

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => api.patch(`/admin/partners/${partner.id}`, body),
    onSuccess: async () => {
      toast.success(t('partnerClients.admin.saved'));
      await refresh();
    },
    onError,
  });
  const generate = useMutation({
    mutationFn: async () => api.post(`/admin/partners/${partner.id}/code`),
    onSuccess: async () => {
      toast.success(t('partnerClients.admin.saved'));
      await refresh();
    },
    onError,
  });
  const links = [partner.shortLink, partner.shareLink].filter((l): l is string => !!l);

  return (
    <section className="card mb-5 p-4 sm:p-5">
      <h2 className="type-card-title mb-3 flex items-center gap-2">
        <Link2 className="size-4 text-link" aria-hidden /> {t('partnerClients.admin.section')}
      </h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-2">
          <label className="block">
            <span className="label">{t('partnerClients.admin.code')}</span>
            <div className="flex gap-2">
              <input
                className="input font-mono uppercase"
                maxLength={32}
                value={code}
                disabled={!isAdmin}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32))}
              />
              {isAdmin && code !== (partner.code ?? '') && (
                <button type="button" className="btn-primary btn-sm" disabled={patch.isPending || (code.length > 0 && code.length < 3)} onClick={() => patch.mutate({ code: code || null })}>
                  {t('partnerClients.admin.ownerSave')}
                </button>
              )}
            </div>
          </label>
          {isAdmin && (
            <button type="button" className="btn-ghost btn-sm" disabled={generate.isPending} onClick={() => generate.mutate()}>
              {generate.isPending ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" aria-hidden />} {t('partnerClients.admin.generate')}
            </button>
          )}
          {links.map((l) => (
            <p key={l} className="flex items-center gap-1 rounded-lg bg-sunken px-2 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate font-mono text-ink/80">{l}</span>
              <CopyButton value={l} />
            </p>
          ))}
        </div>
        <label className="block">
          <span className="label">{t('partnerClients.admin.trigger')}</span>
          <select className="input" disabled={!isAdmin || patch.isPending} value={partner.commissionTrigger ?? 'ASSIGNED'} onChange={(e) => patch.mutate({ commissionTrigger: e.target.value })}>
            {TRIGGERS.map((k) => (
              <option key={k} value={k}>
                {t(`partnerClients.admin.triggers.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">{t('partnerClients.admin.visibility')}</span>
          <select className="input" disabled={!isAdmin || patch.isPending} value={partner.visibility ?? 'MINIMAL'} onChange={(e) => patch.mutate({ visibility: e.target.value })}>
            {VISIBILITIES.map((k) => (
              <option key={k} value={k}>
                {t(`partnerClients.admin.visibilities.${k}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!isAdmin && <p className="mt-2 text-xs text-muted">{t('partnerClients.admin.adminOnly')}</p>}

      <h3 className="mt-5 mb-2 text-sm font-semibold text-ink">
        {t('partnerClients.admin.owned')} <span className="text-muted tabular-nums">({ownedClients.length})</span>
      </h3>
      {ownedClients.length === 0 ? (
        <p className="text-sm text-muted">{t('partnerClients.admin.ownedEmpty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {ownedClients.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <Link to={`/admin/users?search=${encodeURIComponent(c.email)}`} className="truncate text-sm font-semibold text-ink hover:text-link">
                  {c.firstName} {c.lastName}
                </Link>
                <p className="truncate text-xs text-muted">
                  {c.email}
                  {c.phone ? ` · ${c.phone}` : ''} · {t('partnerClients.admin.since')} {fmtDate(c.ownerPartnerAt ?? c.createdAt)}
                </p>
              </div>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setOwnerOf(c)}>
                <UserRoundCog className="size-3.5" aria-hidden /> {t('partnerClients.admin.changeOwner')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <ClientOwnerDialog userId={ownerOf?.id ?? null} name={ownerOf ? `${ownerOf.firstName} ${ownerOf.lastName}` : ''} isAdmin={isAdmin} onClose={() => setOwnerOf(null)} />
    </section>
  );
};

interface OwnerView {
  owner: { id: string; name: string; code: string | null } | null;
  ownedSince: string | null;
  history: { id: string; source: 'SIGNUP_LINK' | 'PARTNER_PORTAL' | 'ADMIN'; from: { name: string | null } | null; to: { name: string | null } | null; actor: string | null; note: string | null; createdAt: string }[];
}

/** The client's owning partner with its history; ADMIN+ change it (PATCH /admin/partners/clients/:id/owner). */
export const ClientOwnerDialog = ({ userId, name, isAdmin, onClose }: { userId: string | null; name: string; isAdmin: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const partners = usePartnerOptions();
  const q = useQuery({
    queryKey: ['partner-client-owner', userId],
    queryFn: async () => (await api.get<OwnerView>(`/admin/partners/clients/${userId}/owner`)).data,
    enabled: !!userId,
  });
  const [partnerId, setPartnerId] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    setPartnerId(q.data?.owner?.id ?? '');
    setNote('');
  }, [q.data?.owner?.id, userId]);
  const save = useMutation({
    mutationFn: async () => api.patch(`/admin/partners/clients/${userId}/owner`, { partnerId: partnerId || null, note: note.trim() || undefined }),
    onSuccess: async () => {
      toast.success(t('partnerClients.admin.ownerSaved'));
      await Promise.all([qc.invalidateQueries({ queryKey: PARTNERS_KEY }), qc.invalidateQueries({ queryKey: ['partner-client-owner', userId] }), qc.invalidateQueries({ queryKey: ['admin-users'] })]);
      onClose();
    },
    onError: partnerError,
  });
  const changed = partnerId !== (q.data?.owner?.id ?? '');
  return (
    <Modal
      open={!!userId}
      onClose={() => !save.isPending && onClose()}
      title={`${t('partnerClients.admin.ownerTitle')}: ${name}`}
      size="sm"
      footer={
        isAdmin ? (
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={save.isPending}>
              {t('partnerClients.register.cancel')}
            </button>
            <button type="button" className="btn-primary" onClick={() => save.mutate()} disabled={!changed || save.isPending}>
              {save.isPending && <Spinner className="size-4" />} {t('partnerClients.admin.ownerSave')}
            </button>
          </div>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <Spinner className="size-5" />
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="label">{t('partnerClients.admin.filter')}</span>
            <select className="input" value={partnerId} disabled={!isAdmin} onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">{t('partnerClients.admin.ownerNone')}</option>
              {(partners.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {isAdmin ? (
            <label className="block">
              <span className="label">{t('partnerClients.admin.ownerNote')}</span>
              <input className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          ) : (
            <p className="text-xs text-muted">{t('partnerClients.admin.adminOnly')}</p>
          )}
          {!!q.data?.history.length && (
            <div>
              <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <History className="size-3.5" aria-hidden /> {t('partnerClients.admin.history')}
              </h3>
              <ul className="space-y-1 text-xs text-ink/80">
                {q.data.history.map((h) => (
                  <li key={h.id}>
                    <span className="text-muted">{fmtDateTime(h.createdAt)}</span> · {t(`partnerClients.admin.sources.${h.source}`)} · {h.from?.name ?? '—'} → {h.to?.name ?? '—'}
                    {h.actor ? ` · ${h.actor}` : ''}
                    {h.note ? ` · ${h.note}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
