import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarClock, FileText, Paperclip, Pencil, Trash2, Undo2 } from 'lucide-react';
import { formatBytes } from '@/lib/api';
import { optimizeImage } from '@/lib/imageCompress';
import type { CaseDetail, CaseDocument } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesCaseAppointment } from '@/i18n/pagesCaseAppointment';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDateTime, toLocalInput } from '../labels';
import { DocLinks, useCaseAction, type ActionBody } from './shared';

registerCopy(pagesCaseAppointment);

/** Server: lib/caseAppointment/files.ts (the name is the marker of an appointment file). */
export const APPOINTMENT_DOC_PREFIX = 'Səfirlik görüşü — təsdiq';
export const MAX_APPOINTMENT_FILES = 5;

export const appointmentDocs = (c: CaseDetail): CaseDocument[] => (c.otherDocuments ?? []).filter((d) => d.originalName.startsWith(APPOINTMENT_DOC_PREFIX));

/** JSON body without files; multipart (action + fields + files) with files. */
export const appointmentPayload = async (body: Extract<ActionBody, { action: 'SCHEDULE_APPOINTMENT' }>, files: File[]): Promise<ActionBody | FormData> => {
  if (!files.length) return body;
  const fd = new FormData();
  fd.append('action', body.action);
  fd.append('at', body.at);
  fd.append('place', body.place);
  if (body.note) fd.append('note', body.note);
  if (body.removeDocumentIds?.length) fd.append('removeDocumentIds', JSON.stringify(body.removeDocumentIds));
  for (const f of files) fd.append('files', await optimizeImage(f)); // photos > 1 MB shrunk in the browser
  return fd;
};

/**
 * The embassy appointment form: date, time, place, note and the embassy's confirmation files. First recording
 * (EMBASSY_REVIEW) or edit (APPOINTMENT_SCHEDULED: prefilled; files listed with remove, add more). Saving uses the
 * action SCHEDULE_APPOINTMENT (the server turns it into a reschedule and tells the client).
 */
export const AppointmentForm = ({ c, hint, canSave = true, onDone }: { c: CaseDetail; hint?: ReactNode; canSave?: boolean; onDone?: () => void }) => {
  const { t } = useTranslation();
  const a = (key: string, opts?: Record<string, unknown>) => t(`admin.case.action.${key}`, opts);
  const resched = c.status === 'APPOINTMENT_SCHEDULED';
  const mutation = useCaseAction(c.id);
  const existing = appointmentDocs(c);
  const [at, setAt] = useState('');
  const [atTime, setAtTime] = useState('09:00');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [building, setBuilding] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Prefill from the recorded appointment (re-read when it changes).
  useEffect(() => {
    setAt(toLocalInput(c.appointmentAt).slice(0, 10));
    setAtTime(toLocalInput(c.appointmentAt).slice(11, 16) || '09:00');
    setPlace(c.appointmentPlace ?? '');
    setNote(resched ? (c.staffNote ?? '') : '');
    setFiles([]);
    setRemoved([]);
  }, [c.status, c.appointmentAt, c.appointmentPlace]); // eslint-disable-line react-hooks/exhaustive-deps

  const atFull = at ? `${at}T${atTime || '09:00'}` : '';
  const total = existing.length - removed.length + files.length;
  const ok = !!atFull && place.trim().length >= 3 && !Number.isNaN(new Date(atFull).getTime()) && total <= MAX_APPOINTMENT_FILES;
  const busy = mutation.isPending || building;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    if (existing.length - removed.length + next.length > MAX_APPOINTMENT_FILES) toast.error(String(t('caseAppt.tooMany', { count: MAX_APPOINTMENT_FILES })));
    setFiles(next.slice(0, Math.max(0, MAX_APPOINTMENT_FILES - (existing.length - removed.length))));
    if (input.current) input.current.value = '';
  };

  const save = async () => {
    setBuilding(true);
    try {
      const body = await appointmentPayload(
        { action: 'SCHEDULE_APPOINTMENT', at: new Date(atFull).toISOString(), place: place.trim(), note: note.trim() || undefined, removeDocumentIds: removed.length ? removed : undefined },
        files,
      );
      mutation.mutate(body, {
        onSuccess: () => {
          setFiles([]);
          setRemoved([]);
          onDone?.();
        },
      });
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="space-y-3">
      {resched && c.appointmentAt && (
        <p className="rounded-lg bg-primary/[0.06] px-3 py-2 text-xs text-link">
          {a('currentAppointment')} <strong>{fmtDateTime(c.appointmentAt)}</strong>, {c.appointmentPlace}
        </p>
      )}
      {hint}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ap-at" className="label">
            {a('dateTime')}
          </label>
          <div className="flex gap-2">
            <input id="ap-at" type="date" className="input min-w-0 flex-1" value={at} onChange={(e) => setAt(e.target.value)} />
            <input id="ap-time" type="time" className="input w-28" value={atTime} onChange={(e) => setAtTime(e.target.value)} aria-label={a('time')} />
          </div>
        </div>
        <div>
          <label htmlFor="ap-place" className="label">
            {a('place')}
          </label>
          <input id="ap-place" className="input" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={a('placePlaceholder')} />
        </div>
      </div>
      <div>
        <label htmlFor="ap-anote" className="label">
          {a('noteOptional')}
        </label>
        <textarea id="ap-anote" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={a('appointmentNotePlaceholder')} />
      </div>

      <div>
        <p className="label">{t('caseAppt.filesLabel')}</p>
        <p className="mb-2 text-[11px] text-muted">{t('caseAppt.filesHint')}</p>
        {(existing.length > 0 || files.length > 0) && (
          <ul className="mb-2 divide-y divide-line rounded-lg border border-line" aria-label={t('caseAppt.existing')}>
            {existing.map((d) => {
              const gone = removed.includes(d.id);
              return (
                <li key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className={`min-w-0 flex-1 truncate ${gone ? 'text-muted line-through' : ''}`}>
                    {d.originalName} <span className="text-[11px] text-muted">{formatBytes(d.size)}</span>
                  </span>
                  {gone ? (
                    <button type="button" className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-link" onClick={() => setRemoved(removed.filter((x) => x !== d.id))}>
                      <Undo2 className="size-3.5" aria-hidden /> {t('caseAppt.undo')}
                    </button>
                  ) : (
                    <>
                      <DocLinks doc={d} />
                      <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger-fg" title={t('caseAppt.remove')} aria-label={t('caseAppt.remove')} onClick={() => setRemoved([...removed, d.id])}>
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <Paperclip className="size-4 shrink-0 text-link" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {f.name} <span className="text-[11px] text-muted">{formatBytes(f.size)}</span>
                </span>
                <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger-fg" title={t('caseAppt.remove')} aria-label={t('caseAppt.remove')} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input ref={input} type="file" multiple hidden accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(e) => addFiles(e.target.files)} />
        <button type="button" className="btn-secondary btn-sm" disabled={busy || total >= MAX_APPOINTMENT_FILES} onClick={() => input.current?.click()}>
          <Paperclip className="size-3.5" aria-hidden /> {t('caseAppt.add')}
        </button>
      </div>

      {resched && <p className="text-[11px] text-muted">{t('caseAppt.updateNotice')}</p>}
      <button type="button" className="btn-primary btn-sm" disabled={!ok || busy || !canSave} onClick={() => void save()}>
        {busy ? <Spinner className="size-3.5" /> : <CalendarClock className="size-3.5" />}
        {resched ? a('reschedule') : a('label.SCHEDULE')}
      </button>
    </div>
  );
};

/** "Düzəlt" on the next-appointment card: the same form in a dialog (only while the appointment is recorded). */
export const AppointmentEditButton = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (c.status !== 'APPOINTMENT_SCHEDULED') return null;
  return (
    <>
      <button type="button" className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-link hover:bg-primary/[0.06]" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" aria-hidden /> {t('caseAppt.edit')}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('caseAppt.editTitle')} size="md">
        <AppointmentForm c={c} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
};
