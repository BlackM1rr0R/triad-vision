import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Briefcase, ExternalLink, FileSpreadsheet, FolderOpen, Handshake, Pencil, Phone, Plus, Search, UserPlus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { statusLabel } from '@/components/admin/labels';
import { STATUS_TONE } from '@/lib/caseStatus';
import type { CaseStatus } from '@/lib/types';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { PARTNERS_KEY, partnerError, useAssignPartner, usePartnerOptions, type Partner } from '@/components/partners/api';
import { driveKeys, startDownload } from './api';
import { sectionOf } from './fileIcons';
import type { DriveItem } from './types';

/** German names of the application types (the same names the drive folders carry). */
const VISA_TYPE_DE: Record<string, string> = {
  WORK: 'Arbeitsvisum',
  AUSBILDUNG: 'Ausbildung',
  WEITERBILDUNG: 'Weiterbildung',
  JOB_SEEKER: 'Jobsuche (Chancenkarte)',
  STUDY: 'Studienvisum',
  FAMILY: 'Familiennachzug',
  TOURIST: 'Besuchervisum',
};

/** Folder moves happen in the background on the server; refresh now and once more shortly after. */
const useRefreshDrive = () => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: driveKeys.all });
    void qc.invalidateQueries({ queryKey: PARTNERS_KEY });
    window.setTimeout(() => void qc.invalidateQueries({ queryKey: driveKeys.all }), 1200);
  };
};

/** Description strip of a fixed section (Anträge, Partner, In Bearbeitung, …). */
export const SectionHeader = ({ folder }: { folder: DriveItem }) => {
  const { t } = useTranslation();
  const s = sectionOf(folder);
  if (!s) return null;
  return (
    <div className={clsx('flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-4', s.bg)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-card shadow-sm">
        <s.icon className={clsx('size-5', s.tone)} strokeWidth={1.7} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-ink">{folder.name}</p>
        <p className="truncate text-xs text-muted">{t(s.desc)}</p>
      </div>
    </div>
  );
};

// ─── Partner dialogs ───────────────────────────────────────────────────

interface PartnerForm {
  name: string;
  phone: string;
  email: string;
  note: string;
  active: boolean;
}

/** Create or edit a referral partner (the partner's folder is created / renamed by the server). */
export const PartnerDialog = ({ open, partner, onClose, onSaved }: { open: boolean; partner: Partner | null; onClose: () => void; onSaved?: (folderId: string | null) => void }) => {
  const { t } = useTranslation();
  const refresh = useRefreshDrive();
  const [f, setF] = useState<PartnerForm>({ name: '', phone: '', email: '', note: '', active: true });
  useEffect(() => {
    if (open) setF({ name: partner?.name ?? '', phone: partner?.phone ?? '', email: partner?.email ?? '', note: partner?.note ?? '', active: partner?.active ?? true });
  }, [open, partner]);
  const save = useMutation({
    mutationFn: async () => {
      const body = { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), note: f.note.trim(), active: f.active };
      if (partner) return { folderId: null, ...(await api.patch(`/admin/partners/${partner.id}`, body)).data };
      return (await api.post<{ folderId: string | null }>('/admin/partners', body)).data;
    },
    onSuccess: (data) => {
      toast.success(t(partner ? 'drive.partner.saved' : 'drive.partner.created'));
      refresh();
      onSaved?.(data.folderId ?? null);
      onClose();
    },
    onError: partnerError,
  });
  const field = (key: 'name' | 'phone' | 'email', type = 'text') => (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold text-muted">{t(`drive.partner.${key}`)}</span>
      <input type={type} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} className="input" maxLength={key === 'name' ? 120 : 191} required={key === 'name'} data-autofocus={key === 'name' || undefined} />
    </label>
  );
  return (
    <Modal
      open={open}
      onClose={() => !save.isPending && onClose()}
      size="sm"
      title={t(partner ? 'drive.partner.editTitle' : 'drive.partner.newPartner')}
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose} disabled={save.isPending}>
            {t('drive.partner.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!f.name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner className="size-3.5" />} {t('drive.partner.save')}
          </button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (f.name.trim()) save.mutate();
        }}
      >
        {field('name')}
        <div className="grid gap-3 sm:grid-cols-2">
          {field('phone', 'tel')}
          {field('email', 'email')}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-muted">{t('drive.partner.note')}</span>
          <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className="input min-h-20" maxLength={5000} />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="size-4 accent-brand-600" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
          {t('drive.partner.isActive')}
        </label>
      </form>
    </Modal>
  );
};

interface CaseRow {
  id: string;
  number: string;
  status: CaseStatus;
  client: { firstName: string; lastName: string };
  partner?: { id: string; name: string } | null;
}

/** Search applications and link the selected ones to a partner (their folders move into the partner folder). */
export const AssignClientsDialog = ({ partner, onClose }: { partner: { id: string; name: string } | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const refresh = useRefreshDrive();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    const h = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(h);
  }, [q]);
  useEffect(() => {
    if (partner) {
      setQ('');
      setPicked(new Set());
    }
  }, [partner]);
  const cases = useQuery({
    queryKey: ['drive', 'assign-cases', debounced],
    queryFn: async () => (await api.get<{ items: CaseRow[] }>('/admin/cases', { params: { search: debounced || undefined } })).data.items,
    enabled: !!partner,
  });
  const assign = useAssignPartner();
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <Modal
      open={!!partner}
      onClose={() => !assign.isPending && onClose()}
      size="md"
      title={t('drive.partner.assignTitle', { name: partner?.name ?? '' })}
      description={t('drive.partner.assignHint')}
      footer={
        <>
          <span className="mr-auto text-xs text-muted">{t('drive.partner.selectedN', { count: picked.size })}</span>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose} disabled={assign.isPending}>
            {t('drive.partner.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={!picked.size || assign.isPending}
            onClick={() =>
              partner &&
              assign.mutate(
                { caseIds: [...picked], partnerId: partner.id },
                {
                  onSuccess: (r) => {
                    toast.success(t('drive.partner.assigned', { count: r.updated }));
                    refresh();
                    onClose();
                  },
                },
              )
            }
          >
            {assign.isPending && <Spinner className="size-3.5" />} {t('drive.partner.assign')}
          </button>
        </>
      }
    >
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('drive.partner.searchCases')} className="input !pl-9" data-autofocus />
      </div>
      <ul className="max-h-80 min-h-32 overflow-y-auto rounded-xl border border-line">
        {cases.isLoading ? (
          <li className="grid place-items-center py-8">
            <Spinner />
          </li>
        ) : !cases.data?.length ? (
          <li className="px-3 py-6 text-center text-xs text-muted">{t('drive.partner.noCases')}</li>
        ) : (
          cases.data.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface">
                <input type="checkbox" className="size-4 accent-brand-600" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">
                    {c.client.firstName} {c.client.lastName}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {c.number}
                    {c.partner ? ` · ${c.partner.name}` : ''}
                  </span>
                </span>
                <span className={clsx('shrink-0 rounded px-1.5 py-px text-[10px] font-semibold', STATUS_TONE[c.status])}>{statusLabel(c.status)}</span>
              </label>
            </li>
          ))
        )}
      </ul>
    </Modal>
  );
};

// ─── Partner section and partner folders ───────────────────────────────

const Count = ({ icon: Icon, label }: { icon: typeof Users; label: string }) => (
  <span className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink/80">
    <Icon className="size-3 text-muted" /> {label}
  </span>
);

/**
 * "Partner" section: one card per referral partner with counts and actions (new, edit, assign clients,
 * open the partner's folder). The folders themselves are listed below as usual.
 */
export const PartnersOverview = ({ items, onOpen }: { items: DriveItem[]; onOpen: (folderId: string) => void }) => {
  const { t } = useTranslation();
  const partners = usePartnerOptions();
  const [edit, setEdit] = useState<{ partner: Partner | null } | null>(null);
  const [assignTo, setAssignTo] = useState<Partner | null>(null);
  const folderOf = (p: Partner) => items.find((i) => i.partner?.id === p.id)?.id ?? null;
  return (
    <div className="border-b border-line px-3 py-3 sm:px-4">
      <div className="mb-2 flex items-center gap-2">
        <Handshake className="size-4 text-teal-600" />
        <h2 className="text-sm font-bold text-ink">{t('drive.partner.label')}</h2>
        <button type="button" className="btn-primary btn-sm ml-auto !rounded-lg" onClick={() => setEdit({ partner: null })}>
          <Plus className="size-4" /> {t('drive.partner.newPartner')}
        </button>
      </div>
      {partners.isLoading ? (
        <div className="grid place-items-center py-4">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2">
          {(partners.data ?? []).map((p) => {
            const folderId = folderOf(p);
            return (
              <div key={p.id} className={clsx('flex flex-col rounded-xl border border-line bg-card p-3 shadow-sm', !p.active && 'opacity-70')}>
                <div className="flex items-start gap-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-sm font-bold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">{p.name.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink" title={p.name}>
                      {p.name}
                    </p>
                    <p className="truncate text-xs text-muted">{p.phone || p.email || '—'}</p>
                  </div>
                  {!p.active && <span className="shrink-0 rounded bg-surface px-1.5 py-px text-[10px] font-semibold text-muted">{t('drive.partner.inactive')}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Count icon={Users} label={t('drive.partner.clients', { count: p.counts?.clients ?? 0 })} />
                  <Count icon={Briefcase} label={t('drive.partner.active', { count: p.counts?.activeCases ?? 0 })} />
                  <Count icon={FolderOpen} label={t('drive.partner.approved', { count: p.counts?.approved ?? 0 })} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button type="button" disabled={!folderId} className="btn-white btn-sm border border-line !px-2" onClick={() => folderId && onOpen(folderId)}>
                    <FolderOpen className="size-3.5" /> {t('drive.partner.openFolder')}
                  </button>
                  <button type="button" className="btn-white btn-sm border border-line !px-2" onClick={() => setAssignTo(p)} title={t('drive.partner.assign')}>
                    <UserPlus className="size-3.5" />
                    <span className="sr-only">{t('drive.partner.assign')}</span>
                  </button>
                  <button type="button" className="btn-white btn-sm border border-line !px-2" onClick={() => setEdit({ partner: p })} title={t('drive.partner.edit')}>
                    <Pencil className="size-3.5" />
                    <span className="sr-only">{t('drive.partner.edit')}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <PartnerDialog open={!!edit} partner={edit?.partner ?? null} onClose={() => setEdit(null)} onSaved={(id) => id && onOpen(id)} />
      <AssignClientsDialog partner={assignTo} onClose={() => setAssignTo(null)} />
    </div>
  );
};

/** Info strip of one partner's folder: phone, client count, Excel, edit, assign clients. */
export const PartnerFolderHeader = ({ folder }: { folder: DriveItem }) => {
  const { t } = useTranslation();
  const partners = usePartnerOptions();
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const p = partners.data?.find((x) => x.id === folder.partner?.id) ?? null;
  if (!folder.partner) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-teal-50/60 px-3 py-2 text-xs text-teal-900 sm:px-4 dark:bg-teal-500/10 dark:text-teal-100">
      <Handshake className="size-4 shrink-0" />
      <span className="font-bold">{folder.partner.name}</span>
      {folder.partner.phone && (
        <a href={`tel:${folder.partner.phone}`} className="inline-flex items-center gap-1 hover:underline">
          <Phone className="size-3.5" /> {folder.partner.phone}
        </a>
      )}
      <span className="inline-flex items-center gap-1">
        <Users className="size-3.5" /> {t('drive.partner.clients', { count: p?.counts?.clients ?? 0 })}
      </span>
      {!folder.partner.active && <span className="rounded bg-card px-1.5 py-px font-semibold text-muted">{t('drive.partner.inactive')}</span>}
      <span className="ml-auto flex flex-wrap gap-1.5">
        <button type="button" className="btn-white btn-sm border border-line !px-2" onClick={() => startDownload(`/api/admin/partners/${encodeURIComponent(folder.partner!.id)}/export.xlsx`)}>
          <FileSpreadsheet className="size-3.5 text-emerald-600" /> {t('drive.partner.excel')}
        </button>
        <button type="button" className="btn-white btn-sm border border-line !px-2" onClick={() => setAssigning(true)}>
          <UserPlus className="size-3.5" /> {t('drive.partner.assign')}
        </button>
        <button type="button" className="btn-white btn-sm border border-line !px-2" disabled={!p} onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" /> {t('drive.partner.edit')}
        </button>
      </span>
      <PartnerDialog open={editing} partner={p} onClose={() => setEditing(false)} />
      <AssignClientsDialog partner={assigning ? folder.partner : null} onClose={() => setAssigning(false)} />
    </div>
  );
};

/**
 * Header strip of a client folder: client, passport no., visa type, case status, partner and a link to
 * the case. Without a partner, "Partner zuweisen" moves the folder into the partner's folder.
 */
export const ClientFolderHeader = ({ folder }: { folder: DriveItem }) => {
  const { t } = useTranslation();
  const refresh = useRefreshDrive();
  const partners = usePartnerOptions();
  const assign = useAssignPartner();
  if (!folder.caseId) return null;
  const info = folder.caseInfo;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-violet-50/60 px-3 py-2 text-xs text-violet-900 sm:px-4 dark:bg-violet-500/10 dark:text-violet-100">
      <Briefcase className="size-4 shrink-0" />
      {info && <span className="font-bold">{info.clientName}</span>}
      {info?.passportNumber && (
        <span>
          {t('drive.partner.passport')}: <span className="font-semibold">{info.passportNumber}</span>
        </span>
      )}
      {info && <span>{VISA_TYPE_DE[info.visaType] ?? info.visaType}</span>}
      {folder.caseStatus && <span className={clsx('rounded px-1.5 py-px text-[10px] font-semibold', STATUS_TONE[folder.caseStatus as CaseStatus])}>{statusLabel(folder.caseStatus as CaseStatus)}</span>}
      {info?.partner ? (
        <span className="inline-flex items-center gap-1">
          <Handshake className="size-3.5" /> {info.partner.name}
        </span>
      ) : (
        <label className="inline-flex items-center gap-1.5">
          <Handshake className="size-3.5" />
          <select
            aria-label={t('drive.partner.assignPartner')}
            className="input min-h-7 w-auto max-w-[12rem] !py-0.5 pr-7 pl-2 text-xs"
            value=""
            disabled={assign.isPending || !partners.data}
            onChange={(e) =>
              e.target.value &&
              assign.mutate(
                { caseIds: [folder.caseId!], partnerId: e.target.value },
                {
                  onSuccess: () => {
                    toast.success(t('drive.partner.assigned', { count: 1 }));
                    refresh();
                  },
                },
              )
            }
          >
            <option value="">{t('drive.partner.assignPartner')}</option>
            {(partners.data ?? [])
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          {assign.isPending && <Spinner className="size-3.5" />}
        </label>
      )}
      <Link to={`/admin/cases/${folder.caseId}`} className="ml-auto inline-flex items-center gap-1 font-semibold hover:underline">
        <ExternalLink className="size-3.5" /> {t('drive.actions.openCase')} {folder.caseNumber}
      </Link>
    </div>
  );
};
