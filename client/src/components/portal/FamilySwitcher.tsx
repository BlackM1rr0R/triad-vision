import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { setChosenCase, useChosenCase, withCaseParam } from '@/lib/caseContext';
import { Avatar } from '@/components/ui/Avatar';
import { registerCopy } from '@/i18n';
import { pagesClientPlus } from '@/i18n/pagesClientPlus';
import type { CaseStatus } from '@/lib/types';

registerCopy(pagesClientPlus);

/** GET /api/account/plus/family (server: lib/clientPlus/portal.ts familyCases). */
export interface SwitchCase {
  id: string;
  number: string;
  status: CaseStatus;
  kind: 'self' | 'spouse' | 'child' | 'parent' | 'other';
  firstName: string | null;
  parentCaseId: string | null;
  isDefault: boolean;
}

export const FAMILY_KEY = ['account-plus-family'] as const;

export const useFamilyCases = (enabled = true) =>
  useQuery({
    queryKey: FAMILY_KEY,
    queryFn: async () => (await api.get<{ cases: SwitchCase[] }>('/account/plus/family')).data.cases,
    staleTime: 5 * 60_000,
    enabled,
  });

export const switchLabel = (t: TFunction, c: Pick<SwitchCase, 'kind' | 'firstName'>) => {
  const name = c.firstName?.trim();
  switch (c.kind) {
    case 'self':
      return t('cplus.family.me');
    case 'spouse':
      return name ? `${t('cplus.family.spouse')} · ${name}` : t('cplus.family.spouse');
    case 'child':
      return name ? t('cplus.family.child', { name }) : t('cplus.family.childNoName');
    case 'parent':
      return name ? t('cplus.family.parent', { name }) : t('cplus.family.parentNoName');
    default:
      return name ? t('cplus.family.other', { name }) : t('cplus.family.otherNoName');
  }
};

const CASE_PAGE = /^\/account\/cases\/([^/]+)\/?$/;

/**
 * Family switcher at the top of the client portal: avatar chips ("Mən", "Həyat yoldaşım", "Uşaq: Aylin") for a
 * client whose account holds family-member cases. The choice is the portal's current case (lib/caseContext):
 * documents, next step, messages and the case links follow it without a new login; it is remembered per user and
 * kept in the URL as ?case=<id> (deep links). Opening a case page or a ?case= link selects that case. Only the
 * client's own cases are listed (the server checks Case.clientId). Renders nothing for a single case.
 */
export const FamilySwitcher = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const isClient = user?.role === 'CLIENT';
  const { data: cases } = useFamilyCases(isClient);
  const chosen = useChosenCase(user?.id);
  const liveRef = useRef<HTMLSpanElement>(null);
  const chosenRef = useRef(chosen);
  chosenRef.current = chosen;

  // Deep links: ?case=<id> or a case page select that case (own cases only). Runs on URL changes only, so a
  // switch (store first, URL right after) never bounces back to the old case.
  useEffect(() => {
    if (!user || !cases?.length) return;
    const own = (id: string | null | undefined) => (id && cases.some((c) => c.id === id) ? id : null);
    const fromParam = own(new URLSearchParams(search).get('case'));
    const fromPage = own(CASE_PAGE.exec(pathname)?.[1]);
    const next = fromParam ?? fromPage;
    const current = chosenRef.current;
    if (next && next !== current) setChosenCase(user.id, next);
    // A remembered case that is no longer the client's (deleted / merged) is forgotten.
    if (!next && current && !own(current)) setChosenCase(user.id, null);
  }, [user, cases, pathname, search]);

  if (!isClient || !cases || cases.length < 2) return null;
  const active = (chosen && cases.find((c) => c.id === chosen)) || cases.find((c) => c.isDefault) || cases[0];

  const pick = (c: SwitchCase) => {
    if (!user || c.id === active.id) return;
    setChosenCase(user.id, c.id);
    if (liveRef.current) liveRef.current.textContent = t('cplus.family.switched', { name: labelOf(c) });
    const m = CASE_PAGE.exec(pathname);
    if (m) {
      // Same tab of the other person's case.
      navigate(withCaseParam(`/account/cases/${c.id}${search}${hash}`, null), { replace: true });
    } else {
      navigate(withCaseParam(`${pathname}${search}${hash}`, c.id), { replace: true });
    }
  };

  const selfName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
  // Two chips with the same label (e.g. two own applications, both "Mən") get the case number.
  const labelOf = (c: SwitchCase) => {
    const base = switchLabel(t, c);
    return cases.filter((x) => switchLabel(t, x) === base).length > 1 ? `${base} · ${c.number}` : base;
  };
  return (
    <div className={clsx('flex flex-wrap items-center gap-2', className)}>
      <div role="group" aria-label={t('cplus.family.label')} className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cases.map((c) => {
          const on = c.id === active.id;
          const label = labelOf(c);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => pick(c)}
              className={clsx(
                'flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 text-sm font-semibold whitespace-nowrap transition-colors',
                on ? 'border-primary bg-primary/[0.07] text-ink' : 'border-line bg-card text-muted hover:bg-sunken hover:text-ink',
              )}
              title={`${label} · ${c.number}`}
            >
              <Avatar name={c.kind === 'self' ? selfName || label : c.firstName || label} size="sm" />
              {label}
            </button>
          );
        })}
      </div>
      <span ref={liveRef} className="sr-only" aria-live="polite" />
    </div>
  );
};

export default FamilySwitcher;
