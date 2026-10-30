import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Building2, Globe, IdCard, Lock, MapPin, MessageCircle, Phone, Tag } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPartnerProfile } from '@/i18n/pagesPartnerProfile';
import { fmtDate } from '@/components/admin/labels';
import { SensitiveValue } from '@/components/privacyTools/SensitiveValue';
import { usePartnerFields, type Partner } from './api';

registerCopy(pagesPartnerProfile);

/** Key profile info of a referral partner: the detail page card and the short line on list cards. */

const today = () => new Date().toISOString().slice(0, 10);
const waLink = (n: string) => `https://wa.me/${n.replace(/[^\d]/g, '')}`;

/** Company · city, country and up to three tags (list cards). */
export const PartnerKeyInfo = ({ partner: p, className }: { partner: Partner; className?: string }) => {
  const place = [p.city, p.country].filter(Boolean).join(', ');
  const tags = p.tags ?? [];
  if (!p.companyName && !place && !tags.length) return null;
  return (
    <div className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted', className)}>
      {p.companyName && (
        <span className="inline-flex min-w-0 items-center gap-1">
          <Building2 className="size-3 shrink-0" aria-hidden /> <span className="truncate">{p.companyName}</span>
        </span>
      )}
      {place && (
        <span className="inline-flex min-w-0 items-center gap-1">
          <MapPin className="size-3 shrink-0" aria-hidden /> <span className="truncate">{place}</span>
        </span>
      )}
      {tags.slice(0, 3).map((tag) => (
        <span key={tag} className="rounded-md bg-sunken px-1.5 py-px text-[11px] font-medium text-ink/80">
          {tag}
        </span>
      ))}
      {tags.length > 3 && <span className="text-[11px]">+{tags.length - 3}</span>}
    </div>
  );
};

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-[11px] font-medium text-muted">{label}</dt>
    <dd className="mt-0.5 text-sm break-words text-ink">{children}</dd>
  </div>
);

/** Profile card of the partner detail page (only filled-in fields are shown). */
export const PartnerProfileCard = ({ partner: p }: { partner: Partner }) => {
  const { t } = useTranslation();
  const defs = usePartnerFields();
  const custom = p.customData ?? {};
  const rows: [string, ReactNode][] = [];
  const add = (label: string, v: ReactNode) => v != null && v !== '' && v !== false && rows.push([label, v]);

  add(t('partnerForm.f.partnerType'), p.partnerType === 'COMPANY' ? t('partnerForm.f.types.COMPANY') : null);
  add(t('partnerForm.f.companyName'), p.companyName);
  add(t('partnerForm.f.contactPerson'), p.contactPerson);
  add(
    t('partnerForm.f.phone2'),
    p.phone2 && (
      <a href={`tel:${p.phone2}`} className="inline-flex items-center gap-1 hover:text-link">
        <Phone className="size-3.5" aria-hidden /> {p.phone2}
      </a>
    ),
  );
  add(
    t('partnerForm.f.whatsapp'),
    p.whatsapp && (
      <a href={waLink(p.whatsapp)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-link">
        <MessageCircle className="size-3.5" aria-hidden /> {p.whatsapp}
      </a>
    ),
  );
  add(
    t('partnerForm.f.website'),
    p.website && /^https?:\/\//i.test(p.website) && (
      <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-link hover:underline">
        <Globe className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{p.website.replace(/^https?:\/\//i, '')}</span>
      </a>
    ),
  );
  const place = [p.address, p.city, p.country].filter(Boolean).join(', ');
  add(t('partnerForm.f.address'), place);
  add(t('partnerForm.f.language'), p.preferredLanguage && t(`partnerForm.f.languages.${p.preferredLanguage}`));
  add(t('partnerForm.f.taxId'), p.taxId && <SensitiveValue value={p.taxId} entity="partner" id={p.id} field="taxId" className="font-mono" />);
  if (p.bankLocked && (p.iban || p.bankName))
    add(
      t('partnerForm.sections.company'),
      <span className="inline-flex items-center gap-1 text-muted">
        <Lock className="size-3.5" aria-hidden /> {t('partnerForm.bankLocked')}
      </span>,
    );
  else {
    add(t('partnerForm.f.bankName'), p.bankName);
    add(t('partnerForm.f.bankAccountHolder'), p.bankAccountHolder);
    add(t('partnerForm.f.iban'), p.iban && <SensitiveValue value={p.iban} entity="partner" id={p.id} field="iban" className="font-mono" />);
    add(t('partnerForm.f.bic'), p.bic && <SensitiveValue value={p.bic} entity="partner" id={p.id} field="bic" className="font-mono" />);
  }
  if (p.contractStart || p.contractEnd) {
    const expired = !!p.contractEnd && p.contractEnd < today();
    add(
      t('partnerForm.sections.contract'),
      <span className={clsx(expired && 'font-semibold text-danger-fg')}>
        {[p.contractStart && fmtDate(p.contractStart), p.contractEnd && fmtDate(p.contractEnd)].filter(Boolean).join(' – ')}
        {expired && ` · ${t('partnerForm.profile.contractExpired', { date: fmtDate(p.contractEnd!) })}`}
      </span>,
    );
  }
  for (const d of defs.data ?? []) {
    const v = custom[d.id];
    if (v === undefined) continue;
    add(d.label, typeof v === 'boolean' ? (v ? t('partnerForm.custom.yes') : null) : d.type === 'DATE' ? fmtDate(String(v)) : String(v));
  }
  for (const f of p.extraFields ?? []) add(f.label, f.value);

  const tags = p.tags ?? [];
  return (
    <section className="rounded-xl border border-line bg-card p-4" aria-labelledby={`partner-profile-${p.id}`}>
      <h2 id={`partner-profile-${p.id}`} className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <IdCard className="size-4 text-link" aria-hidden /> {t('partnerForm.profile.title')}
      </h2>
      {tags.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5" aria-label={t('partnerForm.f.tags')}>
          {tags.map((tag) => (
            <li key={tag} className="inline-flex items-center gap-1 rounded-md bg-sunken px-2 py-0.5 text-xs font-medium text-ink">
              <Tag className="size-3 text-muted" aria-hidden /> {tag}
            </li>
          ))}
        </ul>
      )}
      {rows.length === 0 && !tags.length ? (
        <p className="text-sm text-muted">{t('partnerForm.profile.empty')}</p>
      ) : (
        <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(([label, v], i) => (
            <Row key={`${i}-${label}`} label={label}>
              {v}
            </Row>
          ))}
        </dl>
      )}
    </section>
  );
};
