import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardPen, Search, UserRound, Users, X } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import { Chip } from '@/components/admin/ui';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { fmtDate, fullName } from '@/components/admin/labels';
import { SensitiveValue } from '@/components/privacyTools/SensitiveValue';
import { PROCESSING_STAGES, stageLabel, type ProcessingStage } from '@/components/caseProcessing/api';
import { StageCell } from '@/components/caseProcessing/parts';
import type { PartnerCase } from '../api';
import type { OwnedClient } from '../Ownership';

/** Final case statuses (no longer running). */
const FINAL = new Set(['APPROVED', 'REJECTED', 'CANCELLED']);

/** Visa kinds of the partner's cases with counts (filter chips and the "Viza növləri" tab). */
export const useVisaKinds = (cases: PartnerCase[] | undefined) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  return useMemo(() => {
    const out = new Map<string, { key: string; label: string; sub: string; count: number; active: number; approved: number; refused: number }>();
    for (const c of cases ?? []) {
      const key = c.visaKey ?? (c.visaCategory ? `cat:${c.visaCategory.visaLabel}` : `type:${c.visaType}`);
      const typeLabel = t(`refPartners.types.${c.visaType}`, { defaultValue: c.visaType });
      const label = c.visaCategory ? tr(c.visaCategory.title) : typeLabel;
      const k = out.get(key) ?? { key, label, sub: c.visaCategory ? `${c.visaCategory.visaLabel} · ${typeLabel}` : '', count: 0, active: 0, approved: 0, refused: 0 };
      k.count++;
      if (c.refused) k.refused++;
      else if (c.status === 'APPROVED') k.approved++;
      else if (!FINAL.has(c.status)) k.active++;
      out.set(key, k);
    }
    return [...out.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [cases, tr, t]);
};

/** "Müştərilər / müraciətlər": the partner's cases (visa kind, stage, status, search) and own clients without a case. */
export const ClientsTab = ({ cases: all, ownedClients }: { cases: PartnerCase[]; ownedClients: OwnedClient[] }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const navigate = useNavigate();
  const [visa, setVisa] = useState('');
  const [stage, setStage] = useState<ProcessingStage | ''>('');
  const [q, setQ] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);
  const visaKinds = useVisaKinds(all);
  const stageCounts = useMemo(() => {
    const out = Object.fromEntries(PROCESSING_STAGES.map((s) => [s, 0])) as Record<ProcessingStage, number>;
    for (const c of all) if (c.processing?.stage) out[c.processing.stage]++;
    return out;
  }, [all]);
  const needle = q.trim().toLocaleLowerCase();
  const cases = all.filter(
    (c) =>
      (!visa || c.visaKey === visa) &&
      (!stage || c.processing?.stage === stage) &&
      (!onlyActive || (!FINAL.has(c.status) && !c.refused)) &&
      (!needle || [c.number, fullName(c.client), c.client.phone ?? ''].some((s) => s.toLocaleLowerCase().includes(needle))),
  );
  const filtered = !!visa || !!stage || !!needle || onlyActive;
  const caseClientIds = new Set(all.map((c) => c.client.id));
  const withoutCase = ownedClients.filter((u) => !caseClientIds.has(u.id));

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-card">
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <Users className="size-4 text-link" aria-hidden />
          <h2 className="text-sm font-semibold text-ink">{t('refPartners.clientsTitle', { count: all.length })}</h2>
          {filtered && <span className="text-xs text-muted">{t('refPartners.filteredCount', { shown: cases.length, total: all.length })}</span>}
        </header>
        {all.length > 0 && (
          <div className="space-y-2 border-b border-line px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative flex-1">
                <span className="sr-only">{t('partnerHub.clients.search')}</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <input type="search" className="input pl-9" placeholder={t('partnerHub.clients.search')} value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
              <Chip active={onlyActive} onClick={() => setOnlyActive((v) => !v)}>
                {t('partnerHub.clients.onlyActive')}
              </Chip>
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('refPartners.visa.label')}>
              <span className="pr-1 text-xs font-semibold text-muted">{t('refPartners.visa.label')}</span>
              <Chip active={!visa} onClick={() => setVisa('')} count={all.length}>
                {t('refPartners.visa.all')}
              </Chip>
              {visaKinds.map((v) => (
                <Chip key={v.key} active={visa === v.key} onClick={() => setVisa(visa === v.key ? '' : v.key)} count={v.count}>
                  {v.label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('refPartners.stageFilter')}>
              <span className="inline-flex items-center gap-1 pr-1 text-xs font-semibold text-muted">
                <ClipboardPen className="size-3.5" aria-hidden /> {t('refPartners.stageFilter')}
              </span>
              {PROCESSING_STAGES.map((s) => (
                <Chip key={s} active={stage === s} onClick={() => setStage(stage === s ? '' : s)} count={stageCounts[s]}>
                  <span title={t(`caseProcessing.hints.${s}`)}>{stageLabel(s)}</span>
                </Chip>
              ))}
              {filtered && (
                <button type="button" className="btn-secondary btn-sm ml-auto" onClick={() => (setVisa(''), setStage(''), setQ(''), setOnlyActive(false))}>
                  <X className="size-3.5" aria-hidden /> {t('refPartners.resetFilters')}
                </button>
              )}
            </div>
          </div>
        )}
        {all.length === 0 || cases.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">{all.length ? t('refPartners.notFound') : t('refPartners.clientsEmpty')}</p>
        ) : (
          <>
            {/* Phones: cards */}
            <ul className="divide-y divide-line md:hidden">
              {cases.map((c) => (
                <li key={c.id}>
                  <Link to={`/admin/cases/${c.id}`} className="block px-4 py-3 hover:bg-primary/[0.04]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{fullName(c.client)}</p>
                        <p className="code-id text-xs text-link">{c.number}</p>
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {c.visaCategory ? tr(c.visaCategory.title) : t(`refPartners.types.${c.visaType}`, { defaultValue: c.visaType })} · {fmtDate(c.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="border-b border-line bg-surface/70 text-xs font-medium whitespace-nowrap text-muted">
                  <tr>
                    <th className="px-4 py-2.5">{t('refPartners.th.number')}</th>
                    <th className="px-4 py-2.5">{t('refPartners.th.client')}</th>
                    <th className="px-4 py-2.5">{t('refPartners.th.passport')}</th>
                    <th className="px-4 py-2.5">{t('refPartners.th2.visa')}</th>
                    <th className="px-4 py-2.5">{t('refPartners.th.status')}</th>
                    <th className="px-4 py-2.5">{t('refPartners.th2.stage')}</th>
                    <th className="px-4 py-2.5">{t('refPartners.th2.company')}</th>
                    <th className="px-4 py-2.5">{t('refPartners.th.staff')}</th>
                    <th className="px-4 py-2.5">{t('refPartners.th.created')}</th>
                    <th className="px-4 py-2.5">{t('refPartners.th.decision')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {cases.map((c) => (
                    <tr key={c.id} className="cursor-pointer transition hover:bg-primary/[0.04]" onClick={() => navigate(`/admin/cases/${c.id}`)}>
                      <td className="px-4 py-3 align-top">
                        <Link to={`/admin/cases/${c.id}`} className="code-id text-xs font-medium whitespace-nowrap text-link hover:underline" onClick={(e) => e.stopPropagation()}>
                          {c.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold whitespace-nowrap text-ink">{fullName(c.client)}</p>
                        {c.client.phone && <p className="text-xs text-muted">{c.client.phone}</p>}
                      </td>
                      <td className="code-id px-4 py-3 align-top text-xs text-ink/80" onClick={(e) => e.stopPropagation()}>
                        <SensitiveValue value={c.client.passportNumber} entity="user" id={c.client.id} field="passportNumber" />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-ink">{c.visaCategory ? tr(c.visaCategory.title) : t(`refPartners.types.${c.visaType}`, { defaultValue: c.visaType })}</p>
                        {c.visaCategory && <p className="text-xs text-muted">{`${c.visaCategory.visaLabel} · ${t(`refPartners.types.${c.visaType}`, { defaultValue: c.visaType })}`}</p>}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StatusBadge status={c.status} />
                        {c.refused && c.status !== 'REJECTED' && <p className="mt-1 text-[11px] font-semibold text-danger-fg">{t('refPartners.counts.rejected')}</p>}
                      </td>
                      <td className="px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                        <StageCell p={c.processing} />
                      </td>
                      <td className="max-w-[12rem] truncate px-4 py-3 align-top text-xs text-ink/80">{c.company?.name ?? '—'}</td>
                      <td className="px-4 py-3 align-top whitespace-nowrap text-ink/80">{c.assignedStaff ? fullName(c.assignedStaff) : '—'}</td>
                      <td className="px-4 py-3 align-top text-xs whitespace-nowrap text-muted">{fmtDate(c.createdAt)}</td>
                      <td className="px-4 py-3 align-top text-xs whitespace-nowrap text-muted">{c.decisionAt ? fmtDate(c.decisionAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-line bg-card">
        <header className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <UserRound className="size-4 text-link" aria-hidden /> {t('partnerHub.clients.owned')}
            <span className="code-id text-xs font-medium text-muted">{ownedClients.length}</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted">{t('partnerHub.clients.ownedHint')}</p>
        </header>
        {ownedClients.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted">—</p>
        ) : (
          <ul className="divide-y divide-line">
            {[...withoutCase, ...ownedClients.filter((u) => caseClientIds.has(u.id))].map((u) => {
              const own = all.filter((c) => c.client.id === u.id);
              return (
                <li key={u.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <Link to={`/admin/users?search=${encodeURIComponent(u.email)}`} className="min-w-0 flex-1 truncate font-medium text-ink hover:text-link">
                    {fullName(u)}
                  </Link>
                  <span className="min-w-0 truncate text-xs text-muted sm:w-56">{[u.phone, u.email].filter(Boolean).join(' · ')}</span>
                  <span className="text-xs whitespace-nowrap text-muted sm:w-40">
                    {t('partnerHub.clients.th.since')}: {fmtDate(u.ownerPartnerAt ?? u.createdAt)}
                  </span>
                  <span className="text-xs sm:w-40">
                    {own.length ? (
                      own.map((c) => (
                        <Link key={c.id} to={`/admin/cases/${c.id}`} className="code-id mr-2 text-link hover:underline">
                          {c.number}
                        </Link>
                      ))
                    ) : (
                      <span className="badge bg-sunken text-muted">{t('partnerHub.clients.noCase')}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
