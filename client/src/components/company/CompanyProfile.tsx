import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Building2, Image as ImageIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { toastJobsError, useJobLabels } from '@/components/jobs/labels';
import { SECTORS, type Company } from '@/components/jobs/types';
import { EmailOtpCard } from '@/components/auth/EmailOtpCard';
import { Section } from './shared';
import { CompanyLogoUploader } from '@/components/jobs/CompanyLogoUploader';
import { EmployerReportPrefs } from './CompanyReports';
import { CompanyTeam } from './CompanyTeam';
import { ChangeEmailCard, ChangePasswordCard } from '@/components/account/AccountSecurity';

const FIELDS = ['name', 'legalForm', 'city', 'phone', 'address', 'vatId', 'website', 'contactName'] as const;
type Field = (typeof FIELDS)[number];

export const CompanyProfile = ({ company }: { company: Company }) => {
  const { t } = useTranslation();
  const L = useJobLabels();
  const qc = useQueryClient();
  const [f, setF] = useState(() => ({
    ...Object.fromEntries(FIELDS.map((k) => [k, company[k] ?? ''])),
    sector: company.sector ?? 'other',
  }) as Record<Field, string> & { sector: string });
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch<{ company: Company }>('/company/me', {
          name: f.name.trim(),
          legalForm: f.legalForm.trim() || null,
          sector: f.sector,
          city: f.city.trim(),
          phone: f.phone.trim(),
          address: f.address.trim() || null,
          vatId: f.vatId.trim() || null,
          website: f.website.trim() || null,
          contactName: f.contactName.trim() || null,
        })
      ).data.company,
    onSuccess: (c) => {
      qc.setQueryData(['company-me'], c);
      toast.success(t('jobsArea.portal.profile.saved'));
    },
    onError: toastJobsError,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const input = (k: Field, opts: { required?: boolean; type?: string; span?: boolean; max?: number } = {}) => (
    <div className={opts.span ? 'sm:col-span-2' : undefined}>
      <label className="label" htmlFor={`cp-${k}`}>
        {t(`jobsArea.register.${k === 'name' ? 'companyName' : k}`)}
      </label>
      <input
        id={`cp-${k}`}
        className="input"
        type={opts.type ?? 'text'}
        required={opts.required}
        maxLength={opts.max ?? 160}
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <Section title={t('jobsArea.portal.profile.title')} icon={Building2}>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {input('name', { required: true, span: true })}
          {input('legalForm', { max: 40 })}
          <div>
            <label className="label" htmlFor="cp-sector">
              {t('jobsArea.register.sector')}
            </label>
            <select id="cp-sector" className="input" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })}>
              {SECTORS.map((s) => (
                <option key={s} value={s}>
                  {L.sector(s)}
                </option>
              ))}
            </select>
          </div>
          {input('city', { required: true, max: 80 })}
          {input('phone', { required: true, type: 'tel', max: 40 })}
          {input('address', { span: true, max: 300 })}
          {input('vatId', { max: 40 })}
          {input('website', { max: 300 })}
          {input('contactName', { span: true, max: 120 })}
          <div className="flex justify-end sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {save.isPending && <Spinner className="size-4" />} {t('jobsArea.common.save')}
            </button>
          </div>
        </form>
      </Section>
      {/* Logo on the public job ads (no review step: live at once, staff notified — server routes/company.ts). */}
      <Section title={t('publicImages.companyLogo.title')} icon={ImageIcon}>
        <CompanyLogoUploader
          endpoint="/company/me/logo"
          logo={company.logo}
          name={company.name}
          note={t('publicImages.companyLogo.employerNote')}
          onChange={(logo) => qc.setQueryData(['company-me'], (old: Company | undefined) => (old ? { ...old, logo } : old))}
        />
      </Section>
      {/* Colleagues with their own logins (owner invites / deactivates). */}
      <CompanyTeam />
      {/* Account security of the employer login: password, e-mail change, optional two-step login by email. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChangePasswordCard />
        <ChangeEmailCard />
      </div>
      <EmailOtpCard />
      {/* Monthly PDF report about the company's workers by e-mail (opt-out per portal user). */}
      <EmployerReportPrefs />
    </div>
  );
};
