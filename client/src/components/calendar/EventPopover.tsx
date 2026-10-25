import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AlignLeft, Briefcase, Check, Clock, Download, ExternalLink, HelpCircle, MapPin, Pencil, Repeat, Trash2, Users, Video, X } from 'lucide-react';
import { Avatar } from '@/components/chat/bits';
import { STATUS_TONES, toneTexts } from '@/components/ui/status';
import { calendarApi } from './api';
import type { AttendeeStatus, CalItem, EventDto, SystemDto } from './types';
import { fmtRange, fullName, parseRecurrence, recurrenceLabel, systemLink, systemLinkLabel } from './utils';

const STATUS_TONE: Record<AttendeeStatus, string> = { ...toneTexts(STATUS_TONES.attendee), NEEDS_ACTION: 'text-muted' };

/** Details card anchored next to the clicked chip (fixed position, flips to stay on screen). */
export const EventPopover = ({
  item,
  anchor,
  meId,
  onClose,
  onEdit,
  onDelete,
  onRespond,
}: {
  item: CalItem | null;
  anchor: DOMRect | null;
  meId: string;
  onClose: () => void;
  onEdit: (e: EventDto) => void;
  onDelete: (e: EventDto) => void;
  onRespond: (e: EventDto, status: AttendeeStatus) => void;
}) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = !!item && !!anchor;

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => {
      const el = ref.current;
      const w = el?.offsetWidth ?? 340;
      const h = el?.offsetHeight ?? 300;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = anchor.right + 8;
      if (left + w > vw - 8) left = anchor.left - w - 8;
      if (left < 8) left = Math.max(8, Math.min(anchor.left, vw - w - 8));
      let top = anchor.top;
      if (top + h > vh - 8) top = Math.max(8, vh - h - 8);
      setPos({ top, left });
    };
    place();
    const raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open, anchor, item?.key]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !item) return null;
  const raw = item.raw;
  const ev = item.source === 'event' && !item.busy ? (raw as EventDto) : null;
  const sys = item.source !== 'event' ? (raw as SystemDto) : null;
  const meeting = ev?.meetingUrl ?? sys?.meetingUrl ?? null;
  const location = ev?.location ?? sys?.location ?? null;
  const description = ev?.description ?? sys?.description ?? null;
  const link = sys ? systemLink(sys) : null;
  const myStatus = ev?.myStatus ?? null;
  const Row = ({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) => (
    <div className="flex items-start gap-2.5 text-sm text-ink">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={item.title}
      className={clsx('fixed z-[80] w-[22rem] max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-card p-4 text-ink shadow-[var(--tv-shadow-card)]', !pos && 'invisible')}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0 }}
    >
      <div className="mb-2 flex items-start gap-2">
        <span className={clsx('mt-1.5 size-3 shrink-0 rounded-sm', item.tone.dot)} aria-hidden />
        <h3 className="min-w-0 flex-1 font-display text-base leading-snug font-bold">{item.title}</h3>
        <div className="-mt-1 -mr-1 flex shrink-0 items-center">
          {ev?.canEdit && (
            <button type="button" onClick={() => onEdit(ev)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={t('calendar.actions.edit')} title={t('calendar.actions.edit')}>
              <Pencil className="size-4" />
            </button>
          )}
          {ev?.canEdit && (
            <button type="button" onClick={() => onDelete(ev)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger-fg" aria-label={t('calendar.actions.delete')} title={t('calendar.actions.delete')}>
              <Trash2 className="size-4" />
            </button>
          )}
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={t('calendar.actions.close')}>
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <Row icon={Clock}>
          {fmtRange(item.start, item.end, item.allDay)}
          {ev?.rrule && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
              <Repeat className="size-3" /> {recurrenceLabel(parseRecurrence(ev.rrule))}
            </span>
          )}
        </Row>
        <p className="pl-6.5 text-xs text-muted">
          {t(`calendar.sources.${item.source}`)}
          {item.busy && ` · ${t('calendar.labels.privateEvent')}`}
          {sys && ` · ${t('calendar.labels.system')}`}
        </p>
        {location && <Row icon={MapPin}>{location}</Row>}
        {meeting && (
          <Row icon={Video}>
            <a href={meeting} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm inline-flex items-center gap-1.5">
              <Video className="size-3.5" /> {t('calendar.actions.join')}
            </a>
          </Row>
        )}
        {description && (
          <Row icon={AlignLeft}>
            <p className="line-clamp-6 text-sm whitespace-pre-line text-ink/85">{description}</p>
          </Row>
        )}
        {ev?.case && (
          <Row icon={Briefcase}>
            <Link to={`/admin/cases/${ev.case.id}`} className="font-semibold text-link hover:underline">
              {ev.case.number}
            </Link>
          </Row>
        )}
        {ev && (
          <Row icon={Users}>
            <div className="flex items-center gap-2 text-xs">
              <Avatar person={ev.owner} size="xs" />
              <span className="font-semibold">{fullName(ev.owner)}</span>
              <span className="text-muted">· {ev.ownerId === meId ? t('calendar.labels.youOrganizer') : t('calendar.labels.organizer')}</span>
            </div>
            {ev.attendees.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {ev.attendees.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-xs">
                    <Avatar person={a} size="xs" />
                    <span className="truncate">{fullName(a)}</span>
                    <span className={clsx('ml-auto inline-flex items-center gap-1', STATUS_TONE[a.status])}>
                      {a.status === 'ACCEPTED' ? <Check className="size-3" /> : a.status === 'DECLINED' ? <X className="size-3" /> : <HelpCircle className="size-3" />}
                      {t(`calendar.status.${a.status}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Row>
        )}
        {item.busy && 'owner' in raw && (
          <Row icon={Users}>
            <span className="text-xs">{fullName(raw.owner)}</span>
          </Row>
        )}
      </div>
      {(ev?.isAttendee || link || ev) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          {ev?.isAttendee && (
            <div className="flex items-center gap-1" role="group" aria-label={t('calendar.respond.title')}>
              {(['ACCEPTED', 'TENTATIVE', 'DECLINED'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onRespond(ev, s)}
                  className={clsx('rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors', myStatus === s ? 'border-primary bg-primary/[0.06] text-link' : 'border-line text-ink hover:bg-sunken')}
                  aria-pressed={myStatus === s}
                >
                  {t(`calendar.respond.${s === 'ACCEPTED' ? 'accept' : s === 'DECLINED' ? 'decline' : 'tentative'}`)}
                </button>
              ))}
            </div>
          )}
          {ev && (
            <a href={calendarApi.icsUrl(ev.id)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-sunken hover:text-ink">
              <Download className="size-3.5" /> {t('calendar.actions.ics')}
            </a>
          )}
          {link && (
            <Link to={link} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-link hover:bg-primary/[0.06]">
              <ExternalLink className="size-3.5" /> {systemLinkLabel(sys!)}
            </Link>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
};
