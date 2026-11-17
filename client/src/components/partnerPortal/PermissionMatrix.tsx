import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { ClientListLevel, DocumentLevel, DriveLevel, PartnerPerms } from './api';

/**
 * Editor of a partner permission set (shared by the partner's Team page and Access Center › Partners). `max` (the
 * partner's own set) disables every option above it, so a team member can never be given more than the partner.
 * Server rules: lib/partnerAccess/permissions.ts.
 */

const CLIENT_LIST: ClientListLevel[] = ['none', 'masked', 'full'];
const DOCUMENTS: DocumentLevel[] = ['none', 'status', 'list', 'upload', 'download'];
const DRIVE: DriveLevel[] = ['none', 'view', 'upload'];
const FLAGS = ['caseStage', 'payments', 'addClients', 'messaging', 'vacancies'] as const;

export const PERM_ORDER: (keyof PartnerPerms)[] = ['clientList', 'caseStage', 'documents', 'payments', 'addClients', 'messaging', 'vacancies', 'drive'];

const allowed = <T extends string>(levels: T[], v: T, max?: T) => !max || levels.indexOf(v) <= levels.indexOf(max);

/** Lowest of each key (member ∩ partner), like the server. */
export const capPerms = (perms: PartnerPerms, max: PartnerPerms): PartnerPerms => ({
  clientList: CLIENT_LIST.indexOf(perms.clientList) <= CLIENT_LIST.indexOf(max.clientList) ? perms.clientList : max.clientList,
  caseStage: perms.caseStage && max.caseStage,
  documents: DOCUMENTS.indexOf(perms.documents) <= DOCUMENTS.indexOf(max.documents) ? perms.documents : max.documents,
  payments: perms.payments && max.payments,
  addClients: perms.addClients && max.addClients,
  messaging: perms.messaging && max.messaging,
  vacancies: perms.vacancies && max.vacancies,
  drive: DRIVE.indexOf(perms.drive) <= DRIVE.indexOf(max.drive) ? perms.drive : max.drive,
});

/** One-line summary ("Gizlədilmiş · Yalnız status · …") for lists. */
export const usePermSummary = () => {
  const { t } = useTranslation();
  return (p: PartnerPerms) =>
    [
      `${t('partnerAccess.perm.clientList')}: ${t(`partnerAccess.level.clientList.${p.clientList}`)}`,
      `${t('partnerAccess.perm.documents')}: ${t(`partnerAccess.level.documents.${p.documents}`)}`,
      `${t('partnerAccess.perm.drive')}: ${t(`partnerAccess.level.drive.${p.drive}`)}`,
      ...FLAGS.filter((f) => p[f]).map((f) => t(`partnerAccess.perm.${f}`)),
    ].join(' · ');
};

const Segmented = <T extends string>({ name, levels, value, max, label, onChange, disabled }: { name: string; levels: T[]; value: T; max?: T; label: (v: T) => string; onChange: (v: T) => void; disabled?: boolean }) => (
  <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1.5">
    {levels.map((v) => {
      const ok = allowed(levels, v, max);
      return (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          disabled={disabled || !ok}
          onClick={() => onChange(v)}
          className={clsx(
            'min-h-10 rounded-full border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            value === v ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-muted hover:border-line-strong hover:text-ink',
          )}
        >
          {label(v)}
        </button>
      );
    })}
  </div>
);

export function PermissionMatrix({ value, onChange, max, disabled, idPrefix }: { value: PartnerPerms; onChange: (p: PartnerPerms) => void; max?: PartnerPerms; disabled?: boolean; idPrefix: string }) {
  const { t } = useTranslation();
  const set = <K extends keyof PartnerPerms>(k: K, v: PartnerPerms[K]) => onChange({ ...value, [k]: v });
  return (
    <ul className="divide-y divide-line">
      {PERM_ORDER.map((k) => (
        <li key={k} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-start sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink" id={`${idPrefix}-${k}`}>
              {t(`partnerAccess.perm.${k}`)}
            </p>
            <p className="text-xs text-muted">{t(`partnerAccess.permHint.${k}`)}</p>
          </div>
          <div>
            {k === 'clientList' ? (
              <Segmented name={t('partnerAccess.perm.clientList')} levels={CLIENT_LIST} value={value.clientList} max={max?.clientList} disabled={disabled} label={(v) => t(`partnerAccess.level.clientList.${v}`)} onChange={(v) => set('clientList', v)} />
            ) : k === 'documents' ? (
              <>
                <Segmented name={t('partnerAccess.perm.documents')} levels={DOCUMENTS} value={value.documents} max={max?.documents} disabled={disabled} label={(v) => t(`partnerAccess.level.documents.${v}`)} onChange={(v) => set('documents', v)} />
                {value.documents !== 'none' && <p className="mt-1.5 text-xs text-muted">{t(`partnerAccess.levelHint.${value.documents}`)}</p>}
              </>
            ) : k === 'drive' ? (
              <Segmented name={t('partnerAccess.perm.drive')} levels={DRIVE} value={value.drive} max={max?.drive} disabled={disabled} label={(v) => t(`partnerAccess.level.drive.${v}`)} onChange={(v) => set('drive', v)} />
            ) : (
              <Segmented<'off' | 'on'>
                name={t(`partnerAccess.perm.${k}`)}
                levels={['off', 'on']}
                value={value[k] ? 'on' : 'off'}
                max={max ? (max[k] ? 'on' : 'off') : undefined}
                disabled={disabled}
                label={(v) => t(`partnerAccess.level.${v}`)}
                onChange={(v) => set(k, v === 'on')}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
