import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Briefcase, Check, Clock, FolderInput, Search, Tag } from 'lucide-react';
import { api } from '@/lib/api';
import { Popover } from '@/components/tasks/bits';
import { Dialog } from './Dialog';
import type { CaseRef, MailFolder, MailLabel, SnoozePreset } from './types';
import { SNOOZE_PRESETS } from './types';
import { toLocalInput } from './utils';

export const MenuItem = ({ onClick, children, active, icon }: { onClick: () => void; children: ReactNode; active?: boolean; icon?: ReactNode }) => (
  <button type="button" onClick={onClick} className={clsx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-sunken', active ? 'font-semibold text-link' : 'text-ink')}>
    {icon}
    <span className="min-w-0 flex-1 truncate">{children}</span>
    {active && <Check className="size-3.5 text-link" aria-hidden />}
  </button>
);

/** Snooze presets + "pick a date"; `onPick` receives a preset or an ISO date. */
export const SnoozeMenu = ({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (v: { preset?: SnoozePreset; until?: string }) => void }) => {
  const { t } = useTranslation();
  const [custom, setCustom] = useState(false);
  const [value, setValue] = useState(() => toLocalInput(new Date(Date.now() + 24 * 3600 * 1000)));
  useEffect(() => {
    if (!open) setCustom(false);
  }, [open]);
  return (
    <Popover open={open} onClose={onClose} className="w-60" align="right">
      {SNOOZE_PRESETS.map((p) => (
        <MenuItem key={p} icon={<Clock className="size-3.5 text-muted" aria-hidden />} onClick={() => onPick({ preset: p })}>
          {t(`mail.snooze.${p}`)}
        </MenuItem>
      ))}
      <div className="my-1 border-t border-line" />
      {!custom ? (
        <MenuItem icon={<Clock className="size-3.5 text-muted" aria-hidden />} onClick={() => setCustom(true)}>
          {t('mail.snooze.pickDate')}
        </MenuItem>
      ) : (
        <div className="space-y-2 p-1.5">
          <input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="input py-1.5 text-sm" min={toLocalInput(new Date())} />
          <button type="button" className="btn-primary btn-sm w-full" onClick={() => value && onPick({ until: new Date(value).toISOString() })}>
            {t('mail.snooze.confirm')}
          </button>
        </div>
      )}
    </Popover>
  );
};

export const MoveMenu = ({ open, onClose, folders, currentFolderId, onPick }: { open: boolean; onClose: () => void; folders: MailFolder[]; currentFolderId?: string | null; onPick: (folder: MailFolder) => void }) => {
  const { t } = useTranslation();
  return (
    <Popover open={open} onClose={onClose} className="w-64" align="right">
      {folders.map((f) => (
        <MenuItem key={f.id} icon={<FolderInput className="size-3.5 text-muted" aria-hidden />} active={f.id === currentFolderId} onClick={() => onPick(f)}>
          {f.role !== 'OTHER' ? t(`mail.views.${f.role.toLowerCase()}`) : f.name}
        </MenuItem>
      ))}
      {!folders.length && <p className="px-2 py-3 text-center text-sm text-muted">—</p>}
    </Popover>
  );
};

export const LabelsMenu = ({ open, onClose, labels, selected, onToggle, onManage }: { open: boolean; onClose: () => void; labels: MailLabel[]; selected: Set<string>; onToggle: (label: MailLabel, on: boolean) => void; onManage?: () => void }) => {
  const { t } = useTranslation();
  return (
    <Popover open={open} onClose={onClose} className="w-60" align="right">
      {labels.map((l) => {
        const on = selected.has(l.id);
        return (
          <MenuItem key={l.id} active={on} icon={<span className="size-2.5 rounded-full" style={{ background: l.color }} aria-hidden />} onClick={() => onToggle(l, !on)}>
            {l.name}
          </MenuItem>
        );
      })}
      {!labels.length && <p className="px-2 py-3 text-center text-sm text-muted">{t('mail.settings.labels.none')}</p>}
      {onManage && (
        <>
          <div className="my-1 border-t border-line" />
          <MenuItem icon={<Tag className="size-3.5 text-muted" aria-hidden />} onClick={onManage}>
            {t('mail.settings.tabs.labels')}
          </MenuItem>
        </>
      )}
    </Popover>
  );
};

interface AdminCaseRow {
  id: string;
  number: string;
  client: { firstName: string; lastName: string };
}

const useDebounced = (value: string, ms = 250) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
};

/** Searches visa cases (GET /api/admin/cases?search=) to link a message to one. */
export const CasePickerDialog = ({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (c: CaseRef) => void }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const debounced = useDebounced(q);
  const results = useQuery({
    queryKey: ['mail', 'cases', debounced],
    queryFn: async () => (await api.get<{ items: AdminCaseRow[] }>('/admin/cases', { params: { search: debounced || undefined } })).data.items,
    enabled: open,
    staleTime: 30_000,
  });
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title={t('mail.actions.selectCase')} size="sm">
      <label className="relative mb-2 block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-9" placeholder="TV-… / name" data-autofocus />
      </label>
      <ul className="max-h-72 overflow-y-auto">
        {(results.data ?? []).map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onPick({ id: c.id, number: c.number, clientName: `${c.client.firstName} ${c.client.lastName}`.trim() })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-sunken">
              <Briefcase className="size-3.5 shrink-0 text-muted" aria-hidden />
              <span className="font-semibold text-ink">{c.number}</span>
              <span className="truncate text-muted">
                {c.client.firstName} {c.client.lastName}
              </span>
            </button>
          </li>
        ))}
        {results.isFetched && !results.data?.length && <li className="px-2 py-4 text-center text-sm text-muted">{t('mail.empty.search')}</li>}
      </ul>
    </Dialog>
  );
};
