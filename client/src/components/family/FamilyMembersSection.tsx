import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ArrowRight, Baby, ChevronDown, Heart, Pencil, Plus, Trash2, UserRound, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesFamilyLanguage } from '@/i18n/pagesFamilyLanguage';
import { Spinner } from '@/components/ui/Spinner';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { StatusBadge } from '@/components/portal/StatusBadge';
import { CaseDocuments, UPLOAD_STAGE } from '@/components/portal/CaseDocuments';
import { useApiError } from '@/components/portal/useApiError';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { useFamilyOverview, useFamilyRefresh } from './api';
import { MemberFormFields } from './MemberFormFields';
import { bodyFromForm, emptyMemberForm, formFromProfile, memberName, type ChecklistState, type FamilyMemberSummary, type FamilyRelation, type MemberForm } from './types';

registerCopy(pagesFamilyLanguage);

export const RELATION_ICON: Record<FamilyRelation, typeof Heart> = { spouse: Heart, child: Baby, parent: UserRound, other: UserRound };
export const STATE_TONE: Record<ChecklistState, string> = toneClasses(STATUS_TONES.checklist);

/** Progress bar of the member's required documents. */
export const MemberProgress = ({ m }: { m: FamilyMemberSummary }) => {
  const { t } = useTranslation();
  const pct = m.counts.required ? Math.round((m.counts.accepted / m.counts.required) * 100) : 100;
  return (
    <div className="mt-2 flex items-center gap-2.5">
      <span className="relative h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-line" role="img" aria-label={`${pct}%`}>
        <span className="absolute inset-y-0 left-0 rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs whitespace-nowrap text-muted">{t('familyMembers.progress', { accepted: m.counts.accepted, required: m.counts.required })}</span>
    </div>
  );
};

/** The member's own case loaded on demand: its documents section with the normal upload flow. */
const MemberDocuments = ({ caseId, onChanged }: { caseId: string; onChanged: () => Promise<unknown> }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['case', caseId],
    queryFn: async () => (await api.get<{ case: CaseDetail }>(`/cases/${caseId}`)).data.case,
    staleTime: 10_000,
  });
  if (isLoading || !data) {
    return (
      <p className="flex items-center gap-2 px-1 py-4 text-sm text-muted">
        <Spinner className="size-4" /> {t('familyMembers.loading')}
      </p>
    );
  }
  const stage = UPLOAD_STAGE[data.status] ?? (data.requirements.some((r) => r.stage === 'EMBASSY') ? 'EMBASSY' : 'INITIAL');
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['case', caseId] }), onChanged()]);
  return (
    <div className="space-y-3">
      {!UPLOAD_STAGE[data.status] && <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">{t('familyMembers.uploadClosed')}</p>}
      <CaseDocuments data={data} stage={stage} onChanged={refresh} />
    </div>
  );
};

const MemberCard = ({ m, onEdit, onRemove }: { m: FamilyMemberSummary; onEdit: () => void; onRemove: () => void }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const refresh = useFamilyRefresh();
  const [open, setOpen] = useState(m.counts.missing + m.counts.rejected > 0 && !m.final);
  const Icon = RELATION_ICON[m.relation] ?? UserRound;
  const docsId = `fm-docs-${m.caseId}`;
  return (
    <li className="rounded-xl border border-line bg-white">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold break-words text-navy-900">{memberName(m)}</span>
            <span className="badge bg-rose-100 text-rose-800">{t(`familyMembers.relation.${m.relation}`)}</span>
            <StatusBadge status={m.status} />
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {m.number}
            {m.profile?.birthDate && <> · {date(m.profile.birthDate)}</>}
            {m.profile && <> · {t(`familyMembers.joins.${m.profile.joinsWhen}`)}</>}
          </p>
          <MemberProgress m={m} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {!m.final && (
            <button type="button" className="btn-secondary btn-sm" onClick={onEdit}>
              <Pencil className="size-3.5" aria-hidden /> {t('familyMembers.edit')}
            </button>
          )}
          {m.removable && (
            <button type="button" className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-red-50 hover:text-red-700" onClick={onRemove} aria-label={`${t('familyMembers.remove')}: ${memberName(m)}`}>
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5">
        <button type="button" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800" aria-expanded={open} aria-controls={docsId} onClick={() => setOpen((v) => !v)}>
          <ChevronDown className={clsx('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
          {open ? t('familyMembers.hideDocs') : t('familyMembers.showDocs')}
        </button>
        <Link to={`/account/cases/${m.caseId}`} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-muted hover:text-navy-900">
          {t('familyMembers.openCase')} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      {open && (
        <div id={docsId} className="border-t border-line p-3 sm:p-4">
          <MemberDocuments caseId={m.caseId} onChanged={() => refresh()} />
        </div>
      )}
    </li>
  );
};

/**
 * Portal case page (main applicant's case): "Ailə üzvləri" — every member with status, progress and their own
 * checklist (uploads go to the member's case through the normal upload component), add / edit / remove.
 */
export const FamilyMembersSection = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const apiError = useApiError();
  const refresh = useFamilyRefresh();
  const { data, isLoading } = useFamilyOverview(caseId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FamilyMemberSummary | null>(null);
  const [removing, setRemoving] = useState<FamilyMemberSummary | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading || !data) return null;
  // Member cases show the group card instead; this section belongs to the main applicant's case.
  if (data.main.id !== caseId) return null;

  const create = async (f: MemberForm) => {
    try {
      await api.post(`/family/cases/${caseId}/members`, bodyFromForm(f));
      await refresh(data);
      toast.success(t('familyMembers.created'));
      setAdding(false);
    } catch (err) {
      apiError(err);
    }
  };
  const save = async (f: MemberForm) => {
    if (!editing) return;
    try {
      await api.patch(`/family/members/${editing.caseId}`, bodyFromForm(f));
      await refresh(data);
      toast.success(t('familyMembers.saved'));
      setEditing(null);
    } catch (err) {
      apiError(err);
    }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(`/family/members/${removing.caseId}`);
      await refresh(data);
      toast.success(t('familyMembers.removed'));
      setRemoving(null);
    } catch (err) {
      apiError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="family-members-title" id="family-members">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="family-members-title" className="flex items-center gap-2.5 text-base font-bold text-navy-900">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600">
              <Users className="size-4" aria-hidden />
            </span>
            {t('familyMembers.title')}
            {data.members.length > 0 && <span className="badge bg-brand-100 text-brand-700">{data.members.length}</span>}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('familyMembers.subtitle')}</p>
        </div>
        {data.canAdd && (
          <button type="button" className="btn-primary btn-sm shrink-0" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" aria-hidden /> {t('familyMembers.add')}
          </button>
        )}
      </div>

      {data.members.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line px-4 py-6 text-center">
          <p className="font-semibold text-navy-900">{t('familyMembers.empty')}</p>
          <p className="mt-1 text-sm text-muted">{t('familyMembers.emptyHint')}</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.members.map((m) => (
            <MemberCard key={m.caseId} m={m} onEdit={() => setEditing(m)} onRemove={() => setRemoving(m)} />
          ))}
        </ul>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title={t('familyMembers.addTitle')} description={t('familyMembers.addHint')} size="lg">
        {adding && <MemberFormFields idPrefix="fm-add" initial={emptyMemberForm()} onSubmit={create} onCancel={() => setAdding(false)} submitLabel={t('familyMembers.create')} />}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? memberName(editing) : ''} size="lg">
        {editing?.profile && (
          <MemberFormFields
            key={editing.caseId}
            idPrefix="fm-edit"
            initial={formFromProfile(editing.profile)}
            relationLocked={editing.status !== 'DOCUMENTS_PENDING'}
            onSubmit={save}
            onCancel={() => setEditing(null)}
            submitLabel={t('familyMembers.save')}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => void remove()}
        title={t('familyMembers.removeTitle')}
        message={t('familyMembers.removeBody')}
        confirmLabel={t('familyMembers.remove')}
        loading={busy}
      />
    </section>
  );
};

export default FamilyMembersSection;
