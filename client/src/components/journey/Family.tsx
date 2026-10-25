import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ArrowRight, Baby, Crown, Heart, Plus, Trash2, UserRound, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesJourney } from '@/i18n/pagesJourney';
import { pagesFamilyLanguage } from '@/i18n/pagesFamilyLanguage';
import { PanelBodySkeleton } from '@/components/admin/case/TabSkeleton';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/portal/StatusBadge';
import { CaseStepper } from '@/components/portal/CaseStepper';
import { useApiError } from '@/components/portal/useApiError';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { EmptyState, Panel } from '@/components/admin/ui';
import { toastError } from '@/components/admin/labels';
import { familyKey, useFamilyGroup } from './api';
import { RELATIONS, type FamilyCase, type FamilyGroup, type Relation } from './types';

registerCopy(pagesJourney);
registerCopy(pagesFamilyLanguage); // relation 'other'

const RELATION_ICON: Record<Relation, typeof Heart> = { spouse: Heart, child: Baby, parent: Crown, other: UserRound };

const memberName = (c: FamilyCase) => (c.member ? `${c.member.firstName} ${c.member.lastName}`.trim() : c.profession);

const RelationTag = ({ relation }: { relation: Relation }) => {
  const { t } = useTranslation();
  const Icon = RELATION_ICON[relation];
  return (
    <span className="badge whitespace-nowrap bg-danger-bg text-danger-fg">
      <Icon className="size-3" aria-hidden />
      {t(`journey.family.relation.${relation}`)}
    </span>
  );
};

/** Relation label of a case row (dashboard lists): "Həyat yoldaşı" or null for main cases. */
export const useRelationLabel = () => {
  const { t } = useTranslation();
  return (relation: string | null | undefined) => (relation && RELATIONS.includes(relation as Relation) ? t(`journey.family.relation.${relation}`) : null);
};

// ─── Portal: family group card on the case page ─────────────────────────

const PortalRow = ({ c, current, label }: { c: FamilyCase; current: boolean; label: string }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const inner = (
    <>
      <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', current ? 'bg-primary text-primary-contrast' : 'bg-sunken text-link')}>
        {c.relation ? (() => {
          const Icon = RELATION_ICON[c.relation];
          return <Icon className="size-5" aria-hidden />;
        })() : <UserRound className="size-5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-ink">{c.relation ? memberName(c) : label}</span>
          {c.relation ? <RelationTag relation={c.relation} /> : <span className="badge bg-navy-900 text-white">{label}</span>}
          {current && <span className="text-xs text-muted">({t('journey.family.thisCase')})</span>}
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          {c.number}
          {c.member?.birthDate && <> · {t('journey.family.born', { date: date(c.member.birthDate) })}</>}
        </span>
        <CaseStepper status={c.status} variant="mini" className="mt-2 max-w-xs" />
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <StatusBadge status={c.status} />
        {!current && <ArrowRight className="size-4 text-primary" aria-hidden />}
      </span>
    </>
  );
  const cls = 'flex items-start gap-3 rounded-xl border border-line p-3.5 transition';
  return current ? (
    <li className={clsx(cls, 'bg-sunken ring-1 ring-focus/40')}>{inner}</li>
  ) : (
    <li>
      <Link to={`/account/cases/${c.id}`} className={clsx(cls, 'bg-card hover:border-primary hover:shadow-sm')} aria-label={`${t('journey.family.open')}: ${c.number}`}>
        {inner}
      </Link>
    </li>
  );
};

/** Main applicant + members with status badges; renders nothing when the case has no family group. */
export const FamilyGroupCard = ({ caseId, parentCaseId }: { caseId: string; parentCaseId?: string | null }) => {
  const { t } = useTranslation();
  const { data } = useFamilyGroup(caseId);
  if (!data || (!data.members.length && !parentCaseId)) return null;
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="family-title">
      <h2 id="family-title" className="flex items-center gap-2.5 text-base font-bold text-ink">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-danger-bg text-danger-fg">
          <Users className="size-4" aria-hidden />
        </span>
        {t('journey.family.title')}
        <span className="badge bg-sunken text-link">{data.members.length + 1}</span>
      </h2>
      <p className="mt-1 text-sm text-muted">{t('journey.family.subtitle')}</p>
      <ul className="mt-4 space-y-2.5">
        <PortalRow c={data.main} current={data.main.id === caseId} label={t('journey.family.main')} />
        {data.members.map((m) => (
          <PortalRow key={m.id} c={m} current={m.id === caseId} label={t('journey.family.member')} />
        ))}
      </ul>
      {data.members.length > 0 && (
        <p className="mt-4 flex items-center justify-between gap-3 text-xs text-muted">
          <span>{t('journey.family.aggregate')}</span>
          <span className="font-semibold text-ink">{t('journey.family.approved', { approved: data.aggregate.approved, total: data.aggregate.total })}</span>
        </p>
      )}
    </section>
  );
};

// ─── Admin: family panel on the case page ───────────────────────────────

const AddMemberModal = ({ caseId, open, onClose }: { caseId: string; open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ firstName: '', lastName: '', relation: 'spouse' as Relation, birthDate: '', email: '', profession: '' });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/journey/cases/${caseId}/family`, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        relation: form.relation,
        birthDate: form.birthDate || null,
        email: form.email.trim() || null,
        profession: form.profession.trim() || null,
      });
      await Promise.all([qc.invalidateQueries({ queryKey: familyKey(caseId) }), qc.invalidateQueries({ queryKey: ['admin-cases'] })]);
      toast.success(t('journey.family.created'));
      setForm({ firstName: '', lastName: '', relation: 'spouse', birthDate: '', email: '', profession: '' });
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('journey.family.addTitle')} description={t('journey.family.addHint')}>
      <form onSubmit={(e) => void submit(e)} className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="fm-first" className="label">{t('journey.family.firstName')}</label>
          <input id="fm-first" className="input" value={form.firstName} onChange={set('firstName')} required maxLength={80} data-autofocus />
        </div>
        <div>
          <label htmlFor="fm-last" className="label">{t('journey.family.lastName')}</label>
          <input id="fm-last" className="input" value={form.lastName} onChange={set('lastName')} required maxLength={80} />
        </div>
        <div>
          <label htmlFor="fm-rel" className="label">{t('journey.family.member')}</label>
          <select id="fm-rel" className="input" value={form.relation} onChange={set('relation')}>
            {RELATIONS.map((r) => (
              <option key={r} value={r}>
                {t(`journey.family.relation.${r}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fm-birth" className="label">{t('journey.family.birthDate')}</label>
          <input id="fm-birth" type="date" className="input" value={form.birthDate} onChange={set('birthDate')} />
        </div>
        <div>
          <label htmlFor="fm-email" className="label">{t('journey.family.email')}</label>
          <input id="fm-email" type="email" className="input" value={form.email} onChange={set('email')} maxLength={190} />
        </div>
        <div>
          <label htmlFor="fm-prof" className="label">{t('journey.family.profession')}</label>
          <input id="fm-prof" className="input" value={form.profession} onChange={set('profession')} maxLength={120} placeholder={t('journey.family.professionHint')} />
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('journey.admin.common.cancel')}
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>
            {saving && <Spinner className="size-3.5" />} {t('journey.family.create')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

/** Admin "Ailə" panel: members table, add-member modal, links to member cases, aggregate progress. */
export const FamilyPanel = ({ caseId, parentCaseId }: { caseId: string; parentCaseId?: string | null }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const qc = useQueryClient();
  const apiError = useApiError();
  const { data, isLoading } = useFamilyGroup(caseId);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<FamilyCase | null>(null);
  const [busy, setBusy] = useState(false);
  const isMember = !!parentCaseId;

  const remove = async () => {
    if (!removing || !data) return;
    setBusy(true);
    try {
      await api.delete(`/journey/cases/${data.main.id}/family/${removing.id}`);
      await Promise.all([qc.invalidateQueries({ queryKey: familyKey(caseId) }), qc.invalidateQueries({ queryKey: ['admin-cases'] })]);
      toast.success(t('journey.family.removed'));
      setRemoving(null);
    } catch (err) {
      apiError(err);
    } finally {
      setBusy(false);
    }
  };

  const group: FamilyGroup | undefined = data;
  const canRemove = (m: FamilyCase) => m.status === 'DOCUMENTS_PENDING' && m.documents === 0;

  return (
    <Panel
      title={t('journey.family.title')}
      icon={Users}
      actions={
        !isMember && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" /> {t('journey.family.add')}
          </button>
        )
      }
      bodyClassName="p-0"
    >
      {isLoading || !group ? (
        <PanelBodySkeleton rows={2} padded />
      ) : isMember ? (
        <div className="p-5 text-sm">
          <p className="text-muted">{t('journey.family.memberOf', { number: group.main.number })}</p>
          <Link to={`/admin/cases/${group.main.id}`} className="mt-2 inline-flex items-center gap-1 font-semibold text-link hover:text-link">
            {group.main.number} · {group.main.profession} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
          {group.members.length > 1 && (
            <ul className="mt-4 divide-y divide-line border-t border-line">
              {group.members
                .filter((m) => m.id !== caseId)
                .map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link to={`/admin/cases/${m.id}`} className="min-w-0 truncate font-medium text-ink hover:text-link">
                      {memberName(m)} <span className="text-xs text-muted">· {m.number}</span>
                    </Link>
                    {m.relation && <RelationTag relation={m.relation} />}
                  </li>
                ))}
            </ul>
          )}
        </div>
      ) : group.members.length === 0 ? (
        <EmptyState icon={Users} title={t('journey.family.empty')}>
          {t('journey.family.emptyHint')}
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-sunken text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-5 py-2.5">{t('journey.family.member')}</th>
                  <th className="px-3 py-2.5">{t('portal.caseNo')}</th>
                  <th className="px-3 py-2.5">{t('portal.currentStep')}</th>
                  <th className="px-3 py-2.5 text-right">%</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {group.members.map((m) => (
                  <tr key={m.id} className="align-top">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-ink">{memberName(m)}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        {m.relation && <RelationTag relation={m.relation} />}
                        {m.member?.birthDate && <span>{t('journey.family.born', { date: date(m.member.birthDate) })}</span>}
                        {m.member?.email && <span className="truncate">{m.member.email}</span>}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <Link to={`/admin/cases/${m.id}`} className="font-mono text-xs font-semibold text-link hover:underline">
                        {m.number}
                      </Link>
                      <p className="mt-1 text-[11px] text-muted">{t('journey.family.docs', { count: m.documents })}</p>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink">{m.percent}%</td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link to={`/admin/cases/${m.id}`} className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-sunken hover:text-link" title={t('journey.family.open')} aria-label={`${t('journey.family.open')} ${m.number}`}>
                          <ArrowRight className="size-3.5" />
                        </Link>
                        {canRemove(m) && (
                          <button type="button" className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-danger-bg hover:text-danger-fg" title={t('journey.family.remove')} aria-label={`${t('journey.family.remove')} ${m.number}`} onClick={() => setRemoving(m)}>
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-muted">
            <span>{t('journey.family.aggregate')}</span>
            <span className="flex items-center gap-3">
              <span className="font-semibold text-ink">{t('journey.family.approved', { approved: group.aggregate.approved, total: group.aggregate.total })}</span>
              <span className="relative h-1.5 w-28 overflow-hidden rounded-full bg-line" role="img" aria-label={`${group.aggregate.percent}%`}>
                <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${group.aggregate.percent}%` }} />
              </span>
              <span className="font-semibold tabular-nums text-ink">{group.aggregate.percent}%</span>
            </span>
          </div>
        </>
      )}

      <AddMemberModal caseId={caseId} open={adding} onClose={() => setAdding(false)} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => void remove()}
        title={t('journey.family.removeTitle')}
        message={t('journey.family.removeBody')}
        confirmLabel={t('journey.family.remove')}
        loading={busy}
      />
    </Panel>
  );
};
