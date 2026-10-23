import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ArrowRight, ChevronDown, IdCard, Pencil, Plus, Trash2, UserRound, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { STATUS_STEP } from '@/lib/caseStatus';
import { registerCopy } from '@/i18n';
import { pagesFamilyLanguage } from '@/i18n/pagesFamilyLanguage';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/portal/StatusBadge';
import { useApiError } from '@/components/portal/useApiError';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DefRow, EmptyState, Panel } from '@/components/admin/ui';
import { RequirementsSection } from '@/components/admin/case/Requirements';
import { caseKey, type CaseDetailResponse } from '@/components/admin/case/shared';
import { SensitiveValue } from '@/components/privacyTools/SensitiveValue';
import { useFamilyOverview, useFamilyRefresh } from './api';
import { MemberFormFields } from './MemberFormFields';
import { MemberProgress, RELATION_ICON, STATE_TONE } from './FamilyMembersSection';
import { bodyFromForm, emptyMemberForm, formFromProfile, memberName, type FamilyMemberSummary, type FamilyProfile, type MemberForm } from './types';

registerCopy(pagesFamilyLanguage);

/** Member case loaded with the admin endpoint: the regular review UI (accept / reject / upload on behalf). */
const MemberReview = ({ caseId, onChanged }: { caseId: string; onChanged: () => void }) => {
  const { t } = useTranslation();
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: caseKey(caseId),
    queryFn: async () => (await api.get<CaseDetailResponse>(`/admin/cases/${caseId}`)).data,
  });
  // Every review there refetches the member case → refresh the family overview counts.
  useEffect(() => {
    if (dataUpdatedAt) onChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt]);
  if (isLoading || !data) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-muted">
        <Spinner className="size-4" /> {t('familyMembers.loading')}
      </p>
    );
  }
  const c = data.case;
  const showEmbassy = c.requirements.some((r) => r.stage === 'EMBASSY') || STATUS_STEP[c.status] >= 2;
  return (
    <div className="space-y-4">
      {showEmbassy && <RequirementsSection c={c} stage="EMBASSY" />}
      <RequirementsSection c={c} stage="INITIAL" />
    </div>
  );
};

/** Personal / passport data of a member (passport masked per the privacy settings, reveal with a reason). */
export const MemberDetails = ({ p }: { p: FamilyProfile }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const d = (v: string | null) => (v ? date(v) : '—');
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      <DefRow label={t('familyMembers.fields.birthDate')}>{d(p.birthDate)}</DefRow>
      <DefRow label={t('familyMembers.fields.birthPlace')}>
        <SensitiveValue value={p.birthPlace} entity="familyMember" id={p.id} field="birthPlace" />
      </DefRow>
      <DefRow label={t('familyMembers.fields.nationality')}>{p.nationality || '—'}</DefRow>
      <DefRow label={t('familyMembers.fields.sex')}>{p.sex ? t(`familyMembers.sex.${p.sex}`) : '—'}</DefRow>
      <DefRow label={t('familyMembers.fields.passportNumber')}>
        <SensitiveValue value={p.passportNumber} entity="familyMember" id={p.id} field="passportNumber" />
      </DefRow>
      <DefRow label={t('familyMembers.fields.passportExpiresAt')}>{d(p.passportExpiresAt)}</DefRow>
      <DefRow label={t('familyMembers.fields.joinsWhen')}>
        {t(`familyMembers.joins.${p.joinsWhen}`)}
        {p.joinsWhen === 'LATER' && p.plannedEntryAt ? ` · ${date(p.plannedEntryAt)}` : ''}
      </DefRow>
      {p.email && <DefRow label={t('familyMembers.fields.email')}>{p.email}</DefRow>}
      {p.relation === 'spouse' && p.germanExempt && (
        <DefRow label={t('familyMembers.fields.germanExempt')}>{p.germanExemptNote || '✓'}</DefRow>
      )}
      {p.notes && (
        <div className="sm:col-span-2">
          <DefRow label={t('familyMembers.fields.notes')}>
            <span className="whitespace-pre-line">{p.notes}</span>
          </DefRow>
        </div>
      )}
    </dl>
  );
};

const MemberRow = ({ m, onEdit, onRemove, onChanged }: { m: FamilyMemberSummary; onEdit: () => void; onRemove: () => void; onChanged: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const [open, setOpen] = useState(false);
  const Icon = RELATION_ICON[m.relation] ?? UserRound;
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-navy-900">{memberName(m)}</span>
            <span className="badge bg-rose-100 text-rose-800">{t(`familyMembers.relation.${m.relation}`)}</span>
            <StatusBadge status={m.status} />
          </p>
          <p className="mt-0.5 text-xs text-muted">
            <Link to={`/admin/cases/${m.caseId}`} className="font-mono font-semibold text-brand-600 hover:underline">
              {m.number}
            </Link>
          </p>
          <MemberProgress m={m} />
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t('familyMembers.showDocs')}>
            {m.checklist.map((i) => (
              <li key={i.id} className={clsx('badge max-w-full truncate', STATE_TONE[i.state])} title={`${tr(i.title)} · ${t(`familyMembers.state.${i.state}`)}`}>
                {tr(i.title)}
                {!i.required && <span className="opacity-70"> ({t('familyMembers.optional')})</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-brand-50 hover:text-brand-700" onClick={onEdit} title={t('familyMembers.edit')} aria-label={`${t('familyMembers.edit')}: ${memberName(m)}`}>
            <Pencil className="size-3.5" />
          </button>
          {m.removable && (
            <button type="button" className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-red-50 hover:text-red-700" onClick={onRemove} title={t('familyMembers.remove')} aria-label={`${t('familyMembers.remove')}: ${memberName(m)}`}>
              <Trash2 className="size-3.5" />
            </button>
          )}
          <Link to={`/admin/cases/${m.caseId}`} className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-brand-50 hover:text-brand-700" title={t('familyMembers.openCase')} aria-label={`${t('familyMembers.openCase')}: ${m.number}`}>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
      {m.profile && (
        <div className="mt-3 rounded-lg bg-surface px-3 py-2.5 sm:ml-12">
          <MemberDetails p={m.profile} />
        </div>
      )}
      <button type="button" className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 sm:ml-12" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ChevronDown className={clsx('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        {open ? t('familyMembers.hideDocs') : t('familyMembers.showDocs')}
      </button>
      {open && (
        <div className="mt-3 sm:ml-12">
          <MemberReview caseId={m.caseId} onChanged={onChanged} />
        </div>
      )}
    </li>
  );
};

/**
 * Admin case page: on a main case the family panel (members, details, per-member checklist + review,
 * add / edit / remove); on a member case the member's details with an edit button.
 */
export const FamilyAdminPanel = ({ caseId, parentCaseId }: { caseId: string; parentCaseId?: string | null }) => {
  const { t } = useTranslation();
  const apiError = useApiError();
  const refresh = useFamilyRefresh();
  const { data, isLoading, refetch } = useFamilyOverview(caseId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FamilyMemberSummary | null>(null);
  const [removing, setRemoving] = useState<FamilyMemberSummary | null>(null);
  const [busy, setBusy] = useState(false);

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

  const modals = (
    <>
      <Modal open={adding} onClose={() => setAdding(false)} title={t('familyMembers.addTitle')} description={t('familyMembers.addHint')} size="lg">
        {adding && <MemberFormFields idPrefix="fa-add" initial={emptyMemberForm()} onSubmit={create} onCancel={() => setAdding(false)} submitLabel={t('familyMembers.create')} />}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? memberName(editing) : ''} size="lg">
        {editing?.profile && (
          <MemberFormFields key={editing.caseId} idPrefix="fa-edit" initial={formFromProfile(editing.profile)} onSubmit={save} onCancel={() => setEditing(null)} submitLabel={t('familyMembers.save')} />
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
    </>
  );

  if (isLoading || !data) return null;

  // Member case: who this application is for.
  if (parentCaseId) {
    const me = data.members.find((m) => m.caseId === caseId);
    if (!me?.profile) return null;
    return (
      <Panel
        title={`${t('familyMembers.member')}: ${memberName(me)}`}
        icon={IdCard}
        actions={
          <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(me)}>
            <Pencil className="size-3.5" aria-hidden /> {t('familyMembers.edit')}
          </button>
        }
      >
        <p className="mb-3 text-xs text-muted">
          {t(`familyMembers.relation.${me.relation}`)} ·{' '}
          <Link to={`/admin/cases/${data.main.id}`} className="font-semibold text-brand-600 hover:underline">
            {t('familyMembers.main')}: {data.main.name} ({data.main.number})
          </Link>
        </p>
        <MemberDetails p={me.profile} />
        {modals}
      </Panel>
    );
  }

  return (
    <Panel
      title={
        <>
          {t('familyMembers.title')}
          {data.members.length > 0 && <span className="badge bg-brand-100 text-brand-700">{data.members.length}</span>}
        </>
      }
      icon={Users}
      id="case-family"
      actions={
        data.canAdd && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" aria-hidden /> {t('familyMembers.add')}
          </button>
        )
      }
    >
      {data.members.length === 0 ? (
        <EmptyState icon={Users} title={t('familyMembers.empty')}>
          {t('familyMembers.emptyHint')}
        </EmptyState>
      ) : (
        <>
          <p className="mb-4 text-xs text-muted">{t('familyMembers.staffHint')}</p>
          <ul className="divide-y divide-line">
            {data.members.map((m) => (
              <MemberRow key={m.caseId} m={m} onEdit={() => setEditing(m)} onRemove={() => setRemoving(m)} onChanged={() => void refetch()} />
            ))}
          </ul>
          <p className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
            <span>{data.aggregate.openItems ? t('familyMembers.openItems', { count: data.aggregate.openItems }) : t('familyMembers.allDone')}</span>
            <span className="font-semibold tabular-nums text-navy-900">{data.aggregate.percent}%</span>
          </p>
        </>
      )}
      {modals}
    </Panel>
  );
};

export default FamilyAdminPanel;
