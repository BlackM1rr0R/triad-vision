import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Move } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesStaffDesk } from '@/i18n/pagesStaffDesk';
import { toastError } from '@/components/admin/labels';
import { confirmDialog } from '@/components/ui/ConfirmHost';
import { MiniMonth } from '@/components/calendar/MiniMonth';
import type { CalItem, Person, SystemDto, Tone } from '@/components/calendar/types';
import { TONES, fmtDateTimeShort, fullName } from '@/components/calendar/utils';
import { OPS_TYPES, refreshOps, useOpsCalendar, type OpsItem, type OpsType } from './api';

registerCopy(pagesStaffDesk);

/**
 * Embassy layer of the workspace calendar (?mode=ops): embassy appointments, employer interviews, client arrivals
 * and consultations of the whole team, coloured by type, filtered by staff member and type. Embassy appointments
 * and interviews can be dragged to a new time; the move goes through the existing flows after a confirmation
 * (case action SCHEDULE_APPOINTMENT → client notified + case event; interview PATCH → audited, parties notified).
 */

export const OPS_TONE: Record<OpsType, Tone> = { embassy: TONES.red, interview: TONES.violet, arrival: TONES.pink, consultation: TONES.teal };
const SOURCE: Record<OpsType, SystemDto['source']> = { embassy: 'case', interview: 'interview', arrival: 'case', consultation: 'booking' };

export const useOpsLayer = ({ enabled, from, to, staffId, types }: { enabled: boolean; from: Date; to: Date; staffId: string; types: OpsType[] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useOpsCalendar(from, to, staffId, types, enabled);
  const byKey = useMemo(() => new Map((q.data?.items ?? []).map((i) => [i.key, i])), [q.data]);

  const items = useMemo<CalItem[]>(
    () =>
      (q.data?.items ?? []).map((o) => {
        const raw: SystemDto = {
          id: o.id,
          source: SOURCE[o.type],
          title: `${t(`sd.ops.types.${o.type}`)}: ${o.title}`,
          description: [o.staff ? t('sd.ops.staffLine', { name: o.staff.name }) : t('sd.ops.noStaff'), t(`sd.ops.status.${o.status}`, { defaultValue: o.status }), o.movable ? t('sd.ops.dragHint') : null].filter(Boolean).join('\n'),
          location: o.location,
          meetingUrl: o.location && /^https?:\/\//.test(o.location) ? o.location : null,
          startsAt: o.startsAt,
          endsAt: o.endsAt,
          allDay: false,
          cancelled: false,
          link: o.link,
          ownerId: o.staff?.id ?? '',
          busy: false,
          canEdit: false,
          color: null,
        };
        return { key: o.key, id: o.id, source: raw.source, title: raw.title, start: new Date(o.startsAt), end: new Date(o.endsAt), allDay: false, busy: false, ownerId: o.staff?.id ?? null, calendar: raw.source, tone: OPS_TONE[o.type], raw };
      }),
    [q.data, t],
  );

  const canDrag = useCallback((i: CalItem) => !!byKey.get(i.key)?.movable, [byKey]);

  const move = useCallback(
    async (item: CalItem, start: Date, end: Date) => {
      const o: OpsItem | undefined = byKey.get(item.key);
      if (!o?.movable) return;
      if (o.type === 'embassy' && start.getTime() === item.start.getTime()) return; // resize: no end time stored
      if (start.getTime() < Date.now()) {
        toast.error(t('sd.ops.past'));
        return;
      }
      const ok = await confirmDialog({
        title: t('sd.ops.confirmTitle'),
        message: t(`sd.ops.confirm.${o.type}`, { title: o.title, from: fmtDateTimeShort(item.start), to: fmtDateTimeShort(start) }),
        confirmLabel: t('sd.ops.confirmLabel'),
        tone: 'primary',
      });
      if (!ok) return;
      try {
        if (o.type === 'embassy') await api.post(`/admin/cases/${encodeURIComponent(o.id)}/actions`, { action: 'SCHEDULE_APPOINTMENT', at: start.toISOString(), place: o.place });
        else await api.patch(`/interviews/${encodeURIComponent(o.id)}`, { startsAt: start.toISOString(), endsAt: end.toISOString() });
        toast.success(t(`sd.ops.moved.${o.type}`));
        void qc.invalidateQueries({ queryKey: ['admin-case'] });
      } catch (err) {
        toastError(err);
      } finally {
        refreshOps(qc);
      }
    },
    [byKey, qc, t],
  );

  /** Month view drop: same time of day on the new date. */
  const dropDay = useCallback(
    (item: CalItem, day: Date) => {
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), item.start.getHours(), item.start.getMinutes());
      void move(item, start, new Date(start.getTime() + (item.end.getTime() - item.start.getTime())));
    },
    [move],
  );

  return { items, counts: q.data?.counts, loading: q.isLoading, canDrag, move, dropDay };
};

export const OpsSidebar = ({
  month,
  selected,
  marks,
  onSelectDay,
  onMonthChange,
  types,
  onToggleType,
  counts,
  staffId,
  onStaff,
  people,
}: {
  month: Date;
  selected: Date;
  marks?: Set<string>;
  onSelectDay: (d: Date) => void;
  onMonthChange: (d: Date) => void;
  types: OpsType[];
  onToggleType: (t: OpsType) => void;
  counts?: Record<OpsType, number>;
  staffId: string;
  onStaff: (id: string) => void;
  people: Person[];
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <MiniMonth month={month} selected={selected} marks={marks} onSelect={onSelectDay} onMonthChange={onMonthChange} />
      <div>
        <h3 className="mb-1 px-1.5 text-[0.68rem] font-bold tracking-[0.12em] text-muted uppercase">{t('sd.ops.typesTitle')}</h3>
        {OPS_TYPES.map((k) => {
          const on = types.includes(k);
          return (
            <label key={k} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-ink hover:bg-sunken">
              <input type="checkbox" checked={on} onChange={() => onToggleType(k)} className="sr-only" />
              <span className={clsx('grid size-4 shrink-0 place-items-center rounded border-2 transition-colors', on ? `${OPS_TONE[k].dot} border-transparent` : 'border-line bg-card')} aria-hidden>
                {on && <span className="size-1.5 rounded-sm bg-card" />}
              </span>
              <span className="truncate">{t(`sd.ops.typesPlural.${k}`)}</span>
              {counts && <span className="ml-auto text-xs text-muted tabular-nums">{counts[k] ?? 0}</span>}
            </label>
          );
        })}
      </div>
      <label className="block px-1.5">
        <span className="mb-1 block text-[0.68rem] font-bold tracking-[0.12em] text-muted uppercase">{t('sd.ops.staff')}</span>
        <select className="input min-h-9 py-1 text-sm" value={staffId} onChange={(e) => onStaff(e.target.value)}>
          <option value="">{t('sd.ops.allStaff')}</option>
          <option value="me">{t('sd.ops.me')}</option>
          <option value="none">{t('sd.ops.unassigned')}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {fullName(p)}
            </option>
          ))}
        </select>
      </label>
      <p className="flex items-start gap-1.5 rounded-lg bg-sunken/70 px-2.5 py-2 text-[11px] text-muted">
        <Move className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('sd.ops.help')}
      </p>
    </div>
  );
};
