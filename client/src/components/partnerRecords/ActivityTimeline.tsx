import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Activity, CalendarClock, History, ListTodo, Mail, MessageSquareText, Pencil, Phone, Trash2, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPartnerRecords } from '@/i18n/pagesPartnerRecords';
import { Button, IconButton, Spinner, confirmDialog } from '@/components/ui';
import { Chip, Panel } from '@/components/admin/ui';
import { fmtDate, fmtDateTime } from '@/components/admin/labels';
import { ACTIVITY_KINDS, activitiesApi, fetchTimeline, recordsKeys, useContacts, useRecordsMutation, type ActivityKind, type PartnerOwner, type TimelineChange, type TimelineItem } from './api';

registerCopy(pagesPartnerRecords);

/**
 * Timeline of an employer / referral partner (generic `owner`): add a note / call / meeting / e-mail / task with
 * date and contact person; the list merges those entries with the audit changes of the owner ("Leyla changed
 * Betriebsnummer: — → 12345678", contract and contact events), newest first, paged ("show more").
 */
export interface ActivityTimelineProps {
  owner: PartnerOwner;
  className?: string;
  title?: string;
  pageSize?: number;
}

const KIND_ICON: Record<ActivityKind, LucideIcon> = { NOTE: MessageSquareText, CALL: Phone, MEETING: Users, EMAIL: Mail, TASK: ListTodo };

const localInput = (d = new Date()) => {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
};

/** "2026-11-01" days and ISO times as dates; booleans, objects and long texts kept short. */
const valueText = (v: unknown, none: string): string => {
  if (v === null || v === undefined || v === '') return none;
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(`${v}T12:00:00Z`);
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDate(v);
    return v.length > 80 ? `${v.slice(0, 80)}…` : v;
  }
  if (typeof v === 'number') return String(v);
  return JSON.stringify(v).slice(0, 80);
};

export function ActivityTimeline({ owner, className, title, pageSize = 20 }: ActivityTimelineProps) {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<string>('');
  const contacts = useContacts(owner);
  const q = useInfiniteQuery({
    queryKey: [...recordsKeys.timeline(owner), filter, pageSize],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchTimeline(owner, pageParam, pageSize, filter || undefined),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  const [kind, setKind] = useState<ActivityKind>('NOTE');
  const [body, setBody] = useState('');
  const [at, setAt] = useState(localInput());
  const [contactId, setContactId] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  const add = useRecordsMutation(owner, () => activitiesApi.create(owner, { kind, body: body.trim(), at: new Date(at).toISOString(), contactId: contactId || null }), {
    success: t('partnerRecords.activity.created'),
    onSuccess: () => {
      setBody('');
      setAt(localInput());
    },
  });
  const update = useRecordsMutation(owner, (v: { id: string; body: string }) => activitiesApi.update(v.id, { body: v.body }), {
    success: t('partnerRecords.common.saved'),
    onSuccess: () => setEditing(null),
  });
  const remove = useRecordsMutation(owner, (id: string) => activitiesApi.remove(id), { success: t('partnerRecords.common.deleted') });

  const fieldName = (f: string) => (i18n.exists(`partnerRecords.fields.${f}`) ? t(`partnerRecords.fields.${f}`) : f);
  const actionName = (a: string) => (i18n.exists(`partnerRecords.activity.actions.${a}`) ? t(`partnerRecords.activity.actions.${a}`) : a.toLowerCase().replace(/_/g, ' '));
  const none = t('partnerRecords.common.none');

  const changeLine = (actor: string, c: TimelineChange) => (
    <li key={c.field} className="text-xs text-ink/90">
      <span className="font-medium">{t('partnerRecords.activity.changedField', { actor, field: fieldName(c.field) })}</span>
      {': '}
      {c.hidden ? (
        <span className="text-muted italic">{t('partnerRecords.activity.hidden')}</span>
      ) : (
        <span>
          <span className="text-muted line-through decoration-muted/50">{valueText(c.from, none)}</span> → <span className="font-semibold">{valueText(c.to, none)}</span>
        </span>
      )}
    </li>
  );

  const renderItem = (it: TimelineItem) => {
    if (it.type === 'activity') {
      const Icon = KIND_ICON[it.kind] ?? MessageSquareText;
      return (
        <li key={`a-${it.id}`} className="relative flex gap-3 pb-5 last:pb-0">
          <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-link">
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">
                <span className="font-semibold text-ink">{t(`partnerRecords.activity.kinds.${it.kind}`)}</span> · {fmtDateTime(it.at)}
                {it.actor && ` · ${it.actor.name}`}
                {it.contact && ` · ${t('partnerRecords.activity.withContact', { name: it.contact.name })}`}
              </p>
              {it.canEdit && editing !== it.id && (
                <span className="flex gap-1">
                  <IconButton
                    icon={Pencil}
                    size="sm"
                    label={t('partnerRecords.common.edit')}
                    onClick={() => {
                      setEditing(it.id);
                      setEditBody(it.body);
                    }}
                  />
                  <IconButton
                    icon={Trash2}
                    size="sm"
                    label={t('partnerRecords.common.delete')}
                    onClick={async () => {
                      if (await confirmDialog({ title: t('partnerRecords.activity.deleteTitle'), message: it.body.slice(0, 160) })) remove.mutate(it.id);
                    }}
                  />
                </span>
              )}
            </div>
            {editing === it.id ? (
              <div className="mt-2 space-y-2">
                <textarea className="input min-h-20" aria-label={t('partnerRecords.activity.placeholder')} maxLength={10000} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                    {t('partnerRecords.common.cancel')}
                  </Button>
                  <Button size="sm" loading={update.isPending} disabled={!editBody.trim()} onClick={() => update.mutate({ id: it.id, body: editBody.trim() })}>
                    {t('partnerRecords.common.save')}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{it.body}</p>
            )}
          </div>
        </li>
      );
    }
    const actor = it.actor?.name ?? t('partnerRecords.activity.system');
    const detailTitle = typeof it.details.title === 'string' ? it.details.title : typeof it.details.name === 'string' ? it.details.name : null;
    return (
      <li key={`c-${it.id}`} className="relative flex gap-3 pb-5 last:pb-0">
        <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken text-muted">
          <History className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-xs text-muted">
            <span className="font-semibold text-ink">{actionName(it.action)}</span>
            {detailTitle && <span className="text-ink"> · {detailTitle}</span>} · {fmtDateTime(it.at)} · {actor}
          </p>
          {it.changes.length > 0 && <ul className="mt-1 space-y-0.5">{it.changes.map((c) => changeLine(actor, c))}</ul>}
        </div>
      </li>
    );
  };

  return (
    <Panel title={title ?? t('partnerRecords.activity.title')} icon={Activity} className={className}>
      <form
        className="mb-5 space-y-2 rounded-lg border border-line bg-sunken/40 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate(undefined);
        }}
      >
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('partnerRecords.fields.kind')}>
          {ACTIVITY_KINDS.map((k) => {
            const Icon = KIND_ICON[k];
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={clsx('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition', kind === k ? 'border-primary bg-primary/10 text-link' : 'border-line bg-card text-muted hover:text-ink')}
              >
                <Icon className="size-3.5" aria-hidden /> {t(`partnerRecords.activity.kinds.${k}`)}
              </button>
            );
          })}
        </div>
        <textarea className="input min-h-20" aria-label={t('partnerRecords.activity.placeholder')} placeholder={t('partnerRecords.activity.placeholder')} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[11rem] flex-1 text-xs">
            <span className="mb-1 flex items-center gap-1 text-muted">
              <CalendarClock className="size-3.5" aria-hidden /> {t('partnerRecords.activity.at')}
            </span>
            <input type="datetime-local" className="input" value={at} onChange={(e) => setAt(e.target.value)} />
          </label>
          {!!contacts.data?.length && (
            <label className="min-w-[11rem] flex-1 text-xs">
              <span className="mb-1 block text-muted">{t('partnerRecords.activity.contact')}</span>
              <select className="input" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">—</option>
                {contacts.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.position ? ` · ${c.position}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button type="submit" size="sm" loading={add.isPending} disabled={!body.trim() || !at}>
            {t('partnerRecords.activity.add')}
          </Button>
        </div>
      </form>

      <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        <Chip active={!filter} onClick={() => setFilter('')}>
          {t('partnerRecords.activity.filterAll')}
        </Chip>
        {ACTIVITY_KINDS.map((k) => (
          <Chip key={k} active={filter === k} onClick={() => setFilter(filter === k ? '' : k)}>
            {t(`partnerRecords.activity.kinds.${k}`)}
          </Chip>
        ))}
        <Chip active={filter === 'CHANGE'} onClick={() => setFilter(filter === 'CHANGE' ? '' : 'CHANGE')}>
          {t('partnerRecords.activity.filterChanges')}
        </Chip>
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner className="size-5 text-link" />
        </div>
      ) : !items.length ? (
        <p className="py-4 text-center text-sm text-muted">{t('partnerRecords.activity.empty')}</p>
      ) : (
        <ol className="relative before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-line">{items.map(renderItem)}</ol>
      )}
      {q.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button size="sm" variant="secondary" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {t('partnerRecords.activity.more')}
          </Button>
        </div>
      )}
    </Panel>
  );
}

export default ActivityTimeline;
