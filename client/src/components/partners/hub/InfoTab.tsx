import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Building2, Globe, Landmark, Lock, MapPin, MessageCircle, Pencil, Phone, Scale, SlidersHorizontal, StickyNote, Tag, UserRound } from 'lucide-react';
import { fmtDate } from '@/components/admin/labels';
import { money } from '@/components/agents/format';
import { SensitiveValue } from '@/components/privacyTools/SensitiveValue';
import { usePartnerFields, type Partner } from '../api';
import type { PartnerOwnershipFields } from '../Ownership';
import { ReadinessMeter } from './parts';
import { isGermany } from './types';

/** "Məlumat" tab: every profile field (empty ones as "—"), admin-defined fields, extra fields, terms and note. */

const waLink = (n: string) => `https://wa.me/${n.replace(/[^\d]/g, '')}`;

const Card = ({ title, icon: Icon, children, className }: { title: string; icon: typeof Phone; children: ReactNode; className?: string }) => (
  <section className={clsx('min-w-0 rounded-xl border border-line bg-card p-4', className)}>
    <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
      <Icon className="size-4 text-link" aria-hidden /> {title}
    </h3>
    <dl className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">{children}</dl>
  </section>
);

const Row = ({ label, value, wide, missing }: { label: string; value: ReactNode; wide?: boolean; missing?: boolean }) => {
  const empty = value == null || value === '' || value === false;
  return (
    <div className={clsx('min-w-0', wide && 'sm:col-span-2')}>
      <dt className="flex items-center gap-1 text-[11px] font-medium text-muted">
        {label}
        {missing && empty && <span className="size-1.5 rounded-full bg-warning" aria-hidden />}
      </dt>
      <dd className={clsx('mt-0.5 text-sm break-words', empty ? 'text-muted' : 'text-ink')}>{empty ? '—' : value}</dd>
    </div>
  );
};

export const InfoTab = ({ partner: p, canEdit, onEdit }: { partner: Partner & PartnerOwnershipFields; canEdit: boolean; onEdit: () => void }) => {
  const { t } = useTranslation();
  const defs = usePartnerFields();
  const missing = new Set(p.readiness?.missing ?? []);
  const m = (k: string) => missing.has(k);
  const company = p.partnerType === 'COMPANY';
  const custom = p.customData ?? {};
  const tags = p.tags ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4 sm:flex-row sm:items-center">
        <ReadinessMeter readiness={p.readiness} className="flex-1" onFill={canEdit ? onEdit : undefined} />
        {canEdit && (
          <button type="button" className="btn-secondary btn-sm shrink-0 self-start sm:self-center" onClick={onEdit}>
            <Pencil className="size-3.5" aria-hidden /> {t('partnerHub.info.edit')}
          </button>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t('partnerHub.info.general')} icon={company ? Building2 : UserRound}>
          <Row label={t('partnerForm.f.name')} value={p.name} missing={m('name')} />
          <Row label={t('partnerForm.f.partnerType')} value={t(`partnerForm.f.types.${p.partnerType ?? 'INDIVIDUAL'}`)} />
          {company && <Row label={t('partnerForm.f.companyName')} value={p.companyName} missing={m('companyName')} />}
          <Row label={t('partnerForm.f.contactPerson')} value={p.contactPerson} />
          <Row label={t('partnerForm.f.language')} value={p.preferredLanguage && t(`partnerForm.f.languages.${p.preferredLanguage}`)} />
          <Row label={t('partnerHub.info.created')} value={fmtDate(p.createdAt)} />
        </Card>

        <Card title={t('partnerHub.info.contact')} icon={Phone}>
          <Row label={t('partnerForm.f.phone')} value={p.phone && <a href={`tel:${p.phone}`} className="hover:text-link">{p.phone}</a>} missing={m('phone')} />
          <Row label={t('partnerForm.f.phone2')} value={p.phone2 && <a href={`tel:${p.phone2}`} className="hover:text-link">{p.phone2}</a>} />
          <Row
            label={t('partnerForm.f.whatsapp')}
            value={
              p.whatsapp && (
                <a href={waLink(p.whatsapp)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-link">
                  <MessageCircle className="size-3.5" aria-hidden /> {p.whatsapp}
                </a>
              )
            }
          />
          <Row label={t('partnerForm.f.email')} value={p.email && <a href={`mailto:${p.email}`} className="break-all hover:text-link">{p.email}</a>} missing={m('email')} />
          <Row
            wide
            label={t('partnerForm.f.website')}
            value={
              p.website &&
              /^https?:\/\//i.test(p.website) && (
                <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-link hover:underline">
                  <Globe className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{p.website.replace(/^https?:\/\//i, '')}</span>
                </a>
              )
            }
          />
        </Card>

        <Card title={t('partnerHub.info.address')} icon={MapPin}>
          <Row wide label={t('partnerForm.f.street')} value={p.street} missing={m('street')} />
          <Row label={t('partnerForm.f.postalCode')} value={p.postalCode} missing={m('postalCode')} />
          <Row label={t('partnerForm.f.city')} value={p.city} missing={m('city')} />
          <Row label={t('partnerForm.f.country')} value={p.country} missing={m('country')} />
          <Row label={t('partnerForm.f.address')} value={p.address} />
        </Card>

        <Card title={t('partnerHub.info.legal')} icon={Scale}>
          <Row
            label={company ? t('partnerForm.f.taxIdCompany') : t('partnerForm.f.taxIdIndividual')}
            value={p.taxId && <SensitiveValue value={p.taxId} entity="partner" id={p.id} field="taxId" className="font-mono" />}
            missing={m('taxId')}
          />
          {company && (
            <>
              <Row label={t('partnerForm.f.legalForm')} value={p.legalForm} missing={m('legalForm')} />
              <Row label={t('partnerForm.f.registerNumber')} value={p.registerNumber} missing={m('registerNumber')} />
              <Row label={t('partnerForm.f.registerCourt')} value={p.registerCourt} missing={m('registerCourt')} />
              <Row label={t('partnerForm.f.vatId')} value={p.vatId && <SensitiveValue value={p.vatId} entity="partner" id={p.id} field="vatId" className="font-mono" />} />
              {(isGermany(p.country) || p.betriebsnummer) && <Row label={t('partnerForm.f.betriebsnummer')} value={p.betriebsnummer && <span className="font-mono">{p.betriebsnummer}</span>} />}
              <Row label={t('partnerForm.f.signatoryName')} value={p.signatoryName} missing={m('signatoryName')} />
              <Row label={t('partnerForm.f.signatoryRole')} value={p.signatoryRole} missing={m('signatoryRole')} />
            </>
          )}
        </Card>

        <Card title={t('partnerHub.info.bank')} icon={Landmark}>
          {p.bankLocked ? (
            <div className="sm:col-span-2">
              <p className="inline-flex items-center gap-1.5 text-sm text-muted">
                <Lock className="size-3.5" aria-hidden /> {t('partnerForm.bankLocked')}
              </p>
              {p.iban && <p className="mt-1 font-mono text-sm text-ink">{p.iban}</p>}
            </div>
          ) : (
            <>
              <Row label={t('partnerForm.f.bankName')} value={p.bankName} />
              <Row label={t('partnerForm.f.bankAccountHolder')} value={p.bankAccountHolder} />
              <Row label={t('partnerForm.f.iban')} value={p.iban && <SensitiveValue value={p.iban} entity="partner" id={p.id} field="iban" className="font-mono" />} />
              <Row label={t('partnerForm.f.bic')} value={p.bic && <SensitiveValue value={p.bic} entity="partner" id={p.id} field="bic" className="font-mono" />} />
            </>
          )}
        </Card>

        <Card title={t('partnerHub.info.terms')} icon={Landmark}>
          <Row label={t('partnerHub.info.perClient')} value={p.commissionCents != null && money(p.commissionCents, p.currency ?? 'EUR')} />
          <Row label={t('partnerHub.info.trigger')} value={p.commissionTrigger && t(`partnerHub.info.triggers.${p.commissionTrigger}`)} />
          <Row label={t('partnerForm.f.currency')} value={p.currency} />
          <Row label={t('partnerHub.portal.visibility')} value={p.visibility && t(`partnerHub.portal.visibilities.${p.visibility}`)} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t('partnerHub.info.custom')} icon={SlidersHorizontal}>
          {(defs.data ?? []).length === 0 ? (
            <p className="text-sm text-muted sm:col-span-2">{t('partnerForm.custom.noFields')}</p>
          ) : (
            (defs.data ?? []).map((d) => {
              const v = custom[d.id];
              return (
                <Row
                  key={d.id}
                  wide={d.type === 'LONG_TEXT'}
                  label={d.label}
                  value={v === undefined ? null : typeof v === 'boolean' ? (v ? t('partnerForm.custom.yes') : null) : d.type === 'DATE' ? fmtDate(String(v)) : <span className="whitespace-pre-line">{String(v)}</span>}
                />
              );
            })
          )}
        </Card>
        <Card title={t('partnerHub.info.extra')} icon={Tag}>
          {(p.extraFields ?? []).length === 0 && !tags.length ? (
            <p className="text-sm text-muted sm:col-span-2">—</p>
          ) : (
            <>
              {tags.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-[11px] font-medium text-muted">{t('partnerHub.info.tags')}</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span key={tag} className="rounded-md bg-sunken px-2 py-0.5 text-xs font-medium text-ink">
                        {tag}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {(p.extraFields ?? []).map((f, i) => (
                <Row key={`${i}-${f.label}`} label={f.label} value={f.value} />
              ))}
            </>
          )}
        </Card>
      </div>

      {p.note && (
        <section className="rounded-xl border border-line bg-sunken/60 p-4">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
            <StickyNote className="size-4 text-link" aria-hidden /> {t('partnerHub.info.note')}
          </h3>
          <p className="text-sm whitespace-pre-line text-ink/80">{p.note}</p>
        </section>
      )}
    </div>
  );
};
