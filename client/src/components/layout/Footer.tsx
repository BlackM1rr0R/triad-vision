import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowUpRight, Mail, MapPin, Phone } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';

const SocialIcon = ({ name }: { name: string }) => {
  const paths: Record<string, string> = {
    instagram: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm5 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm6-1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
    facebook: 'M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v8h4v-8h3l1-4h-4V8Z',
    linkedin: 'M4 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-2 6h4v12H2V9Zm7 0h4v1.7A4.5 4.5 0 0 1 17 9c3 0 5 2 5 6v6h-4v-6c0-1.7-.7-2.7-2.2-2.7S13 13.4 13 15v6H9V9Z',
    tiktok: 'M16 3c.4 2.4 1.9 4 4.5 4.2v3.4a8 8 0 0 1-4.5-1.4V15a6 6 0 1 1-6-6v3.5a2.5 2.5 0 1 0 2.5 2.5V3H16Z',
  };
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d={paths[name] ?? paths.instagram} />
    </svg>
  );
};

export const Footer = () => {
  const { t } = useTranslation();
  const { data } = useSiteContent();
  const { tr } = useL10n();
  const contact = data?.settings.contact;
  const social = data?.settings.social ?? {};

  const company = [
    { to: '/about', label: t('nav.about') },
    { to: '/services', label: t('nav.services') },
    { to: '/partners', label: t('nav.partners') },
    { to: '/stories', label: t('nav.stories') },
    { to: '/news', label: t('nav.news') },
    { to: '/cooperation', label: t('nav.cooperation') },
  ];
  const candidates = [
    { to: '/jobs', label: t('nav.jobs') },
    { to: '/visas', label: t('nav.visas') },
    { to: '/ausbildung', label: t('nav.ausbildung') },
    { to: '/eligibility', label: t('nav.eligibility') },
    { to: '/faq', label: t('nav.faq') },
    { to: '/register', label: t('nav.apply') },
    { to: '/login', label: t('nav.login') },
    { to: '/booking', label: t('nav.booking') },
    { to: '/employers/register', label: t('nav.forEmployers') },
  ];

  return (
    <footer className="relative overflow-hidden bg-navy-950 text-white">
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--color-brand-600),transparent)] opacity-20" />
      <div className="absolute inset-x-0 top-0 flex h-1">
        <span className="flex-1 bg-az-blue" />
        <span className="flex-1 bg-az-red" />
        <span className="flex-1 bg-az-green" />
        <span className="flex-1 bg-black" />
        <span className="flex-1 bg-de-red" />
        <span className="flex-1 bg-de-gold" />
      </div>

      <div className="container-x relative grid grid-cols-2 gap-x-6 gap-y-10 pt-14 pb-10 sm:pt-20 sm:pb-12 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr] lg:gap-12">
        <div className="col-span-2 lg:col-span-1">
          <Logo light />
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/60">{t('footer.about')}</p>
          <div className="mt-6 flex gap-2">
            {Object.entries(social).map(([name, url]) => (
              <motion.a
                key={name}
                href={url}
                target="_blank"
                rel="noreferrer"
                aria-label={name}
                whileHover={{ y: -4, scale: 1.08 }}
                className="grid size-10 place-items-center rounded-full border border-white/15 text-white/80 transition-colors hover:border-brand-500 hover:bg-brand-600 hover:text-white"
              >
                <SocialIcon name={name} />
              </motion.a>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-4 text-xs font-bold tracking-widest text-white/40 uppercase sm:mb-5 sm:text-sm">{t('footer.company')}</h4>
          <ul className="space-y-3">
            {company.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="group inline-flex items-center gap-1 text-sm text-white/75 transition hover:text-white">
                  {l.label}
                  <ArrowUpRight className="size-3.5 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="mb-4 text-xs font-bold tracking-widest text-white/40 uppercase sm:mb-5 sm:text-sm">{t('footer.forCandidates')}</h4>
          <ul className="space-y-3">
            {candidates.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="group inline-flex items-center gap-1 text-sm text-white/75 transition hover:text-white">
                  {l.label}
                  <ArrowUpRight className="size-3.5 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-2 lg:col-span-1">
          <h4 className="mb-4 text-xs font-bold tracking-widest text-white/40 uppercase sm:mb-5 sm:text-sm">{t('footer.contact')}</h4>
          {contact && (
            <ul className="space-y-4 text-sm text-white/75">
              <li>
                <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="flex items-center gap-3 hover:text-white">
                  <Phone className="size-4 text-brand-400" /> {contact.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${contact.email}`} className="flex items-center gap-3 break-all hover:text-white">
                  <Mail className="size-4 shrink-0 text-brand-400" /> {contact.email}
                </a>
              </li>
              {contact.offices.map((o) => (
                <li key={o.address} className="flex gap-3">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-brand-400" />
                  <span>
                    <strong className="block text-white">{tr(o.city)}</strong>
                    {o.address}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="relative border-t border-white/10">
        <div className="container-x flex flex-col items-center justify-between gap-3 py-6 text-center text-xs text-white/45 sm:flex-row sm:text-left">
          <p>
            © {new Date().getFullYear()} Triad Vision · triad-vision.de · {t('footer.rights')}
          </p>
          <div className="flex gap-5">
            <Link to="/privacy" className="hover:text-white">
              {t('footer.privacy')}
            </Link>
            <Link to="/impressum" className="hover:text-white">
              {t('footer.imprint')}
            </Link>
          </div>
        </div>
      </div>

      <div aria-hidden className="pointer-events-none overflow-hidden">
        <p className="-mb-[3vw] text-center font-display text-[13vw] leading-none font-black tracking-tight text-white/[0.03] select-none">TRIAD VISION</p>
      </div>
    </footer>
  );
};
