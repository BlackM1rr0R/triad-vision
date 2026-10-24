import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Download, History, ListChecks, Search, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesLegalDocs } from '@/i18n/pagesLegalDocs';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/admin/ui';
import { fmtDateTime, fullName } from '@/components/admin/labels';
import { versionPath, type LegalKind } from './api';

registerCopy(pagesLegalDocs);

interface ConsentRow {
  id: string;
  userId: string | null;
  email: string | null;
  visitorId: string | null;
  type: string;
  granted: boolean;
  version: string;
  legalDocumentId: string | null;
  source: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  user?: { id: string; email: string; firstName: string; lastName: string } | null;
}
type DocRef = { id: string; kind: LegalKind; version: string; status: string };
interface RegisterResponse {
  items: ConsentRow[];
  total: number;
  types: string[];
  documents: Record<string, DocRef>;
  versions: string[];
  sources: string[];
}
interface TimelineResponse {
  user: { id: string; email: string; firstName: string; lastName: string; role: string } | null;
  items: ConsentRow[];
  current: Record<string, { granted: boolean; version: string; at: string; legalDocumentId: string | null }>;
  documents: Record<string, DocRef>;
}
type Person = { userId?: string; email?: string; visitorId?: string; label: string };

/** Type / source labels: privacy copy first, then the legal-docs additions (cookies, re-acceptance), else the raw code. */
const useLabels = () => {
  const { t, i18n } = useTranslation();
  const pick = (keys: string[], raw: string) => {
    const k = keys.find((x) => i18n.exists(x));
    return k ? t(k) : raw;
  };
  return {
    type: (v: string) => pick([`privacy.consentType.${v}`, `legalDocs.consentTypes.${v}`], v),
    source: (v: string) => pick([`privacy.source.${v}`, `legalDocs.sources.${v}`], v),
  };
};

/** Version cell: links to the exact text accepted when the consent refers to a legal document. */
const VersionCell = ({ row, documents }: { row: ConsentRow; documents: Record<string, DocRef> }) => {
  const { t } = useTranslation();
  const doc = row.legalDocumentId ? documents[row.legalDocumentId] : undefined;
  if (!doc) return <>{row.version}</>;
  return (
    <a href={versionPath(doc.kind, doc.version)} target="_blank" rel="noopener" className="font-semibold text-brand-600 hover:underline" title={t('legalDocs.consents.openText')}>
      {row.version}
    </a>
  );
};

const Timeline = ({ person, onClose }: { person: Person | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const labels = useLabels();
  const qs = new URLSearchParams();
  if (person?.userId) qs.set('userId', person.userId);
  else if (person?.email) qs.set('email', person.email);
  if (person?.visitorId) qs.set('visitorId', person.visitorId);
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-consent-person', qs.toString()],
    queryFn: async () => (await api.get<TimelineResponse>(`/admin/privacy/consents/person?${qs.toString()}`)).data,
    enabled: !!person,
  });
  return (
    <Drawer open={!!person} onClose={onClose} title={t('legalDocs.consents.timelineTitle')} description={person?.label} width="md">
      {isLoading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorBlock error={error} />
      ) : (
        <div className="space-y-5">
          {data.user && (
            <Link to={`/admin/users?search=${encodeURIComponent(data.user.email)}`} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:underline">
              <UserRound className="size-4" aria-hidden /> {fullName(data.user)} · {data.user.email}
            </Link>
          )}
          {Object.keys(data.current).length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{t('legalDocs.consents.currentState')}</h3>
              <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                {Object.entries(data.current).map(([type, c]) => (
                  <li key={type} className="rounded-lg border border-line bg-surface px-3 py-2">
                    <span className="block text-xs text-muted">{labels.type(type)}</span>
                    <b className={c.granted ? 'text-success-fg' : 'text-warning-fg'}>{c.granted ? t('privacy.admin.consents.yes') : t('privacy.admin.consents.no')}</b>
                    <span className="ml-2 text-xs text-muted">v {c.version}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!data.items.length ? (
            <p className="text-sm text-muted">{t('legalDocs.consents.timelineEmpty')}</p>
          ) : (
            <ol className="relative space-y-3 border-l border-line pl-4">
              {[...data.items].reverse().map((r) => (
                <li key={r.id} className="relative">
                  <span className={clsx('absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full ring-2 ring-card', r.granted ? 'bg-success' : 'bg-warning')} aria-hidden />
                  <p className="text-sm text-ink">
                    <b>{labels.type(r.type)}</b>: {r.granted ? t('privacy.admin.consents.yes') : t('privacy.admin.consents.no')}
                  </p>
                  <p className="text-xs text-muted">
                    {fmtDateTime(r.createdAt)} · {labels.source(r.source)} · {t('legalDocs.consents.version')} <VersionCell row={r} documents={data.documents} />
                    {r.ip ? ` · ${r.ip}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Drawer>
  );
};

/**
 * Consent register (Admin → Privacy → Consents): filter by person, type, version, source and date,
 * open one person's timeline with the exact legal text version accepted, export CSV / JSON.
 */
export const ConsentRegister = () => {
  const { t } = useTranslation();
  const labels = useLabels();
  const [email, setEmail] = useState('');
  const [type, setType] = useState('');
  const [version, setVersion] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [person, setPerson] = useState<Person | null>(null);
  const query = new URLSearchParams();
  if (email.trim()) query.set('email', email.trim());
  if (type) query.set('type', type);
  if (version) query.set('version', version);
  if (source) query.set('source', source);
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const qs = query.toString();
  const exportUrl = (format: 'csv' | 'download') => {
    const q = new URLSearchParams(query);
    q.set('format', format);
    return `/api/admin/privacy/consents?${q.toString()}`;
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-privacy-consents', qs],
    queryFn: async () => (await api.get<RegisterResponse>(`/admin/privacy/consents${qs ? `?${qs}` : ''}`)).data,
  });

  const personOf = (r: ConsentRow): Person | null => {
    if (r.userId) return { userId: r.userId, label: r.user?.email ?? r.email ?? r.userId };
    if (r.email) return { email: r.email, label: r.email };
    if (r.visitorId) return { visitorId: r.visitorId, label: `${t('legalDocs.consents.visitor')} ${r.visitorId}` };
    return null;
  };

  return (
    <>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[minmax(0,1fr)_12rem_10rem_11rem_9.5rem_9.5rem]">
        <label className="relative sm:col-span-2 lg:col-span-4 xl:col-span-1">
          <span className="sr-only">{t('privacy.admin.consents.email')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" className="input pl-9" placeholder={t('privacy.admin.consents.email')} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <select aria-label={t('privacy.admin.consents.type')} className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t('privacy.admin.consents.all')}</option>
          {(data?.types ?? []).map((k) => (
            <option key={k} value={k}>
              {labels.type(k)}
            </option>
          ))}
        </select>
        <select aria-label={t('legalDocs.consents.version')} className="input" value={version} onChange={(e) => setVersion(e.target.value)}>
          <option value="">{t('legalDocs.consents.allVersions')}</option>
          {(data?.versions ?? []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select aria-label={t('legalDocs.consents.source')} className="input" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">{t('legalDocs.consents.allSources')}</option>
          {(data?.sources ?? []).map((s) => (
            <option key={s} value={s}>
              {labels.source(s)}
            </option>
          ))}
        </select>
        <input type="date" aria-label={t('privacy.admin.consents.from')} className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" aria-label={t('privacy.admin.consents.to')} className="input" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : !data?.items.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={ListChecks} title={t('privacy.admin.consents.empty')} />
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">{t('privacy.admin.consents.total', { count: data.total })}</p>
            <div className="flex gap-2">
              <a href={exportUrl('csv')} download className="btn-white btn-sm min-h-10 border border-line">
                <Download className="size-4" aria-hidden /> {t('privacy.admin.consents.csv')}
              </a>
              <a href={exportUrl('download')} download className="btn-white btn-sm min-h-10 border border-line">
                <Download className="size-4" aria-hidden /> {t('legalDocs.consents.json')}
              </a>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-line bg-card">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  {(['date', 'person', 'type', 'value', 'source', 'version', 'ip'] as const).map((c) => (
                    <th key={c} className="px-3 py-2.5 font-medium">
                      {t(`privacy.admin.consents.col.${c}`)}
                    </th>
                  ))}
                  <th className="w-10 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((r) => {
                  const p = personOf(r);
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-muted tabular-nums">{fmtDateTime(r.createdAt)}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium break-all text-ink">{r.user?.email ?? r.email ?? (r.visitorId ? t('legalDocs.consents.visitor') : '—')}</p>
                        {r.user && <p className="text-xs text-muted">{fullName(r.user)}</p>}
                        {!r.user && r.visitorId && <p className="font-mono text-[11px] text-muted">{r.visitorId}</p>}
                      </td>
                      <td className="px-3 py-2 text-ink">{labels.type(r.type)}</td>
                      <td className="px-3 py-2">
                        <span className={clsx('text-xs font-bold', r.granted ? 'text-success-fg' : 'text-warning-fg')}>{r.granted ? t('privacy.admin.consents.yes') : t('privacy.admin.consents.no')}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">{labels.source(r.source)}</td>
                      <td className="px-3 py-2 text-xs text-muted">
                        <VersionCell row={r} documents={data.documents} />
                      </td>
                      <td className="px-3 py-2 text-xs text-muted" title={r.userAgent ?? undefined}>
                        {r.ip ?? '—'}
                      </td>
                      <td className="px-2 py-2">
                        {p && (
                          <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" onClick={() => setPerson(p)} aria-label={t('legalDocs.consents.timeline')} title={t('legalDocs.consents.timeline')}>
                            <History className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Timeline person={person} onClose={() => setPerson(null)} />
    </>
  );
};
