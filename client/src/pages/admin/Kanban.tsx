import { useCallback, useMemo, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CalendarClock, FileWarning, MessageSquareWarning, RefreshCw, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import type { CaseStatus } from '@/lib/types';
import { STATUS_BAR_TONE } from '@/lib/caseStatus';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesOps } from '@/i18n/pagesOps';
import { Chip, ErrorBlock, LoadingBlock, PageHead, Switch } from '@/components/admin/ui';
import { fmtDate, statusLabel, fullName } from '@/components/admin/labels';
import { fmtTime, toastOpsError } from '@/components/ops/shared';

registerCopy(pagesOps);

interface Card {
  id: string;
  number: string;
  status: CaseStatus;
  clientName: string;
  profession: string;
  visaLabel: string | null;
  visaCategoryId: string | null;
  assignedStaff: { id: string; firstName: string; lastName: string } | null;
  daysInStatus: number;
  pendingDocs: number;
  unansweredClientMessage: boolean;
  waitingFor: 'client' | 'staff' | null;
  appointmentAt: string | null;
  updatedAt: string;
}
interface Staff { id: string; firstName: string; lastName: string; role: string }
interface Board {
  columns: { status: CaseStatus; count: number; cards: Card[] }[];
  total: number;
  staff: Staff[];
  visas: { id: string; visaLabel: string; title: { az: string } }[];
  generatedAt: string;
}

const OVERDUE_DAYS = 3;
const CRITICAL_DAYS = 7;
const DRAG_TYPE = 'application/x-tv-case';

const initials = (s: { firstName: string; lastName: string }) => `${s.firstName[0] ?? ''}${s.lastName[0] ?? ''}`.toUpperCase();

export default function Kanban() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  usePageTitle(t('ops.kanban.title'));
  const [mine, setMine] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [visa, setVisa] = useState('');
  const [showFinal, setShowFinal] = useState(false);
  const [dragging, setDragging] = useState<Card | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (mine) params.set('mine', 'true');
  else if (staffId) params.set('staff', staffId);
  if (visa) params.set('visa', visa);
  if (showFinal) params.set('final', 'true');
  const qs = params.toString();
  const queryKey = ['ops-kanban', qs];
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: async () => (await api.get<Board>(`/admin/ops/kanban${qs ? `?${qs}` : ''}`)).data,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const assign = useMutation({
    mutationFn: ({ card, staff }: { card: Card; staff: Staff | null }) => api.post('/admin/ops/kanban/assign', { caseId: card.id, staffId: staff?.id ?? null }),
    onMutate: async ({ card, staff }) => {
      // Optimistic: move the avatar on the card right away.
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<Board>(queryKey);
      if (prev) {
        qc.setQueryData<Board>(queryKey, {
          ...prev,
          columns: prev.columns.map((c) => ({ ...c, cards: c.cards.map((x) => (x.id === card.id ? { ...x, assignedStaff: staff ? { id: staff.id, firstName: staff.firstName, lastName: staff.lastName } : null } : x)) })),
        });
      }
      return { prev };
    },
    onSuccess: (_r, { card, staff }) => {
      toast.success(staff ? t('ops.kanban.assigned', { number: card.number, name: fullName(staff) }) : t('ops.kanban.unassignedDone', { number: card.number }));
      void qc.invalidateQueries({ queryKey: ['ops-kanban'] });
      void qc.invalidateQueries({ queryKey: ['admin-cases'] });
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toastOpsError(err);
    },
  });

  const onDragStart = useCallback((e: DragEvent, card: Card) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DRAG_TYPE, card.id);
    e.dataTransfer.setData('text/plain', card.number);
    setDragging(card);
  }, []);
  const onDragEnd = () => {
    setDragging(null);
    setOver(null);
  };
  const allowDrop = (e: DragEvent, key: string) => {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (over !== key) setOver(key);
  };
  const dropOn = (e: DragEvent, staff: Staff | null) => {
    e.preventDefault();
    const card = dragging;
    setDragging(null);
    setOver(null);
    if (!card) return;
    if ((card.assignedStaff?.id ?? null) === (staff?.id ?? null)) return;
    assign.mutate({ card, staff });
  };

  const columns = useMemo(() => (data ? (showFinal ? data.columns : data.columns.filter((c) => !['APPROVED', 'REJECTED', 'CANCELLED'].includes(c.status))) : []), [data, showFinal]);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <PageHead
        title={t('ops.kanban.title')}
        subtitle={t('ops.kanban.subtitle')}
        actions={
          <>
            <span className="hidden text-xs text-muted sm:inline" title={t('ops.common.autoRefresh')}>
              {data ? t('ops.common.updated', { time: fmtTime(data.generatedAt) }) : null}
            </span>
            <button type="button" className="btn-secondary btn-sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={clsx('size-3.5', isFetching && 'animate-spin')} /> {t('ops.common.refresh')}
            </button>
          </>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip active={mine} onClick={() => { setMine(!mine); setStaffId(''); }}>
          {t('ops.kanban.mine')}
        </Chip>
        <label className="sr-only" htmlFor="kb-staff">{t('ops.kanban.anyStaff')}</label>
        <select id="kb-staff" className="input h-10 w-auto min-w-44 py-1 text-xs sm:h-8" value={mine ? '' : staffId} disabled={mine} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">{t('ops.kanban.anyStaff')}</option>
          {data?.staff.map((s) => (
            <option key={s.id} value={s.id}>{fullName(s)}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="kb-visa">{t('ops.kanban.anyVisa')}</label>
        <select id="kb-visa" className="input h-10 w-auto min-w-40 py-1 text-xs sm:h-8" value={visa} onChange={(e) => setVisa(e.target.value)}>
          <option value="">{t('ops.kanban.anyVisa')}</option>
          {data?.visas.map((v) => (
            <option key={v.id} value={v.id}>{v.visaLabel} · {(v.title as Record<string, string>)[i18n.language.slice(0, 2)] || v.title.az}</option>
          ))}
        </select>
        <span className="flex items-center gap-2 text-xs text-muted">
          <Switch checked={showFinal} onChange={setShowFinal} label={t('ops.kanban.showClosed')} /> {t('ops.kanban.showClosed')}
        </span>
        {data && <span className="ml-auto text-xs font-semibold text-muted tabular-nums">{t('ops.kanban.total', { count: data.total })}</span>}
      </div>

      {/* Staff drop row */}
      {data && (
        <div className="mb-4 rounded-xl border border-line bg-card px-3 py-2.5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 pr-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('ops.kanban.staffRow')}</span>
            {data.staff.map((s) => {
              const isOver = over === s.id;
              const open = data.columns.reduce((n, c) => n + c.cards.filter((x) => x.assignedStaff?.id === s.id).length, 0);
              return (
                <div
                  key={s.id}
                  onDragOver={(e) => allowDrop(e, s.id)}
                  onDragEnter={(e) => allowDrop(e, s.id)}
                  onDragLeave={() => over === s.id && setOver(null)}
                  onDrop={(e) => dropOn(e, s)}
                  className={clsx(
                    'flex shrink-0 items-center gap-2 rounded-full border px-1.5 py-1 pr-3 text-xs font-medium transition',
                    isOver ? 'border-primary bg-primary/[0.06] ring-2 ring-focus' : dragging ? 'border-dashed border-primary/25 bg-card' : 'border-line bg-surface/50',
                    s.id === user?.id && 'font-semibold',
                  )}
                  title={fullName(s)}
                >
                  <span className="grid size-7 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-contrast">{initials(s)}</span>
                  <span className="max-w-32 truncate">{s.firstName}</span>
                  <span className="rounded-full bg-card px-1.5 text-[10px] text-muted tabular-nums">{open}</span>
                </div>
              );
            })}
            <div
              onDragOver={(e) => allowDrop(e, 'none')}
              onDragEnter={(e) => allowDrop(e, 'none')}
              onDragLeave={() => over === 'none' && setOver(null)}
              onDrop={(e) => dropOn(e, null)}
              className={clsx(
                'ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-muted transition',
                over === 'none' ? 'border-danger bg-danger-bg text-danger-fg' : dragging ? 'border-dashed border-line' : 'border-transparent',
              )}
            >
              <UserX className="size-3.5" /> {t('ops.kanban.unassign')}
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : (
        <div className="-mx-4 flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          {columns.map((col) => (
            <section key={col.status} className="flex w-72 shrink-0 flex-col rounded-xl border border-line bg-surface/60" aria-label={statusLabel(col.status)}>
              <header className="flex items-center gap-2 px-3 pt-3 pb-2">
                <span className={clsx('size-2 rounded-full', STATUS_BAR_TONE[col.status])} aria-hidden />
                <h2 className="truncate text-xs font-bold text-ink">{statusLabel(col.status)}</h2>
                <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-muted tabular-nums">{col.count}</span>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {col.cards.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted">{t('ops.kanban.columnEmpty')}</p>}
                {col.cards.map((card) => (
                  <KanbanCard key={card.id} card={card} dragging={dragging?.id === card.id} onDragStart={onDragStart} onDragEnd={onDragEnd} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="font-semibold">{t('ops.kanban.legend.title')}:</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-warning" /> {t('ops.kanban.legend.client')}</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-primary" /> {t('ops.kanban.legend.staff')}</span>
        <span className="inline-flex items-center gap-1"><span className="rounded bg-warning-bg px-1 text-warning-fg">{t('ops.kanban.overdue')}</span> {t('ops.kanban.legend.overdue', { days: OVERDUE_DAYS })}</span>
        <span className="inline-flex items-center gap-1"><span className="rounded bg-danger-bg px-1 text-danger-fg">{t('ops.kanban.critical')}</span> {t('ops.kanban.legend.critical', { days: CRITICAL_DAYS })}</span>
      </div>
    </div>
  );
}

const KanbanCard = ({ card, dragging, onDragStart, onDragEnd }: { card: Card; dragging: boolean; onDragStart: (e: DragEvent, c: Card) => void; onDragEnd: () => void }) => {
  const { t } = useTranslation();
  const final = ['APPROVED', 'REJECTED', 'CANCELLED'].includes(card.status);
  const critical = !final && card.daysInStatus >= CRITICAL_DAYS;
  const overdue = !final && !critical && card.daysInStatus >= OVERDUE_DAYS;
  return (
    <article
      draggable
      onDragStart={(e) => onDragStart(e, card)}
      onDragEnd={onDragEnd}
      className={clsx(
        'group rounded-lg border bg-card p-2.5 text-xs shadow-[var(--tv-shadow-card)] transition',
        dragging ? 'opacity-40' : 'hover:border-line-strong',
        critical ? 'border-danger-border' : overdue ? 'border-warning-border' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link to={`/admin/cases/${card.id}`} className="min-w-0 font-semibold text-ink hover:text-link">
          <span className="block truncate">{card.clientName}</span>
          <span className="block truncate code-id text-[10px] font-normal text-muted">{card.number}</span>
        </Link>
        {card.assignedStaff ? (
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-contrast" title={fullName(card.assignedStaff)}>
            {initials(card.assignedStaff)}
          </span>
        ) : (
          <span className="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-line text-muted" title={t('ops.kanban.unassigned')}>
            <UserX className="size-3" />
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-[11px] text-muted">
        {card.profession}
        {card.visaLabel && <span className="ml-1 rounded bg-sunken px-1 code-id text-[10px] text-muted">{card.visaLabel}</span>}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {card.waitingFor && (
          <span className={clsx('rounded px-1.5 py-0.5 text-[10px] font-semibold', card.waitingFor === 'client' ? 'bg-warning-bg text-warning-fg' : 'bg-primary/[0.06] text-link')}>
            {card.waitingFor === 'client' ? t('ops.kanban.waitingClient') : t('ops.kanban.waitingStaff')}
          </span>
        )}
        <span className={clsx('rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', critical ? 'bg-danger-bg text-danger-fg' : overdue ? 'bg-warning-bg text-warning-fg' : 'bg-sunken text-muted')}>
          {t('ops.kanban.days', { count: card.daysInStatus })}
        </span>
        {card.pendingDocs > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded bg-accent-bg px-1.5 py-0.5 text-[10px] font-semibold text-accent-fg" title={t('ops.kanban.docsHint')}>
            <FileWarning className="size-3" /> {card.pendingDocs}
          </span>
        )}
        {card.unansweredClientMessage && (
          <span className="inline-flex items-center gap-0.5 rounded bg-danger-bg px-1.5 py-0.5 text-[10px] font-semibold text-danger-fg" title={t('ops.kanban.newMessage')}>
            <MessageSquareWarning className="size-3" />
          </span>
        )}
        {card.appointmentAt && (
          <span className="inline-flex items-center gap-0.5 rounded bg-info-bg px-1.5 py-0.5 text-[10px] font-semibold text-info-fg" title={t('ops.kanban.appointment')}>
            <CalendarClock className="size-3" /> {fmtDate(card.appointmentAt)}
          </span>
        )}
      </div>
    </article>
  );
};
