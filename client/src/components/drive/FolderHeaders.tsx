import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Ban, Briefcase, ExternalLink, FileSpreadsheet, FolderOpen, FolderPlus, Handshake, Info, Pencil, Phone, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { statusLabel } from '@/components/admin/labels';
import { STATUS_TONE } from '@/lib/caseStatus';
import type { CaseStatus } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { PARTNERS_KEY, partnerError, useAssignPartner, usePartnerOptions, type Partner } from '@/components/partners/api';
import { DeletePartnerDialog } from '@/components/partners/DeletePartnerDialog';
import { AddClientsDialog } from '@/components/partners/AddClientsDialog'; // hides already linked applications
import { PartnerFormDialog } from '@/components/partners/PartnerForm';
import { PartnerKeyInfo } from '@/components/partners/PartnerProfile';
import { PartnerInfoDrawer } from '@/components/partners/PartnerInfoDrawer';
import { useAuth } from '@/lib/auth';
import { driveKeys, startDownload } from './api';
import { sectionOf } from './fileIcons';
import { ReadinessIndicator } from './org/Readiness';
import type { DriveItem } from './types';
import { SensitiveValue } from '@/components/privacyTools/SensitiveValue';

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

/** Description strip of a fixed section (Anträge, Partner, Mitarbeiter, …). */
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

/**
 * Create or edit a referral partner with the shared partner form (components/partners/PartnerForm: profile,
 * bank data for admins, custom fields); the server creates / renames the partner's folder.
 */
export const PartnerDialog = ({ open, partner, onClose, onSaved }: { open: boolean; partner: Partner | null; onClose: () => void; onSaved?: (folderId: string | null) => void }) => {
  const refresh = useRefreshDrive();
  return (
    <PartnerFormDialog
      open={open}
      partner={partner}
      onClose={onClose}
      onSaved={(r) => {
        refresh();
        onSaved?.(r.folderId);
      }}
    />
  );
};

/**
 * Search applications and link the selected ones to a partner (their folders move into the partner folder).
 * The shared partner picker (components/partners/AddClientsDialog) hides applications already linked to it.
 */
export const AssignClientsDialog = ({ partner, onClose }: { partner: { id: string; name: string } | null; onClose: () => void }) => {
  const refresh = useRefreshDrive();
  return <AddClientsDialog partner={partner} onClose={onClose} onDone={refresh} />;
};

// ─── Partner section and partner folders ───────────────────────────────

const Count = ({ icon: Icon, label }: { icon: typeof Users; label: string }) => (
  <span className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink/80">
    <Icon className="size-3 text-muted" /> {label}
  </span>
);

/**
 * "Partner" section: one card per referral partner with counts and actions (new, edit, assign clients,
 * open the partner's folder). In the Drive's partner section these cards replace the partner folder tiles (the
 * listing below them shows only other items kept there); `items` is the unfiltered listing of the section.
 */
export const PartnersOverview = ({ items, onOpen }: { items: DriveItem[]; onOpen: (folderId: string) => void }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canDelete = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const refresh = useRefreshDrive();
  const partners = usePartnerOptions();
  const [edit, setEdit] = useState<{ partner: Partner | null } | null>(null);
  const [assignTo, setAssignTo] = useState<Partner | null>(null);
  const [deleting, setDeleting] = useState<Partner | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
  // The listing of this section is the truth; the partner list's folderId covers the moment before it loads.
  const folderOf = (p: Partner) => items.find((i) => i.partner?.id === p.id)?.id ?? (items.length ? null : (p.folderId ?? null));
  /** A partner whose folder was deleted (or never made): restored from the bin or created again, then opened. */
  const ensureFolder = useMutation({
    mutationFn: async (p: Partner) => (await api.post<{ folderId: string; restored: boolean; created: boolean }>(`/admin/partners/${encodeURIComponent(p.id)}/folder`)).data,
    onSuccess: (r) => {
      if (r.restored) toast.success(t('drive.partner.folderRestored'));
      else if (r.created) toast.success(t('drive.partner.folderCreated'));
      refresh();
      onOpen(r.folderId);
    },
    onError: partnerError,
  });
  return (
    <div className="border-b border-line px-3 py-3 sm:px-5 sm:py-4">
      <div className="mb-3 flex items-center gap-2">
        <Handshake className="size-4 text-teal-600" />
        <h2 className="text-sm font-bold text-ink">{t('drive.partner.label')}</h2>
        {!!partners.data?.length && <span className="rounded-full bg-surface px-2 py-px text-xs font-semibold text-muted">{partners.data.length}</span>}
        <button type="button" className="btn-primary btn-sm ml-auto !rounded-lg" onClick={() => setEdit({ partner: null })}>
          <Plus className="size-4" /> {t('drive.partner.newPartner')}
        </button>
      </div>
      {partners.isLoading ? (
        <div className="grid place-items-center py-4">
          <Spinner />
        </div>
      ) : !partners.data?.length ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
          <FolderOpen className="mx-auto size-9 text-muted" strokeWidth={1.4} aria-hidden />
          <p className="mt-2 text-sm font-bold text-ink">{t('drive.shared.emptyPartners')}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t('drive.shared.emptyPartnersHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
          {(partners.data ?? []).map((p) => {
            const folderId = folderOf(p);
            const creating = ensureFolder.isPending && ensureFolder.variables?.id === p.id;
            return (
              <div key={p.id} className={clsx('flex flex-col rounded-xl border bg-card p-3 shadow-sm', folderId ? 'border-line' : 'border-dashed border-line', !p.active && 'opacity-70')}>
                <div className="flex items-start gap-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-sm font-bold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">{p.name.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <button type="button" className="block max-w-full truncate text-left text-sm font-bold text-ink hover:underline" title={p.name} aria-haspopup="dialog" onClick={() => setInfoId(p.id)}>
                      {p.name}
                    </button>
                    <p className="truncate text-xs text-muted">{p.phone || p.email || '—'}</p>
                  </div>
                  {!p.active && <span className="shrink-0 rounded bg-surface px-1.5 py-px text-[10px] font-semibold text-muted">{t('drive.partner.inactive')}</span>}
                </div>
                <PartnerKeyInfo partner={p} className="mt-1.5" />
                <div className="mt-2 flex flex-wrap gap-1">
                  <Count icon={Users} label={t('drive.partner.clients', { count: p.counts?.clients ?? 0 })} />
                  <Count icon={Briefcase} label={t('drive.partner.active', { count: p.counts?.activeCases ?? 0 })} />
                  <Count icon={FolderOpen} label={t('drive.partner.approved', { count: p.counts?.approved ?? 0 })} />
                  {/* Visa refused ("rədd"): REJECTED or marked "Ablehnung" (pagesCaseProcessing, registered by partners/api). */}
                  <Count icon={Ban} label={t('drive.partner.rejected', { count: p.counts?.rejected ?? 0 })} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {folderId ? (
                    <button type="button" className="btn-secondary btn-sm !px-2" onClick={() => onOpen(folderId)}>
                      <FolderOpen className="size-3.5" /> {t('drive.partner.openFolder')}
                    </button>
                  ) : (
                    <button type="button" className="btn-secondary btn-sm border border-dashed border-teal-400 !px-2 text-teal-700 dark:text-teal-300" disabled={ensureFolder.isPending} onClick={() => ensureFolder.mutate(p)}>
                      {creating ? <Spinner className="size-3.5" /> : <FolderPlus className="size-3.5" />} {t('drive.partner.noFolder')}
                    </button>
                  )}
                  <button type="button" className="btn-secondary btn-sm !px-2" aria-haspopup="dialog" onClick={() => setInfoId(p.id)}>
                    <Info className="size-3.5" /> {t('drive.partner.info')}
                  </button>
                  <button type="button" className="btn-secondary btn-sm !px-2" onClick={() => setAssignTo(p)} title={t('drive.partner.assign')}>
                    <UserPlus className="size-3.5" />
                    <span className="sr-only">{t('drive.partner.assign')}</span>
                  </button>
                  <button type="button" className="btn-secondary btn-sm !px-2" onClick={() => setEdit({ partner: p })} title={t('drive.partner.edit')}>
                    <Pencil className="size-3.5" />
                    <span className="sr-only">{t('drive.partner.edit')}</span>
                  </button>
                  {canDelete && (
                    <button type="button" className="btn-secondary btn-sm !px-2 text-danger-fg" onClick={() => setDeleting(p)} title={t('drive.partner.deletePartner')}>
                      <Trash2 className="size-3.5" />
                      <span className="sr-only">{t('drive.partner.deletePartner')}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <PartnerDialog open={!!edit} partner={edit?.partner ?? null} onClose={() => setEdit(null)} onSaved={(id) => id && onOpen(id)} />
      <AssignClientsDialog partner={assignTo} onClose={() => setAssignTo(null)} />
      <DeletePartnerDialog partner={deleting} onClose={() => setDeleting(null)} />
      <PartnerInfoDrawer partnerId={infoId} onClose={() => setInfoId(null)} isAdmin={canDelete} />
    </div>
  );
};

/** Info strip of one partner's folder: phone, client count, Excel, edit, assign clients. */
export const PartnerFolderHeader = ({ folder }: { folder: DriveItem }) => {
  const { t } = useTranslation();
  const partners = usePartnerOptions();
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [info, setInfo] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const canDelete = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
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
        <button type="button" className="btn-secondary btn-sm !px-2" aria-haspopup="dialog" onClick={() => setInfo(true)}>
          <Info className="size-3.5" /> {t('drive.partner.info')}
        </button>
        <button type="button" className="btn-secondary btn-sm !px-2" onClick={() => startDownload(`/api/admin/partners/${encodeURIComponent(folder.partner!.id)}/export.xlsx`)}>
          <FileSpreadsheet className="size-3.5 text-emerald-600" /> {t('drive.partner.excel')}
        </button>
        <button type="button" className="btn-secondary btn-sm !px-2" onClick={() => setAssigning(true)}>
          <UserPlus className="size-3.5" /> {t('drive.partner.assign')}
        </button>
        <button type="button" className="btn-secondary btn-sm !px-2" disabled={!p} onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" /> {t('drive.partner.edit')}
        </button>
        {canDelete && (
          <button type="button" className="btn-secondary btn-sm !px-2 text-danger-fg" disabled={!p} onClick={() => setDeleting(true)}>
            <Trash2 className="size-3.5" /> {t('drive.partner.deletePartner')}
          </button>
        )}
      </span>
      <PartnerDialog open={editing} partner={p} onClose={() => setEditing(false)} />
      <DeletePartnerDialog
        partner={deleting ? p : null}
        onClose={() => setDeleting(false)}
        // The (now empty) folder may have gone to the bin: back to the "Partner" section.
        onDeleted={() => folder.parentId && navigate(`/workspace/drive/f/${encodeURIComponent(folder.parentId)}`)}
      />
      <AssignClientsDialog partner={assigning ? folder.partner : null} onClose={() => setAssigning(false)} />
      <PartnerInfoDrawer partnerId={info ? folder.partner.id : null} onClose={() => setInfo(false)} isAdmin={canDelete} />
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
  const { user } = useAuth();
  const [partnerInfo, setPartnerInfo] = useState(false);
  if (!folder.caseId) return null;
  const info = folder.caseInfo;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-violet-50/60 px-3 py-2 text-xs text-violet-900 sm:px-4 dark:bg-violet-500/10 dark:text-violet-100">
      <Briefcase className="size-4 shrink-0" />
      {info && <span className="font-bold">{info.clientName}</span>}
      {info?.passportNumber && (
        <span>
          {t('drive.partner.passport')}:{' '}
          {info.clientId ? <SensitiveValue value={info.passportNumber} entity="user" id={info.clientId} field="passportNumber" className="font-semibold" /> : <span className="font-semibold">{info.passportNumber}</span>}
        </span>
      )}
      {info && <span>{VISA_TYPE_DE[info.visaType] ?? info.visaType}</span>}
      {folder.caseStatus && <span className={clsx('rounded px-1.5 py-px text-[10px] font-semibold', STATUS_TONE[folder.caseStatus as CaseStatus])}>{statusLabel(folder.caseStatus as CaseStatus)}</span>}
      {info?.partner ? (
        // The partner's name opens the same details panel as the partner cards and the partner list.
        <button type="button" className="inline-flex items-center gap-1 hover:underline" aria-haspopup="dialog" title={t('drive.partner.info')} onClick={() => setPartnerInfo(true)}>
          <Handshake className="size-3.5" /> {info.partner.name}
        </button>
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
      <ReadinessIndicator caseId={folder.caseId} />
      <Link to={`/admin/cases/${folder.caseId}`} className="ml-auto inline-flex items-center gap-1 font-semibold hover:underline">
        <ExternalLink className="size-3.5" /> {t('drive.actions.openCase')} {folder.caseNumber}
      </Link>
      <PartnerInfoDrawer partnerId={partnerInfo && info?.partner ? info.partner.id : null} onClose={() => setPartnerInfo(false)} isAdmin={user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'} />
    </div>
  );
};
