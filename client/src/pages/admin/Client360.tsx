import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  CheckSquare,
  FileText,
  FolderKanban,
  Handshake,
  History,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Plus,
  ShieldCheck,
  StickyNote,
  Tag,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesStaffDesk } from '@/i18n/pagesStaffDesk';
import { useAuth } from '@/lib/auth';
import { hasMinRole, type DocStage, type DocStatus } from '@/lib/types';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { EmptyState, ErrorBlock, KpiCell, KpiStrip, ListSkeleton } from '@/components/admin/ui';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { auditActionLabel, docStatusLabel, eventLabel, fmtDate, fmtDateTime, fmtRelative, fullName, roleLabel, stageLabel, statusLabel, toastError, waLink } from '@/components/admin/labels';
import { Avatar } from '@/components/ui/Avatar';
import { Tabs, TabPanel, useTabParam } from '@/components/ui/Tabs';
import { CallButton } from '@/components/calls/CallButton';
import { ViewAsClientButton } from '@/components/privacyTools/ViewAsClientButton';
import { fmtMoney } from '@/components/billing/api';
import { TIMELINE_TYPES, client360Key, saveClientTags, useClient360, useClientTimeline, type Client360, type TimelineEntry, type TimelineType } from '@/components/staffDesk/api';

registerCopy(pagesStaffDesk);

const TABS = ['timeline', 'cases', 'payments', 'messages', 'calls', 'documents', 'tasks', 'family'] as const;
type TabKey = (typeof TABS)[number];

const FLAG_TONE: Record<string, string> = {
  OVERDUE_INVOICE: 'bg-danger-bg text-danger-fg',
  AWAITING_REPLY: 'bg-warning-bg text-warning-fg',
  VISA_APPROVED: 'bg-success-bg text-success-fg',
  NEW: 'bg-primary/[0.08] text-link',
};

const TYPE_ICON: Record<TimelineType, typeof History> = { case: FolderKanban, note: StickyNote, message: MessageSquare, call: Phone, document: FileText, payment: Banknote, task: CheckSquare, audit: ShieldCheck };
const TYPE_TONE: Record<TimelineType, string> = {
  case: 'bg-primary/[0.08] text-link',
  note: 'bg-warning-bg text-warning-fg',
  message: 'bg-sunken text-ink',
  call: 'bg-success-bg text-success-fg',
  document: 'bg-sunken text-ink',
  payment: 'bg-success-bg text-success-fg',
  task: 'bg-sunken text-ink',
  audit: 'bg-sunken text-muted',
};

const money = (m: Record<string, number>) => {
  const parts = Object.entries(m).filter(([, v]) => v);
  return parts.length ? parts.map(([cur, v]) => fmtMoney(v, cur)).join(' · ') : '—';
};

/** Admin → Müştərilər → client: everything about one client account on one page (header, sections, timeline). */
export default function AdminClient360() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useClient360(id);
  const [tab, setTab] = useTabParam('tab', TABS, 'timeline');
  usePageTitle(data ? fullName(data.client) : t('sd.c360.title'));

  if (isLoading) return <ListSkeleton rows={6} cols={4} stats={4} />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => void refetch()} />;
  const c = data.counts;
  const items = [
    { key: 'timeline' as const, label: t('sd.c360.tabs.timeline'), icon: History },
    { key: 'cases' as const, label: t('sd.c360.tabs.cases'), icon: FolderKanban, count: c.cases },
    { key: 'payments' as const, label: t('sd.c360.tabs.payments'), icon: Banknote, count: c.invoices },
    { key: 'messages' as const, label: t('sd.c360.tabs.messages'), icon: MessageSquare, count: c.messages },
    { key: 'calls' as const, label: t('sd.c360.tabs.calls'), icon: Phone, count: c.calls },
    { key: 'documents' as const, label: t('sd.c360.tabs.documents'), icon: FileText, count: c.documents },
    { key: 'tasks' as const, label: t('sd.c360.tabs.tasks'), icon: CheckSquare, count: c.tasks },
    { key: 'family' as const, label: t('sd.c360.tabs.family'), icon: Users, count: c.family },
  ];

  return (
    <div className="space-y-5">
      <Link to="/admin/users?role=CLIENT" className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-link">
        <ArrowLeft className="size-3.5" aria-hidden /> {t('sd.c360.back')}
      </Link>
      <Header data={data} />

      <KpiStrip cols={6}>
        <KpiCell label={t('sd.c360.kpi.openCases')} value={c.openCases} icon={FolderKanban} hint={t('sd.c360.kpi.ofTotal', { count: c.cases })} />
        <KpiCell label={t('sd.c360.kpi.open')} value={money(data.money.open)} icon={Banknote} tone={c.overdueInvoices ? 'danger' : undefined} hint={c.overdueInvoices ? t('sd.c360.kpi.overdue', { count: c.overdueInvoices }) : t('sd.c360.kpi.paid', { value: money(data.money.paid) })} />
        <KpiCell label={t('sd.c360.kpi.pendingDocs')} value={c.pendingDocuments} icon={FileText} tone={c.pendingDocuments ? 'warning' : undefined} />
        <KpiCell label={t('sd.c360.kpi.tasks')} value={c.tasks} icon={CheckSquare} />
        <KpiCell label={t('sd.c360.kpi.calls')} value={c.calls} icon={Phone} />
        <KpiCell
          label={t('sd.c360.kpi.next')}
          value={data.nextAppointment ? fmtDate(data.nextAppointment.at) : '—'}
          icon={CalendarClock}
          hint={data.nextAppointment ? [data.nextAppointment.number, data.nextAppointment.place].filter(Boolean).join(' · ') : undefined}
          to={data.nextAppointment ? `/admin/cases/${data.nextAppointment.caseId}` : undefined}
        />
      </KpiStrip>

      <div className="overflow-x-auto">
        <Tabs label={t('sd.c360.tabsAria')} idPrefix="c360" items={items} value={tab} onChange={(k) => setTab(k as TabKey)} />
      </div>
      <TabPanel idPrefix="c360" tabKey={tab}>
        {tab === 'timeline' && <Timeline id={data.client.id} cases={data.cases} />}
        {tab === 'cases' && <CasesTab data={data} />}
        {tab === 'payments' && <PaymentsTab data={data} />}
        {tab === 'messages' && <MessagesTab data={data} />}
        {tab === 'calls' && <CallsTab data={data} />}
        {tab === 'documents' && <DocumentsTab data={data} />}
        {tab === 'tasks' && <TasksTab data={data} />}
        {tab === 'family' && <FamilyTab data={data} />}
      </TabPanel>
    </div>
  );
}

// ─── Header ─────────────────────────────────────────────────────────────

const Header = ({ data }: { data: Client360 }) => {
  const { t } = useTranslation();
  const u = data.client;
  const name = fullName(u);
  const primary = data.cases.find((x) => x.open) ?? data.cases[0];
  return (
    <section className="rounded-xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)] sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <Avatar name={name} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-semibold break-words text-ink sm:text-2xl">{name}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span className="rounded bg-sunken px-1.5 py-0.5 font-mono uppercase">{u.locale}</span>
              {u.profession && <span>{u.profession}</span>}
              {u.city && <span>· {u.city}</span>}
              {u.birthDate && <span>· {fmtDate(u.birthDate)}</span>}
              <span>· {t('sd.c360.since', { date: fmtDate(u.createdAt) })}</span>
              <span>· {u.lastSeenAt ? t('sd.c360.lastSeen', { when: fmtRelative(u.lastSeenAt) }) : t('sd.c360.neverSeen')}</span>
              {!u.isActive && <span className="rounded bg-danger-bg px-1.5 font-semibold text-danger-fg">{t('sd.c360.inactive')}</span>}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`mailto:${u.email}`} className="btn-secondary btn-sm max-w-full">
                <Mail className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{u.email}</span>
              </a>
              {u.phone && (
                <>
                  <a href={`tel:${u.phone}`} className="btn-secondary btn-sm whitespace-nowrap">
                    <Phone className="size-3.5" aria-hidden /> {u.phone}
                  </a>
                  <CallButton target={{ clientId: u.id }} phone={u.phone} name={name} />
                  <a href={waLink(u.phone)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                    <MessageCircle className="size-3.5" aria-hidden /> {t('admin.common.whatsapp')}
                  </a>
                </>
              )}
              {primary && (
                <Link to={`/admin/cases/${primary.id}`} className="btn-primary btn-sm">
                  <FolderKanban className="size-3.5" aria-hidden /> {primary.number}
                </Link>
              )}
              <ViewAsClientButton user={{ id: u.id, role: 'CLIENT', firstName: u.firstName, lastName: u.lastName, isActive: u.isActive }} compact />
            </div>
          </div>
        </div>
        <dl className="grid shrink-0 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:w-[22rem] lg:grid-cols-1">
          <div>
            <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t('sd.c360.owner')}</dt>
            <dd className="mt-0.5 inline-flex items-center gap-1.5 font-medium text-ink">
              <UserRound className="size-3.5 text-muted" aria-hidden /> {data.owner ? fullName(data.owner) : t('sd.c360.noOwner')}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t('sd.c360.partner')}</dt>
            <dd className="mt-0.5 inline-flex items-center gap-1.5 font-medium text-ink">
              <Handshake className="size-3.5 text-muted" aria-hidden />
              {data.partner ? (
                <Link to={`/admin/partners/${data.partner.id}`} className="hover:text-link hover:underline">
                  {data.partner.name}
                </Link>
              ) : data.agent ? (
                `${data.agent.name ?? data.agent.code} (${t('sd.c360.agent')})`
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t('sd.c360.consents')}</dt>
            <dd className="mt-0.5 text-xs text-ink">
              {t('sd.c360.whatsapp')}: {u.whatsappOptIn ? '✓' : '—'} · {t('sd.c360.marketing')}: {u.marketingOptIn ? '✓' : '—'}
            </dd>
          </div>
        </dl>
      </div>
      <TagsRow data={data} />
    </section>
  );
};

const TagsRow = ({ data }: { data: Client360 }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const save = useMutation({
    mutationFn: (tags: string[]) => saveClientTags(data.client.id, tags),
    onSuccess: (r) => {
      qc.setQueryData<Client360>(client360Key(data.client.id), (old) => (old ? { ...old, tags: r.tags, contactId: r.contactId } : old));
      toast.success(t('sd.c360.tagsSaved'));
    },
    onError: (e) => toastError(e),
  });
  const add = () => {
    const v = text.trim();
    setText('');
    setAdding(false);
    if (v && !data.tags.some((x) => x.toLowerCase() === v.toLowerCase())) save.mutate([...data.tags, v]);
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
      <Tag className="size-3.5 text-muted" aria-label={t('sd.c360.tags')} />
      {data.flags.map((f) => (
        <span key={f} className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', FLAG_TONE[f] ?? 'bg-sunken text-muted')} title={t('sd.c360.autoFlag')}>
          {t(`sd.c360.flags.${f}`, { defaultValue: f })}
        </span>
      ))}
      {data.tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2 py-0.5 text-[11px] font-semibold text-ink">
          {tag}
          <button type="button" className="grid size-4 place-items-center rounded-full text-muted hover:bg-sunken hover:text-danger-fg" aria-label={t('sd.c360.removeTag', { tag })} disabled={save.isPending} onClick={() => save.mutate(data.tags.filter((x) => x !== tag))}>
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input autoFocus className="input min-h-7 w-36 px-2 py-0.5 text-xs" maxLength={40} value={text} onChange={(e) => setText(e.target.value)} onBlur={add} onKeyDown={(e) => e.key === 'Escape' && (setText(''), setAdding(false))} placeholder={t('sd.c360.tagPlaceholder')} aria-label={t('sd.c360.addTag')} />
        </form>
      ) : (
        <button type="button" className="inline-flex min-h-7 items-center gap-1 rounded-full border border-dashed border-line px-2 text-[11px] font-semibold text-muted hover:border-line-strong hover:text-ink" onClick={() => setAdding(true)}>
          <Plus className="size-3" aria-hidden /> {t('sd.c360.addTag')}
        </button>
      )}
    </div>
  );
};

// ─── Timeline ───────────────────────────────────────────────────────────

const entryTitle = (e: TimelineEntry, t: (k: string, o?: Record<string, unknown>) => string) => {
  switch (e.type) {
    case 'case':
      return e.meta?.to && e.meta.from !== e.meta.to ? `${eventLabel(e.kind)}: ${statusLabel(e.meta.to as never)}` : eventLabel(e.kind);
    case 'note':
      return t('sd.c360.tl.note');
    case 'message':
      return e.kind === 'FROM_CLIENT' ? t('sd.c360.tl.fromClient') : t('sd.c360.tl.fromStaff');
    case 'call':
      return t(e.kind === 'INBOUND' ? 'sd.c360.tl.callIn' : 'sd.c360.tl.callOut', { duration: e.meta?.durationSec ? `${Math.round(Number(e.meta.durationSec) / 60)} min` : '—' });
    case 'document':
      return t('sd.c360.tl.document', { stage: stageLabel(e.kind as DocStage) });
    case 'payment':
      return t(e.kind === 'INVOICE_PAID' ? 'sd.c360.tl.paid' : 'sd.c360.tl.issued', { amount: fmtMoney(Number(e.meta?.cents ?? 0), String(e.meta?.currency ?? 'EUR')) });
    case 'task':
      return e.kind === 'CLIENT_TASK_CREATED' ? t('sd.c360.tl.clientTask') : t('sd.c360.tl.task');
    case 'audit':
      return e.kind === 'FIELD_CHANGED' ? t('sd.c360.tl.field') : auditActionLabel(e.kind);
  }
};

const Timeline = ({ id, cases }: { id: string; cases: Client360['cases'] }) => {
  const { t } = useTranslation();
  const [types, setTypes] = useState<TimelineType[]>([]);
  const [caseId, setCaseId] = useState<string | null>(null);
  const q = useClientTimeline(id, types, caseId);
  const entries = useMemo(() => q.data?.pages.flatMap((p) => p.entries) ?? [], [q.data]);
  const groups = useMemo(() => {
    const out: { day: string; items: TimelineEntry[] }[] = [];
    for (const e of entries) {
      const day = fmtDate(e.at);
      if (out[out.length - 1]?.day === day) out[out.length - 1].items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [entries]);
  const toggle = (k: TimelineType) => setTypes((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" aria-pressed={!types.length} onClick={() => setTypes([])} className={clsx('min-h-8 rounded-lg border px-2.5 text-xs font-semibold', !types.length ? 'border-line-strong bg-sunken text-ink' : 'border-line text-muted hover:text-ink')}>
          {t('sd.c360.tl.all')}
        </button>
        {TIMELINE_TYPES.map((k) => {
          const Icon = TYPE_ICON[k];
          return (
            <button key={k} type="button" aria-pressed={types.includes(k)} onClick={() => toggle(k)} className={clsx('inline-flex min-h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold', types.includes(k) ? 'border-line-strong bg-sunken text-ink' : 'border-line text-muted hover:text-ink')}>
              <Icon className="size-3.5" aria-hidden /> {t(`sd.c360.tl.types.${k}`)}
            </button>
          );
        })}
        {cases.length > 1 && (
          <select className="input ml-auto min-h-8 w-auto py-1 text-xs" value={caseId ?? ''} onChange={(e) => setCaseId(e.target.value || null)} aria-label={t('sd.c360.tl.caseFilter')}>
            <option value="">{t('sd.c360.tl.allCases')}</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.number}
              </option>
            ))}
          </select>
        )}
      </div>
      {q.isLoading ? (
        <ListSkeleton rows={6} cols={2} />
      ) : q.error ? (
        <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
      ) : !entries.length ? (
        <EmptyState icon={History} title={t('sd.c360.tl.empty')} />
      ) : (
        <ol className="space-y-5">
          {groups.map((g) => (
            <li key={g.day}>
              <h3 className="sticky top-0 z-10 mb-2 bg-canvas/90 py-1 text-[11px] font-semibold tracking-wide text-muted uppercase backdrop-blur-sm">{g.day}</h3>
              <ul className="relative space-y-2 border-l border-line pl-5">
                {g.items.map((e) => {
                  const Icon = TYPE_ICON[e.type];
                  return (
                    <li key={e.id} className="relative">
                      <span className={clsx('absolute top-2 -left-[31px] grid size-5 place-items-center rounded-full ring-4 ring-canvas', TYPE_TONE[e.type])} aria-hidden>
                        <Icon className="size-3" />
                      </span>
                      <div className="rounded-lg border border-line bg-card px-3 py-2">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          <span className="font-semibold text-ink">{entryTitle(e, t)}</span>
                          {e.caseNumber && (
                            <Link to={`/admin/cases/${e.caseId}`} className="code-id text-link hover:underline">
                              {e.caseNumber}
                            </Link>
                          )}
                          <span className="ml-auto text-muted" title={fmtDateTime(e.at)}>
                            {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </p>
                        {e.text && <p className="mt-1 line-clamp-3 text-sm break-words whitespace-pre-line text-ink/80">{e.text}</p>}
                        {(e.actor || e.actorRole) && (
                          <p className="mt-1 text-[11px] text-muted">
                            {e.actor ?? '—'}
                            {e.actorRole && ` · ${roleLabel(e.actorRole)}`}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {q.hasNextPage && (
        <div className="text-center">
          <button type="button" className="btn-secondary btn-sm" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {t('sd.c360.tl.more')}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Section tabs ───────────────────────────────────────────────────────

const List = ({ empty, icon, children, count }: { empty: string; icon: typeof History; children: ReactNode; count: number }) =>
  count ? <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">{children}</ul> : <EmptyState icon={icon} title={empty} framed />;

const Row = ({ children, to }: { children: ReactNode; to?: string }) => (
  <li>{to ? <Link to={to} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors hover:bg-sunken/50">{children}</Link> : <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">{children}</div>}</li>
);

const CaseRef = ({ id, number }: { id: string | null; number: string | null }) => (number && id ? <span className="code-id text-xs text-link">{number}</span> : null);

const CasesTab = ({ data }: { data: Client360 }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  return (
    <List empty={t('sd.c360.empty.cases')} icon={FolderKanban} count={data.cases.length}>
      {data.cases.map((c) => (
        <Row key={c.id} to={`/admin/cases/${c.id}`}>
          <span className="code-id font-semibold text-link">{c.number}</span>
          <StatusBadge status={c.status} />
          <span className="min-w-0 flex-1 truncate text-ink">
            {c.profession}
            {c.visaCategory && <span className="text-muted"> · {c.visaCategory.visaLabel} · {tr(c.visaCategory.title)}</span>}
            {c.parentCaseId && <span className="text-muted"> · {t('sd.c360.familyCase')}</span>}
          </span>
          <span className="text-xs text-muted">{c.assignedStaff ? fullName(c.assignedStaff) : t('sd.c360.noOwner')}</span>
          {c.appointmentAt && (
            <span className="inline-flex items-center gap-1 text-xs text-accent-fg">
              <CalendarClock className="size-3.5" aria-hidden /> {fmtDateTime(c.appointmentAt)}
            </span>
          )}
          <span className="text-xs text-muted">{fmtRelative(c.updatedAt)}</span>
        </Row>
      ))}
    </List>
  );
};

const PaymentsTab = ({ data }: { data: Client360 }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const admin = hasMinRole(user?.role, 'ADMIN');
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        {t('sd.c360.money', { billed: money(data.money.billed), paid: money(data.money.paid), open: money(data.money.open) })}
        {admin && (
          <Link to={`/admin/client-invoices?search=${encodeURIComponent(data.client.email)}`} className="ml-2 font-semibold text-link hover:underline">
            {t('sd.c360.allInvoices')}
          </Link>
        )}
      </p>
      <List empty={t('sd.c360.empty.payments')} icon={Banknote} count={data.invoices.length}>
        {data.invoices.map((i) => (
          <Row key={i.id}>
            <span className="code-id font-semibold text-ink">{i.number}</span>
            <span className={clsx('rounded px-1.5 py-0.5 text-[11px] font-semibold', i.status === 'PAID' ? 'bg-success-bg text-success-fg' : i.overdue ? 'bg-danger-bg text-danger-fg' : 'bg-sunken text-muted')}>
              {i.overdue ? t('sd.c360.overdue') : t(`sd.c360.invoiceStatus.${i.status}`, { defaultValue: i.status })}
            </span>
            <span className="min-w-0 flex-1 text-xs text-muted">
              {fmtDate(i.issueDate)} · {t('sd.c360.due', { date: fmtDate(i.dueDate) })}
              {i.paidAt && ` · ${t('sd.c360.paidOn', { date: fmtDate(i.paidAt) })}`}
            </span>
            <CaseRef id={i.caseId} number={i.caseNumber} />
            <span className="num font-semibold text-ink tabular-nums">{fmtMoney(i.grossCents, i.currency)}</span>
            {i.paidCents > 0 && i.paidCents < i.grossCents && <span className="text-xs text-muted tabular-nums">({t('sd.c360.partPaid', { value: fmtMoney(i.paidCents, i.currency) })})</span>}
          </Row>
        ))}
      </List>
    </div>
  );
};

const MessagesTab = ({ data }: { data: Client360 }) => {
  const { t } = useTranslation();
  return (
    <List empty={t('sd.c360.empty.messages')} icon={MessageSquare} count={data.messages.length}>
      {data.messages.map((m) => {
        const fromClient = m.author.role === 'CLIENT';
        return (
          <Row key={m.id} to={`/admin/cases/${m.caseId}#case-messages`}>
            <span className={clsx('rounded px-1.5 py-0.5 text-[11px] font-semibold', fromClient ? 'bg-warning-bg text-warning-fg' : 'bg-primary/[0.08] text-link')}>{fromClient ? t('sd.c360.tl.fromClient') : t('sd.c360.tl.fromStaff')}</span>
            <span className="text-xs text-muted">{m.author.name}</span>
            <CaseRef id={m.caseId} number={m.caseNumber} />
            <span className="ml-auto text-xs text-muted" title={fmtDateTime(m.createdAt)}>
              {fmtRelative(m.createdAt)}
            </span>
            <span className="w-full line-clamp-2 text-ink/80">{m.body}</span>
          </Row>
        );
      })}
    </List>
  );
};

const CallsTab = ({ data }: { data: Client360 }) => {
  const { t } = useTranslation();
  return (
    <List empty={t('sd.c360.empty.calls')} icon={Phone} count={data.calls.length}>
      {data.calls.map((c) => (
        <Row key={c.id}>
          {c.direction === 'INBOUND' ? <PhoneIncoming className="size-4 text-success-fg" aria-label={t('sd.c360.tl.callIn', { duration: '' })} /> : <PhoneOutgoing className="size-4 text-link" aria-label={t('sd.c360.tl.callOut', { duration: '' })} />}
          <span className="font-medium text-ink">{fmtDateTime(c.startedAt)}</span>
          <span className="text-xs text-muted">
            {c.durationSec ? `${Math.floor(c.durationSec / 60)}:${String(c.durationSec % 60).padStart(2, '0')}` : '—'} · {t(`sd.c360.callStatus.${c.status}`, { defaultValue: c.status })}
            {c.staffName && ` · ${c.staffName}`}
          </span>
          <CaseRef id={c.caseId} number={c.caseNumber} />
          {(c.summary || c.note) && <span className="w-full text-ink/80">{c.summary ?? c.note}</span>}
        </Row>
      ))}
    </List>
  );
};

const DocumentsTab = ({ data }: { data: Client360 }) => {
  const { t } = useTranslation();
  return (
    <List empty={t('sd.c360.empty.documents')} icon={FileText} count={data.documents.length}>
      {data.documents.map((d) => (
        <Row key={d.id} to={`/admin/cases/${d.caseId}?tab=documents`}>
          <FileText className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-medium text-ink">{d.originalName}</span>
          <span className="text-xs text-muted">{stageLabel(d.stage as DocStage)}</span>
          <span className={clsx('rounded px-1.5 py-0.5 text-[11px] font-semibold', d.status === 'ACCEPTED' ? 'bg-success-bg text-success-fg' : d.status === 'REJECTED' ? 'bg-danger-bg text-danger-fg' : 'bg-warning-bg text-warning-fg')}>{docStatusLabel(d.status as DocStatus)}</span>
          <CaseRef id={d.caseId} number={d.caseNumber} />
          <span className="text-xs text-muted">{fmtDate(d.createdAt)}</span>
          {d.expiresAt && <span className="text-xs text-warning-fg">{t('sd.c360.expires', { date: fmtDate(d.expiresAt) })}</span>}
        </Row>
      ))}
    </List>
  );
};

const TasksTab = ({ data }: { data: Client360 }) => {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{t('sd.c360.teamTasks')}</h3>
        <List empty={t('sd.c360.empty.tasks')} icon={CheckSquare} count={data.tasks.length}>
          {data.tasks.map((x) => (
            <Row key={x.id} to={`/workspace/tasks/T-${String(x.number).padStart(4, '0')}`}>
              <span className={clsx('min-w-0 flex-1 truncate font-medium', x.status === 'DONE' || x.status === 'CANCELLED' ? 'text-muted line-through' : 'text-ink')}>{x.title}</span>
              <span className="text-xs text-muted">{x.assignees.map((a) => a.name).join(', ') || '—'}</span>
              {x.dueAt && <span className={clsx('text-xs', x.overdue ? 'font-semibold text-danger-fg' : 'text-muted')}>{fmtDate(x.dueAt)}</span>}
              <CaseRef id={x.caseId} number={x.caseNumber} />
            </Row>
          ))}
        </List>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{t('sd.c360.clientTasks')}</h3>
        <List empty={t('sd.c360.empty.clientTasks')} icon={CheckSquare} count={data.clientTasks.length}>
          {data.clientTasks.map((x) => (
            <Row key={x.id} to={`/admin/cases/${x.caseId}`}>
              <span className={clsx('min-w-0 flex-1 truncate font-medium', x.status !== 'OPEN' ? 'text-muted line-through' : 'text-ink')}>{x.title}</span>
              {x.dueAt && <span className={clsx('text-xs', x.overdue ? 'font-semibold text-danger-fg' : 'text-muted')}>{fmtDate(x.dueAt)}</span>}
              <CaseRef id={x.caseId} number={x.caseNumber} />
            </Row>
          ))}
        </List>
      </section>
    </div>
  );
};

const FamilyTab = ({ data }: { data: Client360 }) => {
  const { t } = useTranslation();
  return (
    <List empty={t('sd.c360.empty.family')} icon={Users} count={data.family.length}>
      {data.family.map((f) => (
        <Row key={f.id}>
          <span className="font-medium text-ink">
            {f.firstName} {f.lastName}
          </span>
          <span className="rounded bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-muted">{t(`sd.c360.relation.${f.relation}`)}</span>
          {f.side === 'main' && f.mainApplicant && <span className="text-xs text-muted">{t('sd.c360.mainApplicant', { name: f.mainApplicant })}</span>}
          {f.birthDate && <span className="text-xs text-muted">{fmtDate(f.birthDate)}</span>}
          <span className="text-xs text-muted">{t(`sd.c360.joins.${f.joinsWhen}`)}</span>
          <Link to={`/admin/cases/${f.caseId}`} className="code-id text-xs text-link hover:underline">
            {f.caseNumber}
          </Link>
          {f.caseStatus && <StatusBadge status={f.caseStatus} />}
          {f.otherClientId && (
            <Link to={`/admin/clients/${f.otherClientId}`} className="text-xs font-semibold text-link hover:underline">
              {t('sd.c360.open')}
            </Link>
          )}
        </Row>
      ))}
    </List>
  );
};
