import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AtSign, Building, MapPin, Plus, Save, Share2, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { L10n, Office, SiteSettings } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { L10nInput, emptyL10n, fillFromAz } from '@/components/admin/L10nInput';
import { toastError } from '@/components/admin/labels';
import { ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';

type Contact = NonNullable<SiteSettings['contact']>;

const emptyContact = (): Contact => ({ phone: '', whatsapp: '', email: '', hours: emptyL10n(), offices: [] });
const emptyOffice = (): Office => ({ city: emptyL10n(), address: '', lat: 40.4093, lng: 49.8671 });

const DEFAULT_SOCIAL = ['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'telegram'];
/** Brand names, not translated. */
const SOCIAL_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  telegram: 'Telegram',
};

const normalizeL10n = (v: unknown): L10n => {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Partial<Record<keyof L10n, unknown>>;
  const s = (x: unknown) => (typeof x === 'string' ? x : '');
  return { az: s(o.az), de: s(o.de), en: s(o.en), ru: s(o.ru) };
};

const normalizeContact = (c: SiteSettings['contact']): Contact => ({
  phone: c?.phone ?? '',
  whatsapp: c?.whatsapp ?? '',
  email: c?.email ?? '',
  hours: normalizeL10n(c?.hours),
  offices: (c?.offices ?? []).map((o) => ({
    city: normalizeL10n(o.city),
    address: o.address ?? '',
    lat: Number(o.lat) || 0,
    lng: Number(o.lng) || 0,
  })),
});

const useSaveSetting = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const save = async (key: 'contact' | 'social', value: unknown) => {
    setBusy(true);
    try {
      await api.put(`/admin/settings/${key}`, { value });
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin-settings'] }), qc.invalidateQueries({ queryKey: ['content'] })]);
      toast.success(t('admin.settings.saved'));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  return { save, busy };
};

const ContactForm = ({ initial }: { initial: Contact }) => {
  const { t } = useTranslation();
  const [c, setC] = useState<Contact>(initial);
  const { save, busy } = useSaveSetting();
  useEffect(() => setC(initial), [initial]);

  const setOffice = (i: number, patch: Partial<Office>) => setC({ ...c, offices: c.offices.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  const submit = () => {
    if (c.email && !/\S+@\S+\.\S+/.test(c.email)) {
      toast.error(t('admin.settings.invalidEmail'));
      return;
    }
    if (c.offices.some((o) => !o.city.az.trim() || !o.address.trim())) {
      toast.error(t('admin.settings.officeRequired'));
      return;
    }
    void save('contact', {
      phone: c.phone.trim(),
      whatsapp: c.whatsapp.trim(),
      email: c.email.trim(),
      hours: fillFromAz(c.hours),
      offices: c.offices.map((o) => ({ city: fillFromAz(o.city), address: o.address.trim(), lat: Number(o.lat), lng: Number(o.lng) })),
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Panel
        title={t('admin.settings.contactTitle')}
        icon={AtSign}
        actions={
          <button type="submit" className="btn-primary btn-sm" disabled={busy}>
            {busy ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />} {t('admin.common.save')}
          </button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="st-phone" className="label">
              {t('admin.settings.phone')}
            </label>
            <input id="st-phone" type="tel" className="input" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} placeholder="+994 …" />
          </div>
          <div>
            <label htmlFor="st-wa" className="label">
              {t('admin.settings.whatsapp')}
            </label>
            <input id="st-wa" type="tel" className="input" value={c.whatsapp} onChange={(e) => setC({ ...c, whatsapp: e.target.value })} placeholder="+994 …" />
          </div>
          <div>
            <label htmlFor="st-email" className="label">
              {t('admin.settings.email')}
            </label>
            <input id="st-email" type="email" className="input" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
          </div>
          <div className="sm:col-span-3">
            <L10nInput label={t('admin.settings.hours')} value={c.hours} onChange={(hours) => setC({ ...c, hours })} hint={t('admin.settings.hoursHint')} />
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-sans text-sm font-semibold text-navy-900">
              <Building className="size-4 text-brand-600" aria-hidden /> {t('admin.settings.offices')}
            </h3>
            <button type="button" className="btn-white btn-sm border border-line" onClick={() => setC({ ...c, offices: [...c.offices, emptyOffice()] })}>
              <Plus className="size-3.5" /> {t('admin.settings.addOffice')}
            </button>
          </div>
          {c.offices.length === 0 && <p className="text-sm text-muted">{t('admin.settings.noOffices')}</p>}
          <ul className="space-y-3">
            {c.offices.map((o, i) => (
              <li key={i} className="rounded-xl border border-line bg-surface/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted">{t('admin.settings.officeN', { n: i + 1 })}</span>
                  <div className="flex items-center gap-1">
                    {o.lat !== 0 && o.lng !== 0 && (
                      <a
                        href={`https://www.google.com/maps?q=${o.lat},${o.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap text-brand-600 hover:bg-brand-50 lg:min-h-8"
                      >
                        <MapPin className="size-3.5" /> {t('admin.settings.checkMap')}
                      </a>
                    )}
                    <button
                      type="button"
                      className="grid size-10 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-danger lg:size-8"
                      onClick={() => setC({ ...c, offices: c.offices.filter((_, j) => j !== i) })}
                      aria-label={t('admin.settings.deleteOffice', { n: i + 1 })}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <L10nInput label={t('admin.settings.city')} value={o.city} onChange={(city) => setOffice(i, { city })} required />
                  <div>
                    <label htmlFor={`of-addr-${i}`} className="label">
                      {t('admin.settings.address')}
                    </label>
                    <input id={`of-addr-${i}`} className="input" value={o.address} onChange={(e) => setOffice(i, { address: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor={`of-lat-${i}`} className="label">
                      {t('admin.settings.lat')}
                    </label>
                    <input
                      id={`of-lat-${i}`}
                      type="number"
                      step="any"
                      className="input tabular-nums"
                      value={o.lat}
                      onChange={(e) => setOffice(i, { lat: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label htmlFor={`of-lng-${i}`} className="label">
                      {t('admin.settings.lng')}
                    </label>
                    <input
                      id={`of-lng-${i}`}
                      type="number"
                      step="any"
                      className="input tabular-nums"
                      value={o.lng}
                      onChange={(e) => setOffice(i, { lng: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </form>
  );
};

const SocialForm = ({ initial }: { initial: Record<string, string> }) => {
  const { t } = useTranslation();
  const toRows = (v: Record<string, string>) => {
    const keys = [...DEFAULT_SOCIAL, ...Object.keys(v).filter((k) => !DEFAULT_SOCIAL.includes(k))];
    return keys.map((k) => ({ key: k, url: v[k] ?? '' }));
  };
  const [rows, setRows] = useState(() => toRows(initial));
  const [newKey, setNewKey] = useState('');
  const { save, busy } = useSaveSetting();
  useEffect(() => setRows(toRows(initial)), [initial]);

  const submit = () => {
    const bad = rows.find((r) => r.url.trim() && !/^https?:\/\//i.test(r.url.trim()));
    if (bad) {
      toast.error(t('admin.settings.socialInvalid', { name: SOCIAL_LABEL[bad.key] ?? bad.key }));
      return;
    }
    const value: Record<string, string> = {};
    for (const r of rows) if (r.url.trim()) value[r.key] = r.url.trim();
    void save('social', value);
  };

  const addKey = () => {
    const k = newKey.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!k || rows.some((r) => r.key === k)) return;
    setRows([...rows, { key: k, url: '' }]);
    setNewKey('');
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Panel
        title={t('admin.settings.socialTitle')}
        icon={Share2}
        actions={
          <button type="submit" className="btn-primary btn-sm" disabled={busy}>
            {busy ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />} {t('admin.common.save')}
          </button>
        }
      >
        <p className="mb-3 text-xs text-muted">{t('admin.settings.socialHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((r, i) => (
            <div key={r.key}>
              <label htmlFor={`so-${r.key}`} className="label">
                {SOCIAL_LABEL[r.key] ?? r.key}
              </label>
              <div className="flex gap-1.5">
                <input
                  id={`so-${r.key}`}
                  type="url"
                  className="input"
                  placeholder="https://"
                  value={r.url}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                />
                {!DEFAULT_SOCIAL.includes(r.key) && (
                  <button
                    type="button"
                    className="rounded-md px-2 text-muted hover:bg-red-50 hover:text-danger"
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    aria-label={t('admin.settings.deleteNetwork', { name: r.key })}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex max-w-sm gap-2">
          <label htmlFor="so-new" className="sr-only">
            {t('admin.settings.newNetwork')}
          </label>
          <input
            id="so-new"
            className="input"
            placeholder={t('admin.settings.newNetworkPlaceholder')}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addKey();
              }
            }}
          />
          <button type="button" className="btn-white btn-sm shrink-0 border border-line whitespace-nowrap" onClick={addKey} disabled={!newKey.trim()}>
            <Plus className="size-3.5" /> {t('admin.common.add')}
          </button>
        </div>
      </Panel>
    </form>
  );
};

export default function Settings() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => (await api.get<{ settings: SiteSettings }>('/admin/settings')).data.settings,
  });

  const [contact, setContact] = useState<Contact>(emptyContact);
  const [social, setSocial] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!data) return;
    setContact(normalizeContact(data.contact));
    const s: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.social ?? {})) if (typeof v === 'string') s[k] = v;
    setSocial(s);
  }, [data]);

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHead title={t('admin.nav.settings')} subtitle={t('admin.settings.subtitle')} />
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <ContactForm initial={contact} />
          <SocialForm initial={social} />
        </>
      )}
    </div>
  );
}
