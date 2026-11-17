import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, Check, Eye, Handshake, MessagesSquare, Search, Send, Users, X } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAccessPartners } from '@/i18n/pagesAccessPartners';
import { pagesPartnerAccess } from '@/i18n/pagesPartnerAccess';
import { useL10n } from '@/lib/l10n';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import type { PartnerAccess, PartnerPerms, PartnerTemplate } from '@/components/partnerPortal/api';
import { PermissionMatrix, usePermSummary } from '@/components/partnerPortal/PermissionMatrix';
import { TeamManager } from '@/pages/partner/Team';

registerCopy(pagesAccessPartners);
registerCopy(pagesPartnerAccess);

/**
 * Access Center › Partners (SUPER_ADMIN, or an ADMIN granted "manage access"): per-partner portal permissions with
 * templates, a live preview of what the partner's portal returns, the partner's team members and portal messages.
 * Server: routes/admin/accessPartners.ts; enforcement on every /api/partner request (lib/partnerAccess). Every change
 * is audit-logged (ACCESS_PARTNER_PERMISSIONS_CHANGED, PARTNER_MEMBER_*).
 */

const BASE = '/admin/access/partners';
const TEMPLATES: PartnerTemplate[] = ['LEGACY', 'DEFAULT', 'REFERRER', 'DOCUMENTS', 'FULL', 'CUSTOM'];

interface Meta {
  templatePerms: Record<'DEFAULT' | 'REFERRER' | 'DOCUMENTS' | 'FULL' | 'LEGACY_MINIMAL' | 'LEGACY_EXTENDED', PartnerPerms>;
}
interface PartnerRow {
  id: string;
  name: string;
  active: boolean;
  category: string;
  hasLogin: boolean;
  contractEnd: string | null;
  template: PartnerTemplate;
  perms: PartnerPerms;
  members: number;
}
interface PartnerDetail {
  partner: { id: string; name: string; active: boolean; category: string; visibility: string; hasLogin: boolean; contractEnd: string | null };
  template: PartnerTemplate;
  perms: PartnerPerms;
}
interface Preview {
  perms: PartnerPerms;
  areas: PartnerAccess['areas'];
  counts: { clients: number | null; cases: number };
  sampleClient: Record<string, unknown> | null;
  sampleCase: Record<string, unknown> | null;
}

const templateBadge = (tpl: PartnerTemplate) =>
  clsx('badge whitespace-nowrap', tpl === 'LEGACY' ? 'bg-sunken text-muted' : tpl === 'CUSTOM' ? 'bg-warning-bg text-warning-fg' : 'bg-accent-bg text-accent-fg');

export default function PartnersTab() {
  const { t } = useTranslation();
  const { date } = useL10n();
  const summary = usePermSummary();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  // Deep link from the admin partner page: /admin/access?tab=partners&partner=<id>
  const [partnerId, setPartnerId] = useState<string | null>(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('partner')));
  useEffect(() => {
    const id = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  const list = useQuery({
    queryKey: ['access-partners', search],
    queryFn: async () => (await api.get<{ items: PartnerRow[] }>(BASE, { params: search ? { q: search } : {} })).data.items,
    enabled: !partnerId,
  });

  if (partnerId) return <PartnerEditor id={partnerId} onBack={() => setPartnerId(null)} />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="type-section-title text-ink">{t('accessPartners.title')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t('accessPartners.intro')}</p>
      </div>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <label className="sr-only" htmlFor="access-partners-search">
          {t('accessPartners.search')}
        </label>
        <input id="access-partners-search" className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('accessPartners.search')} maxLength={100} />
      </div>
      {list.isLoading ? (
        <Spinner className="size-6" />
      ) : list.isError || !list.data ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <p className="text-sm text-muted">{t('accessPartners.empty')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {list.data.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setPartnerId(p.id)} className="flex w-full flex-wrap items-start justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-sunken">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">
                    {p.name}
                    {!p.active && <span className="badge ml-2 bg-sunken align-middle text-muted">{t('accessPartners.inactive')}</span>}
                    {!p.hasLogin && <span className="ml-2 text-xs font-normal text-muted">{t('accessPartners.noLogin')}</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{summary(p.perms)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className={templateBadge(p.template)}>{t(`partnerAccess.template.${p.template}`)}</span>
                  {p.members > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden /> {p.members}
                    </span>
                  )}
                  {p.contractEnd && (
                    <span>
                      {t('accessPartners.col.contract')}: {date(p.contractEnd)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PartnerEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const meta = useQuery({ queryKey: ['access-partners-meta'], queryFn: async () => (await api.get<Meta>(`${BASE}/meta`)).data, staleTime: 5 * 60_000 });
  const detail = useQuery({ queryKey: ['access-partner', id], queryFn: async () => (await api.get<PartnerDetail>(`${BASE}/${id}`)).data });
  const [draft, setDraft] = useState<{ template: PartnerTemplate; perms: PartnerPerms } | null>(null);
  useEffect(() => {
    if (detail.data && !draft) setDraft({ template: detail.data.template, perms: detail.data.perms });
  }, [detail.data, draft]);

  const permsOf = (tpl: PartnerTemplate, current: PartnerPerms): PartnerPerms => {
    if (!meta.data) return current;
    if (tpl === 'LEGACY') return detail.data?.partner.visibility === 'EXTENDED' ? meta.data.templatePerms.LEGACY_EXTENDED : meta.data.templatePerms.LEGACY_MINIMAL;
    if (tpl === 'CUSTOM') return current;
    return meta.data.templatePerms[tpl];
  };

  const save = useMutation({
    mutationFn: async () => (await api.put<{ membersCapped: string[] }>(`${BASE}/${id}/permissions`, { template: draft!.template, ...(draft!.template === 'CUSTOM' ? { perms: draft!.perms } : {}) })).data,
    onSuccess: async (r) => {
      toast.success(t('accessPartners.saved'));
      if (r.membersCapped.length) toast.warning(t('accessPartners.capped', { count: r.membersCapped.length }));
      await qc.invalidateQueries({ queryKey: ['access-partner', id] });
      await qc.invalidateQueries({ queryKey: ['access-partners'] });
      await qc.invalidateQueries({ queryKey: ['partner-team'] });
    },
    onError: () => toast.error(t('accessPartners.error')),
  });

  if (detail.isLoading || !draft) return <Spinner className="size-6" />;
  if (detail.isError || !detail.data) return <ErrorState onRetry={() => detail.refetch()} />;
  const d = detail.data;
  const dirty = draft.template !== d.template || JSON.stringify(draft.perms) !== JSON.stringify(d.perms);

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> {t('accessPartners.back')}
      </button>
      <div>
        <h2 className="type-section-title flex flex-wrap items-center gap-2 text-ink">
          <Handshake className="size-5 text-muted" aria-hidden /> {d.partner.name}
          <span className={templateBadge(d.template)}>{t(`partnerAccess.template.${d.template}`)}</span>
        </h2>
      </div>

      <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
        <h3 className="type-overline">{t('accessPartners.templates')}</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl}
              type="button"
              aria-pressed={draft.template === tpl}
              onClick={() => setDraft({ template: tpl, perms: permsOf(tpl, draft.perms) })}
              className={clsx('rounded-xl border p-3 text-left transition-colors', draft.template === tpl ? 'border-primary bg-primary/5' : 'border-line hover:border-line-strong')}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                {draft.template === tpl && <Check className="size-4 text-primary" aria-hidden />}
                {t(`partnerAccess.template.${tpl}`)}
              </span>
              <span className="mt-1 block text-xs text-muted">{t(`accessPartners.templateHint.${tpl}`)}</span>
            </button>
          ))}
        </div>
        <h3 className="type-overline mt-6">{t('accessPartners.matrix')}</h3>
        <p className="text-xs text-muted">{t('accessPartners.matrixHint')}</p>
        <PermissionMatrix idPrefix={`ap-${id}`} value={draft.perms} onChange={(perms) => setDraft({ template: 'CUSTOM', perms })} />
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner className="size-4" />} {t('accessPartners.save')}
          </button>
          {dirty && (
            <button type="button" className="btn-ghost" onClick={() => setDraft({ template: d.template, perms: d.perms })}>
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </section>

      <PreviewPanel id={id} template={draft.template} perms={draft.perms} />

      <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
        <h3 className="type-section-title flex items-center gap-2 text-ink">
          <Users className="size-5 text-muted" aria-hidden /> {t('accessPartners.team')}
        </h3>
        <p className="mb-3 text-xs text-muted">{t('accessPartners.teamHint')}</p>
        <TeamManager base={`${BASE}/${id}/members`} />
      </section>

      <MessagesPanel id={id} />
    </div>
  );
}

/** Flattens a sample object to "key: value" lines, null values marked hidden. */
const lines = (o: Record<string, unknown> | null, hidden: string, prefix = ''): string[] => {
  if (!o) return [];
  return Object.entries(o).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) return [`${key}: — ${hidden}`];
    if (Array.isArray(v)) return [`${key}: [${v.length}]`];
    if (typeof v === 'object') return lines(v as Record<string, unknown>, hidden, key).slice(0, 12);
    return [`${key}: ${String(v).slice(0, 60)}`];
  });
};

function PreviewPanel({ id, template, perms }: { id: string; template: PartnerTemplate; perms: PartnerPerms }) {
  const { t } = useTranslation();
  const params = useMemo(() => ({ template, ...(template === 'CUSTOM' ? { perms: JSON.stringify(perms) } : {}) }), [template, perms]);
  const q = useQuery({ queryKey: ['access-partner-preview', id, params], queryFn: async () => (await api.get<Preview>(`${BASE}/${id}/preview`, { params })).data });
  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h3 className="type-section-title flex items-center gap-2 text-ink">
        <Eye className="size-5 text-muted" aria-hidden /> {t('accessPartners.preview')}
      </h3>
      <p className="mb-3 text-xs text-muted">{t('accessPartners.previewHint')}</p>
      {q.isLoading ? (
        <Spinner className="size-5" />
      ) : q.isError || !q.data ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-4">
          <div>
            <h4 className="type-overline">{t('accessPartners.areas')}</h4>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {(Object.keys(q.data.areas) as (keyof Preview['areas'])[]).map((a) => (
                <li key={a} className={clsx('badge', q.data.areas[a] ? 'bg-success-bg text-success-fg' : 'bg-sunken text-muted line-through')}>
                  {t(`accessPartners.area.${a}`)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">{t('accessPartners.counts', { clients: q.data.counts.clients ?? '—', cases: q.data.counts.cases })}</p>
          </div>
          {!q.data.sampleClient && !q.data.sampleCase ? (
            <p className="text-sm text-muted">{t('accessPartners.noSample')}</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {q.data.sampleClient && (
                <div>
                  <h4 className="type-overline">{t('accessPartners.sampleClient')}</h4>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-sunken p-3 text-xs whitespace-pre-wrap text-ink">{lines(q.data.sampleClient, t('accessPartners.hidden')).join('\n')}</pre>
                </div>
              )}
              {q.data.sampleCase && (
                <div>
                  <h4 className="type-overline">{t('accessPartners.sampleCase')}</h4>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-sunken p-3 text-xs whitespace-pre-wrap text-ink">{lines(q.data.sampleCase, t('accessPartners.hidden')).join('\n')}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

interface StaffMessage {
  id: string;
  from: 'PARTNER' | 'TEAM';
  author: string | null;
  text: string;
  at: string;
}

function MessagesPanel({ id }: { id: string }) {
  const { t } = useTranslation();
  const { dateTime } = useL10n();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const q = useQuery({ queryKey: ['access-partner-messages', id], queryFn: async () => (await api.get<{ items: StaffMessage[] }>(`${BASE}/${id}/messages`)).data.items });
  const send = useMutation({
    mutationFn: async () => (await api.post(`${BASE}/${id}/messages`, { text: text.trim() })).data,
    onSuccess: async () => {
      setText('');
      toast.success(t('accessPartners.replySent'));
      await qc.invalidateQueries({ queryKey: ['access-partner-messages', id] });
    },
    onError: () => toast.error(t('accessPartners.error')),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) send.mutate();
  };
  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h3 className="type-section-title flex items-center gap-2 text-ink">
        <MessagesSquare className="size-5 text-muted" aria-hidden /> {t('accessPartners.messages')}
      </h3>
      {q.isLoading ? (
        <Spinner className="size-5" />
      ) : q.isError || !q.data ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t('accessPartners.messagesEmpty')}</p>
      ) : (
        <ul className="mt-3 max-h-96 space-y-2 overflow-auto">
          {q.data.map((m) => (
            <li key={m.id} className={clsx('rounded-xl px-3 py-2', m.from === 'PARTNER' ? 'bg-sunken' : 'bg-accent-bg')}>
              <p className="text-xs font-semibold text-muted">
                {t(`accessPartners.from.${m.from}`)}
                {m.author ? ` · ${m.author}` : ''} · {dateTime(m.at)}
              </p>
              <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-ink">{m.text}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="mt-3 space-y-2">
        <label className="sr-only" htmlFor={`reply-${id}`}>
          {t('accessPartners.reply')}
        </label>
        <textarea id={`reply-${id}`} className="input min-h-20" maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('accessPartners.reply')} />
        <button type="submit" className="btn-secondary btn-sm" disabled={send.isPending || !text.trim()}>
          {send.isPending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" aria-hidden />} {t('accessPartners.replySend')}
        </button>
      </form>
    </section>
  );
}
