import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRightLeft, CheckSquare, ChevronDown, ChevronUp, History, NotebookPen, Palmtree, Pencil, Plus, Square, Trash2, UserCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesTeam } from '@/i18n/pagesTeam';
import { adminCopy } from '@/i18n/admin'; // status / event labels (also used inside the workspace)
import { fmtDate, fmtDateTime, statusLabel, eventLabel } from '@/components/admin/labels';
import { ErrorBlock, LoadingBlock } from '@/components/admin/ui';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { TONE_CLASS, TONE_TEXT } from '@/components/ui/status';
import type { CaseStatus } from '@/lib/types';
import { useMyHandovers, type ChecklistItem, type Handover, type HandoverChanges, type LeaveDraft } from './api';
import { toastTeamError } from './shared';

registerCopy(adminCopy);
registerCopy(pagesTeam);

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['handover-notes'] });
    void qc.invalidateQueries({ queryKey: ['my-work'] });
  };
};

/** Editable checklist (text items; ticks are kept by the server when texts stay the same). */
export const ChecklistEditor = ({ items, onChange, idPrefix }: { items: ChecklistItem[]; onChange: (v: ChecklistItem[]) => void; idPrefix: string }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            id={`${idPrefix}-${i}`}
            className="input h-9 flex-1"
            value={it.text}
            maxLength={300}
            placeholder={t('team.handover.itemPh')}
            aria-label={t('team.handover.item', { n: i + 1 })}
            onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))}
          />
          <button type="button" className="btn-secondary btn-sm px-2" aria-label={t('team.common.delete')} onClick={() => onChange(items.filter((_, k) => k !== i))}>
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      {items.length < 30 && (
        <button type="button" className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-brand-600 hover:underline" onClick={() => onChange([...items, { text: '', done: false }])}>
          <Plus className="size-3" /> {t('team.handover.addItem')}
        </button>
      )}
    </div>
  );
};

const clean = (items: ChecklistItem[]) => items.map((x) => ({ text: x.text.trim(), done: x.done })).filter((x) => x.text);

/** Checklist with ticks (substitute / owner / ADMIN may tick). */
export const Checklist = ({ h, canTick }: { h: Handover; canTick: boolean }) => {
  const inv = useInvalidate();
  const qc = useQueryClient();
  const tick = useMutation({
    mutationFn: async ({ index, done }: { index: number; done: boolean }) => api.patch(`/admin/handover-notes/${h.id}/checklist`, { index, done }),
    onSuccess: () => {
      inv();
      void qc.invalidateQueries({ queryKey: ['handover-case', h.caseId] });
    },
    onError: toastTeamError,
  });
  if (!h.checklist.length) return null;
  return (
    <ul className="space-y-1">
      {h.checklist.map((it, i) => (
        <li key={i}>
          <button
            type="button"
            disabled={!canTick || tick.isPending || h.status !== 'ACTIVE'}
            onClick={() => tick.mutate({ index: i, done: !it.done })}
            aria-pressed={it.done}
            className="flex min-h-9 w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-sm transition enabled:hover:bg-surface disabled:cursor-default"
          >
            {it.done ? <CheckSquare className={clsx('mt-0.5 size-4 shrink-0', TONE_TEXT.success)} aria-hidden /> : <Square className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />}
            <span className={clsx('flex-1', it.done ? 'text-muted line-through' : 'text-ink')}>{it.text}</span>
            {it.done && it.doneAt && <span className="shrink-0 text-[10px] text-muted">{fmtDateTime(it.doneAt)}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
};

/** What changed during the handover (status changes, documents, messages, latest events). */
export const ChangesSummary = ({ c }: { c: HandoverChanges }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 text-xs">
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-muted">
        <span>{t('team.handover.events', { count: c.events })}</span>
        <span>{t('team.handover.messages', { count: c.messages })}</span>
        <span>{t('team.handover.docs', { count: c.docsReviewed })}</span>
      </p>
      {c.statusChanges.length > 0 && (
        <ul className="space-y-0.5">
          {c.statusChanges.map((s, i) => (
            <li key={i} className="text-ink">
              {statusLabel(s.from as CaseStatus)} → <span className="font-semibold">{statusLabel(s.to as CaseStatus)}</span> <span className="text-muted">· {fmtDate(s.at)}</span>
            </li>
          ))}
        </ul>
      )}
      {c.recent.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold text-brand-600">{t('team.handover.recent', { count: c.recent.length })}</summary>
          <ul className="mt-1 space-y-1 border-l border-line pl-3">
            {c.recent.map((e) => (
              <li key={e.id}>
                <span className="font-medium text-ink">{eventLabel(e.type)}</span>
                {e.actor && <span className="text-muted"> · {e.actor}</span>}
                <span className="text-muted"> · {fmtDateTime(e.at)}</span>
                {e.note && <p className="line-clamp-2 text-muted">{e.note}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

const NoteDialog = ({ h, open, onClose }: { h: Handover; open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const inv = useInvalidate();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [items, setItems] = useState<ChecklistItem[]>([]);
  useEffect(() => {
    if (open) {
      setNote(h.note ?? '');
      setItems(h.checklist);
    }
  }, [open, h]);
  const save = useMutation({
    mutationFn: async () => api.patch(`/admin/handover-notes/${h.id}`, { note: note.trim() || null, checklist: clean(items) }),
    onSuccess: () => {
      toast.success(t('team.common.saved'));
      inv();
      void qc.invalidateQueries({ queryKey: ['handover-case', h.caseId] });
      onClose();
    },
    onError: toastTeamError,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('team.handover.editNote', { number: h.caseNumber ?? '' })}
      busy={save.isPending}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('team.common.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {t('team.common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="label">{t('team.handover.note')}</span>
          <textarea className="input min-h-28" maxLength={5000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div>
          <span className="label">{t('team.handover.checklist')}</span>
          <ChecklistEditor items={items} onChange={setItems} idPrefix={`hn-${h.id}`} />
        </div>
      </div>
    </Modal>
  );
};

/** One handover: case, people, note, checklist (ticks), optional changes. */
export const HandoverCard = ({ h, changes, showCase = true }: { h: Handover; changes?: HandoverChanges; showCase?: boolean }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const canTick = user?.id === h.substituteId || user?.id === h.originalStaffId || isAdmin;
  const canEdit = h.status === 'ACTIVE' && (user?.id === h.originalStaffId || isAdmin);
  const done = h.checklist.filter((x) => x.done).length;
  return (
    <article className="space-y-2 rounded-xl border border-line bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {showCase && (
            <Link to={`/admin/cases/${h.caseId}#case-handover`} className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink hover:text-brand-700">
              <span className="font-mono text-xs text-muted">{h.caseNumber}</span>
              {h.client}
            </Link>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">
            <ArrowRightLeft className="size-3" aria-hidden />
            {t('team.handover.fromTo', { from: h.originalName ?? '—', to: h.substituteName ?? '—' })}
            <span>· {h.endedAt ? t('team.handover.period', { from: fmtDate(h.startedAt), to: fmtDate(h.endedAt) }) : h.plannedEndAt ? t('team.handover.until', { date: fmtDate(h.plannedEndAt) }) : fmtDate(h.startedAt)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {h.checklist.length > 0 && (
            <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', done === h.checklist.length ? TONE_CLASS.success : TONE_CLASS.warning)}>
              {done}/{h.checklist.length}
            </span>
          )}
          {h.status !== 'ACTIVE' && <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', TONE_CLASS.neutral)}>{t(`team.handover.status.${h.status}`)}</span>}
          {canEdit && (
            <button type="button" className="btn-secondary btn-sm px-2" aria-label={t('team.common.edit')} onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>
      </header>
      {h.note ? <p className="rounded-lg bg-surface px-3 py-2 text-sm whitespace-pre-wrap text-ink">{h.note}</p> : !h.checklist.length && <p className="text-xs text-muted">{t('team.handover.noNote')}</p>}
      <Checklist h={h} canTick={canTick} />
      {changes && (
        <div className="border-t border-line pt-2">
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-ink">
            <History className="size-3.5" aria-hidden /> {t('team.handover.whatChanged')}
          </p>
          <ChangesSummary c={changes} />
        </div>
      )}
      {canEdit && <NoteDialog h={h} open={editing} onClose={() => setEditing(false)} />}
    </article>
  );
};

// ─── Draft editor for a leave ──────────────────────────────────────────

const DraftEditor = ({ leaveId, open, onClose }: { leaveId: string; open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const inv = useInvalidate();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['handover-notes', 'leave', leaveId],
    queryFn: async () => (await api.get<LeaveDraft>(`/admin/handover-notes/leave/${leaveId}`)).data,
    enabled: open,
  });
  const [general, setGeneral] = useState<{ note: string; checklist: ChecklistItem[] }>({ note: '', checklist: [] });
  const [cases, setCases] = useState<Record<string, { note: string; checklist: ChecklistItem[] }>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    if (!data) return;
    setGeneral({ note: data.general.note ?? '', checklist: data.general.checklist });
    setCases(Object.fromEntries(data.cases.map((c) => [c.id, { note: c.note ?? '', checklist: c.checklist }])));
  }, [data]);
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put<LeaveDraft & { applied: number }>(`/admin/handover-notes/leave/${leaveId}`, {
          general: { note: general.note.trim() || null, checklist: clean(general.checklist) },
          cases: Object.fromEntries(Object.entries(cases).map(([id, c]) => [id, { note: c.note.trim() || null, checklist: clean(c.checklist) }])),
        })
      ).data,
    onSuccess: (r) => {
      toast.success(r.applied ? t('team.handover.savedApplied', { count: r.applied }) : t('team.handover.saved'));
      inv();
      onClose();
    },
    onError: toastTeamError,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      mobile="full"
      align="top"
      title={t('team.handover.draftTitle')}
      description={data ? t('team.handover.draftPeriod', { from: fmtDate(data.leave.startsAt), to: fmtDate(data.leave.endsAt) }) : undefined}
      busy={save.isPending}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('team.common.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={save.isPending || !data} onClick={() => save.mutate()}>
            {save.isPending ? <Spinner className="size-3.5" /> : null} {t('team.common.save')}
          </button>
        </>
      }
    >
      {isLoading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-muted">{t('team.handover.draftHint')}</p>
          <section className="space-y-2 rounded-xl border border-line p-3">
            <h3 className="text-sm font-semibold text-ink">{t('team.handover.general')}</h3>
            <textarea className="input min-h-24" maxLength={5000} placeholder={t('team.handover.generalPh')} value={general.note} onChange={(e) => setGeneral({ ...general, note: e.target.value })} />
            <ChecklistEditor items={general.checklist} onChange={(v) => setGeneral({ ...general, checklist: v })} idPrefix="hn-general" />
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">{t('team.handover.perCase', { count: data.cases.length })}</h3>
            {data.cases.length === 0 ? (
              <p className="text-sm text-muted">{t('team.handover.noCases')}</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {data.cases.map((c) => {
                  const v = cases[c.id] ?? { note: '', checklist: [] };
                  const has = !!v.note.trim() || v.checklist.length > 0;
                  const isOpen = expanded === c.id;
                  return (
                    <li key={c.id}>
                      <button type="button" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : c.id)} className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface">
                        <span className="font-mono text-xs text-muted">{c.number}</span>
                        <span className="min-w-0 flex-1 truncate text-ink">{c.client}</span>
                        <span className="hidden text-xs text-muted sm:inline">{statusLabel(c.status as CaseStatus)}</span>
                        {has && <NotebookPen className={clsx('size-3.5', TONE_TEXT.info)} aria-label={t('team.handover.hasNote')} />}
                        {c.handover && <UserCheck className={clsx('size-3.5', TONE_TEXT.success)} aria-label={t('team.handover.running', { name: c.handover.substituteName ?? '' })} />}
                        {isOpen ? <ChevronUp className="size-4 text-muted" /> : <ChevronDown className="size-4 text-muted" />}
                      </button>
                      {isOpen && (
                        <div className="space-y-2 px-3 pb-3">
                          {c.handover && <p className="text-xs text-muted">{t('team.handover.running', { name: c.handover.substituteName ?? '' })}</p>}
                          <textarea className="input min-h-20" maxLength={5000} placeholder={t('team.handover.casePh')} value={v.note} onChange={(e) => setCases({ ...cases, [c.id]: { ...v, note: e.target.value } })} />
                          <ChecklistEditor items={v.checklist} onChange={(x) => setCases({ ...cases, [c.id]: { ...v, checklist: x } })} idPrefix={`hn-${c.id}`} />
                          {!has && <p className="text-[11px] text-muted">{t('team.handover.usesGeneral')}</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
};

// ─── Panel ─────────────────────────────────────────────────────────────

/** Workspace → Komanda → Ötürmə: my leave notes, cases I cover, my handed-over cases, what changed after the return. */
export const HandoverPanel = () => {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const leaveParam = sp.get('leave');
  const [editing, setEditing] = useState<string | null>(leaveParam);
  useEffect(() => {
    if (leaveParam) setEditing(leaveParam);
  }, [leaveParam]);
  const { data, isLoading, error, refetch } = useMyHandovers();
  const close = () => {
    setEditing(null);
    if (leaveParam)
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.delete('leave');
          return n;
        },
        { replace: true },
      );
  };
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  const nothing = !data.leaves.length && !data.covering.length && !data.mineActive.length && !data.returned.length;
  return (
    <div className="space-y-6">
      {nothing && <EmptyState icon={ArrowRightLeft} title={t('team.handover.empty')} text={t('team.handover.emptyHint')} />}
      {data.leaves.length > 0 && (
        <section aria-labelledby="ho-leaves">
          <h2 id="ho-leaves" className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
            {t('team.handover.myLeaves')}
          </h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-card">
            {data.leaves.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Palmtree className="size-4 text-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    {t(`team.shifts.leave.${l.type}`)} · {fmtDate(l.startsAt)} – {fmtDate(l.endsAt)}
                  </p>
                  <p className="text-xs text-muted">
                    {t(`team.handover.leaveStatus.${l.status}`)}
                    {l.hasDraft ? ` · ${t('team.handover.draftSaved', { count: l.notes })}` : ` · ${t('team.handover.noDraft')}`}
                  </p>
                </div>
                <button type="button" className={l.hasDraft ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'} onClick={() => setEditing(l.id)}>
                  <NotebookPen className="size-3.5" /> {l.hasDraft ? t('team.handover.editDraft') : t('team.handover.writeDraft')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.covering.length > 0 && (
        <section aria-labelledby="ho-covering">
          <h2 id="ho-covering" className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
            {t('team.handover.covering', { count: data.covering.length })}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.covering.map((h) => (
              <HandoverCard key={h.id} h={h} />
            ))}
          </div>
        </section>
      )}
      {data.mineActive.length > 0 && (
        <section aria-labelledby="ho-mine">
          <h2 id="ho-mine" className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
            {t('team.handover.mineActive', { count: data.mineActive.length })}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.mineActive.map((h) => (
              <HandoverCard key={h.id} h={h} />
            ))}
          </div>
        </section>
      )}
      {data.returned.length > 0 && (
        <section aria-labelledby="ho-returned">
          <h2 id="ho-returned" className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
            {t('team.handover.returned', { count: data.returned.length })}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.returned.map((h) => (
              <HandoverCard key={h.id} h={h} changes={h.changes} />
            ))}
          </div>
        </section>
      )}
      {editing && <DraftEditor leaveId={editing} open onClose={close} />}
    </div>
  );
};
