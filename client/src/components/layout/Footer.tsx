import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowUpRight, Mail, MapPin, Phone } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import { whenIdle } from '@/lib/idle';
import { openConsentSettings } from '@/lib/consent';
import { registerCopy } from '@/i18n';
import { cookieConsentCopy } from '@/i18n/cookieConsent';
import { siteNavCopy } from '@/i18n/siteNav';

registerCopy(cookieConsentCopy); // "AGB" + "Cookie settings" links
registerCopy(siteNavCopy); // footer columns (also registered by the header)

// "Mənə zəng edin": the form, its copy and the dialog are their own chunk, loaded when the browser is idle.
const CallbackButton = lazy(() => import('@/components/calls/CallbackForm'));
const LateCallbackButton = ({ className }: { className: string }) => {
  const [ready, setReady] = useState(false);
  useEffect(() => whenIdle(() => setReady(true), 3000), []);
  const placeholder = <span className={className} aria-hidden style={{ visibility: 'hidden' }} />;
  if (!ready) return placeholder;
  return (
    <Suspense fallback={placeholder}>
      <CallbackButton source="footer" className={className} />
    </Suspense>
  );
};

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

type FooterLink = { to: string; label: string };

const FooterColumn = ({ title, links }: { title: string; links: FooterLink[] }) => (
  <div>
    <h2 className="mb-4 font-sans text-xs font-semibold tracking-[0.14em] text-white/70 uppercase sm:mb-5">{title}</h2>
    <ul className="space-y-3">
      {links.map((l) => (
        <li key={l.to}>
          <Link to={l.to} className="group inline-flex min-h-8 items-center gap-1 text-sm text-white/80 transition hover:text-white hover:underline">
            {l.label}
            <ArrowUpRight className="size-3.5 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

export const Footer = () => {
  const { t } = useTranslation();
  const { data } = useSiteContent();
  const { tr } = useL10n();
  const contact = data?.settings.contact;
  const social = data?.settings.social ?? {};

  // Every public page is reachable from here or from /tools (all calculators and checks).
  const workers: FooterLink[] = [
    { to: '/for-workers', label: t('siteNav.overview.worker.title') },
    { to: '/jobs', label: t('nav.jobs') },
    { to: '/visas', label: t('nav.visas') },
    { to: '/ausbildung', label: t('nav.ausbildung') },
    { to: '/eligibility', label: t('nav.eligibility') },
    { to: '/packages', label: t('siteNav.footer.packages') },
    { to: '/events', label: t('nav.events') },
    { to: '/register', label: t('nav.apply') },
    { to: '/status', label: t('siteNav.footer.status') },
  ];
  const employers: FooterLink[] = [
    { to: '/for-employers', label: t('siteNav.overview.employer.title') },
    { to: '/services', label: t('nav.services') },
    { to: '/cooperation', label: t('siteNav.e.cooperation') },
    { to: '/cooperation#form', label: t('siteNav.e.request') },
    { to: '/employers/register', label: t('siteNav.e.register') },
    { to: '/partners', label: t('nav.partners') },
  ];
  const resources: FooterLink[] = [
    { to: '/guides', label: t('nav.guides') },
    { to: '/tools', label: t('siteNav.tools') },
    { to: '/news', label: t('nav.news') },
    { to: '/faq', label: t('nav.faq') },
    { to: '/map', label: t('nav.map') },
    { to: '/cities', label: t('nav.cities') },
  ];
  const company: FooterLink[] = [
    { to: '/about', label: t('nav.about') },
    { to: '/stories', label: t('nav.stories') },
    { to: '/contact', label: t('nav.contact') },
    { to: '/booking', label: t('siteNav.book') },
    { to: '/login', label: t('nav.login') },
  ];

  return (
    <footer className="relative overflow-hidden bg-navy-950 text-white">
      <div className="absolute inset-x-0 top-0 flex h-1">
        <span className="flex-1 bg-az-blue" />
        <span className="flex-1 bg-az-red" />
        <span className="flex-1 bg-az-green" />
        <span className="flex-1 bg-black" />
        <span className="flex-1 bg-de-red" />
        <span className="flex-1 bg-de-gold" />
      </div>

      <div className="container-x relative grid grid-cols-2 gap-x-6 gap-y-10 pt-14 pb-10 sm:pt-20 sm:pb-12 md:grid-cols-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] lg:gap-10">
        <div className="col-span-2 md:col-span-4 lg:col-span-1">
          <Logo light />
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/60">{t('footer.about')}</p>
          {contact && (
            <ul className="mt-6 space-y-3 text-sm text-white/75">
              <li>
                <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="flex items-center gap-3 hover:text-white">
                  <Phone className="size-4 text-primary" /> {contact.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${contact.email}`} className="flex items-center gap-3 break-all hover:text-white">
                  <Mail className="size-4 shrink-0 text-primary" /> {contact.email}
                </a>
              </li>
              {contact.offices.map((o) => (
                <li key={o.address} className="flex gap-3">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    <strong className="block text-white">{tr(o.city)}</strong>
                    {o.address}
                  </span>
                </li>
              ))}
              <li>
                <LateCallbackButton className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10" />
              </li>
            </ul>
          )}
          <div className="mt-6 flex gap-2">
            {Object.entries(social).map(([name, url]) => (
              <motion.a
                key={name}
                href={url}
                target="_blank"
                rel="noreferrer"
                aria-label={name}
                className="grid size-11 place-items-center rounded-full border border-white/20 text-white/85 transition-colors hover:border-primary hover:bg-primary hover:text-primary-contrast"
              >
                <SocialIcon name={name} />
              </motion.a>
            ))}
          </div>
        </div>

        <FooterColumn title={t('siteNav.footer.workers')} links={workers} />
        <FooterColumn title={t('siteNav.footer.employers')} links={employers} />
        <FooterColumn title={t('siteNav.footer.resources')} links={resources} />
        <FooterColumn title={t('siteNav.footer.company')} links={company} />
      </div>

      <div className="relative border-t border-white/10">
        <div className="container-x flex flex-col items-center justify-between gap-3 py-6 text-center text-xs text-white/60 sm:flex-row sm:text-left">
          <p>
            © {new Date().getFullYear()} Triad Vision · triad-vision.de · {t('footer.rights')}
          </p>
          <nav aria-label={t('a11y.footerNav')} className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Link to="/privacy" className="hover:text-white">
              {t('footer.privacy')}
            </Link>
            <Link to="/impressum" className="hover:text-white">
              {t('footer.imprint')}
            </Link>
            <Link to="/agb" className="hover:text-white">
              {t('legalDocs.footer.terms')}
            </Link>
            <Link to="/cookies" className="hover:text-white">
              {t('siteNav.footer.cookiePolicy')}
            </Link>
            {/* Re-opens the cookie consent banner (components/legal/CookieConsent). */}
            <button type="button" onClick={openConsentSettings} className="hover:text-white">
              {t('legalDocs.footer.cookies')}
            </button>
            <Link to="/accessibility" className="hover:text-white">
              {t('a11y.statementLink')}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};
