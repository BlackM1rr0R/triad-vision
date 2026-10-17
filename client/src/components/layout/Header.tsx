import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import {
  ArrowRight,
  ChevronDown,
  Clock,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Phone,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { Logo } from '../ui/Logo';
import { Icon } from '../ui/Icon';
import { Flag } from '../ui/Flag';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from '../a11y/ThemeToggle';
import { setSmoothScrollPaused } from '@/lib/smoothScroll';
import { SearchButton } from '../search/SearchPalette';
import { useAuth } from '@/lib/auth';
import { isStaffRole } from '@/lib/types';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import { LOCALES, switchLanguage } from '@/i18n';
import { sized } from '@/lib/img';

/** Routes whose top section is light, so the header must start in its solid (dark-text) style. */
/** Routes whose top is light, so the header is solid there from the start (everywhere else it floats over a dark hero). */
export const LIGHT_TOP = ['/login', '/register', '/forgot-password', '/reset-password', '/account', '/company', '/employers/register'];
const EASE = [0.22, 1, 0.36, 1] as const;

type MegaKey = 'services' | 'visas' | 'more';

export const Header = () => {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { data } = useSiteContent();
  const { tr } = useL10n();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mega, setMega] = useState<MegaKey | null>(null);
  const [mobileGroup, setMobileGroup] = useState<'services' | 'visas' | null>(null);

  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 24);
    setHidden(y > 500 && y > prev && !mobileOpen && !mega);
  });

  useEffect(() => {
    setMobileOpen(false);
    setMega(null);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    setSmoothScrollPaused(mobileOpen);
    return () => {
      document.body.style.overflow = '';
      setSmoothScrollPaused(false);
    };
  }, [mobileOpen]);

  const solid = scrolled || mega !== null || LIGHT_TOP.some((p) => pathname.startsWith(p));
  const contact = data?.settings.contact;
  const accountHref = user?.role === 'COMPANY' ? '/company' : user && user.role !== 'CLIENT' ? '/admin' : '/account';

  const primary: { to: string; label: string; mega?: MegaKey }[] = [
    { to: '/', label: t('nav.home') },
    { to: '/about', label: t('nav.about') },
    { to: '/services', label: t('nav.services'), mega: 'services' },
    { to: '/visas', label: t('nav.visas'), mega: 'visas' },
    { to: '/partners', label: t('nav.partners') },
    { to: '/contact', label: t('nav.contact') },
  ];
  const more = [
    { to: '/jobs', label: t('nav.jobs') },
    { to: '/booking', label: t('nav.booking') },
    { to: '/employers/register', label: t('nav.forEmployers') },
    { to: '/stories', label: t('nav.stories') },
    { to: '/ausbildung', label: t('nav.ausbildung') },
    { to: '/eligibility', label: t('nav.eligibility') },
    { to: '/faq', label: t('nav.faq') },
    { to: '/news', label: t('nav.news') },
    { to: '/salary-calculator', label: t('nav.salary') },
    { to: '/anerkennung', label: t('nav.anerkennung') },
    { to: '/cities', label: t('nav.cities') },
  ];
  const moreActive = more.some((m) => pathname.startsWith(m.to));

  const navText = solid ? 'text-navy-900 hover:text-brand-600' : 'text-white/90 hover:text-white';

  return (
    <>
      <motion.header
        className="fixed inset-x-0 top-0 z-50"
        animate={{ y: hidden ? '-100%' : '0%' }}
        transition={{ duration: 0.35, ease: EASE }}
        onMouseLeave={() => setMega(null)}
      >
        {/* ── Top bar (desktop) ───────────────────────────── */}
        <motion.div
          initial={false}
          animate={{ height: scrolled ? 0 : 40, opacity: scrolled ? 0 : 1 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="hidden overflow-hidden bg-navy-950 text-xs text-white/75 lg:block"
        >
          <div className="container-x flex h-10 items-center justify-between gap-6">
            <div className="flex min-w-0 items-center gap-5">
              {contact && (
                <>
                  <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="flex items-center gap-1.5 whitespace-nowrap hover:text-white">
                    <Phone className="size-3.5 text-brand-400" /> {contact.phone}
                  </a>
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 whitespace-nowrap hover:text-white">
                    <Mail className="size-3.5 text-brand-400" /> {contact.email}
                  </a>
                  <span className="hidden items-center gap-1.5 whitespace-nowrap xl:flex">
                    <Clock className="size-3.5 text-brand-400" /> {t('topbar.hours')}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-4">
              {contact && (
                <a
                  href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 whitespace-nowrap hover:text-white"
                >
                  <MessageCircle className="size-3.5 text-[#25d366]" /> WhatsApp
                </a>
              )}
              <span className="h-4 w-px bg-white/15" />
              <LanguageSwitcher variant="bar" />
              <ThemeToggle variant="bar" />
              <span className="h-4 w-px bg-white/15" />
              {user ? (
                <div className="flex items-center gap-3">
                  <Link to={accountHref} className="flex items-center gap-1.5 font-semibold whitespace-nowrap text-white hover:text-brand-400">
                    {!isStaffRole(user.role) ? <UserRound className="size-3.5" /> : <LayoutDashboard className="size-3.5" />}
                    {!isStaffRole(user.role) ? t('nav.account') : t('nav.admin')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      navigate('/');
                      void logout();
                    }}
                    className="flex items-center gap-1 whitespace-nowrap hover:text-white"
                  >
                    <LogOut className="size-3.5" /> {t('nav.logout')}
                  </button>
                </div>
              ) : (
                <Link to="/login" className="flex items-center gap-1.5 font-semibold whitespace-nowrap text-white hover:text-brand-400">
                  <LogIn className="size-3.5" /> {t('nav.login')}
                </Link>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Main bar ────────────────────────────────────── */}
        <div
          className={clsx(
            'relative transition-[background-color,box-shadow,border-color] duration-500',
            solid
              ? 'border-b border-line/80 bg-white/[0.97] shadow-[0_10px_40px_-20px_rgba(11,31,68,0.35)]'
              : 'border-b border-white/10 bg-transparent',
          )}
        >
          <div className="container-x flex h-16 items-center justify-between gap-3 sm:h-[72px] xl:gap-6">
            <Logo light={!solid} />

            <nav className="hidden items-center xl:flex" aria-label="Main">
              {primary.map((l) => (
                <div key={l.to} onMouseEnter={() => setMega(l.mega ?? null)}>
                  <NavLink
                    to={l.to}
                    end={l.to === '/'}
                    onClick={() => setMega(null)}
                    className={({ isActive }) =>
                      clsx(
                        'group relative flex h-10 items-center gap-1 rounded-lg px-2.5 text-[0.85rem] font-semibold whitespace-nowrap transition-colors 2xl:px-3.5',
                        navText,
                        isActive && (solid ? '!text-brand-600' : '!text-white'),
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {l.label}
                        {l.mega && <ChevronDown className={clsx('size-3.5 opacity-60 transition-transform', mega === l.mega && 'rotate-180')} />}
                        <span
                          className={clsx(
                            'absolute inset-x-2.5 bottom-0.5 h-[2px] origin-left rounded-full bg-brand-500 transition-transform duration-300',
                            isActive || mega === l.mega ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100',
                          )}
                        />
                      </>
                    )}
                  </NavLink>
                </div>
              ))}
              <div onMouseEnter={() => setMega('more')}>
                <button
                  type="button"
                  aria-expanded={mega === 'more'}
                  onClick={() => setMega(mega === 'more' ? null : 'more')}
                  className={clsx(
                    'relative flex h-10 items-center gap-1 rounded-lg px-2.5 text-[0.85rem] font-semibold whitespace-nowrap 2xl:px-3.5',
                    navText,
                    moreActive && (solid ? '!text-brand-600' : '!text-white'),
                  )}
                >
                  {t('nav.more')}
                  <ChevronDown className={clsx('size-3.5 opacity-60 transition-transform', mega === 'more' && 'rotate-180')} />
                </button>
              </div>
            </nav>

            <div className="flex items-center gap-1 sm:gap-2">
              <SearchButton light={!solid} />
              <div className="flex items-center gap-1 sm:gap-2 lg:hidden">
                <LanguageSwitcher light={!solid} />
                <ThemeToggle light={!solid} />
              </div>
              {user ? (
                <Link
                  to={accountHref}
                  className={clsx('hidden h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold whitespace-nowrap transition lg:inline-flex', solid ? 'border-line text-navy-900 hover:border-brand-400' : 'border-white/25 text-white hover:bg-white/10')}
                >
                  <UserRound className="size-4" /> {!isStaffRole(user.role) ? t('nav.accountShort') : t('nav.admin')}
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    className={clsx('hidden h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition lg:inline-flex', solid ? 'text-navy-900 hover:bg-surface' : 'text-white hover:bg-white/10')}
                  >
                    <LogIn className="size-4" /> {t('nav.login')}
                  </Link>
                  <Link
                    to="/register"
                    className={clsx('hidden h-10 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-semibold whitespace-nowrap transition lg:inline-flex', solid ? 'border-navy-900 text-navy-900 hover:bg-navy-900 hover:text-white' : 'border-white/40 text-white hover:bg-white hover:text-navy-900')}
                  >
                    <UserPlus className="size-4" /> {t('nav.register')}
                  </Link>
                </>
              )}
              <Link to="/cooperation" className="btn-primary group hidden h-10 px-4 whitespace-nowrap sm:inline-flex">
                <span className="absolute inset-y-0 left-0 w-1/3 animate-shine bg-white/25" />
                <span className="2xl:hidden">{t('nav.cooperationShort')}</span>
                <span className="hidden 2xl:inline">{t('nav.cooperation')}</span>
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <button
                type="button"
                aria-label={t('a11y.menu')}
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen(true)}
                className={clsx('grid size-10 place-items-center rounded-lg xl:hidden', solid ? 'text-navy-900 hover:bg-surface' : 'text-white hover:bg-white/10')}
              >
                <Menu className="size-6" />
              </button>
            </div>
          </div>

          {/* ── Mega menus ─────────────────────────────────── */}
          <AnimatePresence>
            {mega && (
              <motion.div
                key={mega}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="absolute inset-x-0 top-full hidden border-t border-line bg-white shadow-2xl xl:block"
              >
                <div className="container-x py-8">
                  {mega === 'services' && data && (
                    <MegaGrid
                      items={data.services.map((s) => ({ to: `/services/${s.slug}`, icon: s.icon, title: tr(s.title), text: tr(s.summary) }))}
                      aside={{ to: '/services', title: t('svc.title'), text: t('svc.subtitle'), cta: t('common.viewAll'), image: data.services[0]?.image }}
                    />
                  )}
                  {mega === 'visas' && data && (
                    <MegaGrid
                      items={data.visaCategories.map((v) => ({ to: `/visas/${v.slug}`, icon: v.icon, title: tr(v.title), text: v.visaLabel }))}
                      aside={{ to: '/visas', title: t('visas.pageTitle'), text: t('visas.pageSubtitle'), cta: t('visas.all'), image: data.visaCategories[0]?.image }}
                    />
                  )}
                  {mega === 'more' && (
                    <div className="grid grid-cols-4 gap-3">
                      {more.map((m) => (
                        <Link
                          key={m.to}
                          to={m.to}
                          className="group flex items-center justify-between rounded-xl border border-line px-4 py-3.5 text-sm font-semibold text-navy-900 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
                        >
                          {m.label}
                          <ArrowRight className="size-4 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.header>

      {/* ── Mobile / tablet menu ───────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-[80] flex flex-col bg-navy-950 text-white"
            initial={{ clipPath: 'circle(0% at 100% 0%)' }}
            animate={{ clipPath: 'circle(150% at 100% 0%)' }}
            exit={{ clipPath: 'circle(0% at 100% 0%)' }}
            transition={{ duration: 0.55, ease: [0.76, 0, 0.24, 1] }}
          >
            <div className="container-x flex h-16 shrink-0 items-center justify-between sm:h-[72px]">
              <Logo light />
              <button type="button" aria-label={t('common.close')} onClick={() => setMobileOpen(false)} className="grid size-10 place-items-center rounded-lg hover:bg-white/10">
                <X className="size-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain">
              <nav className="container-x flex flex-col pt-2 pb-8">
                {primary.map((l, i) => (
                  <motion.div key={l.to} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.035 }} className="border-b border-white/10">
                    {l.mega === 'services' || l.mega === 'visas' ? (
                      <MobileGroup
                        label={l.label}
                        open={mobileGroup === l.mega}
                        onToggle={() => setMobileGroup(mobileGroup === l.mega ? null : (l.mega as 'services' | 'visas'))}
                        allHref={l.to}
                        allLabel={t('common.viewAll')}
                      >
                        {(l.mega === 'services' ? data?.services : data?.visaCategories)?.map((x) => (
                          <Link
                            key={x.id}
                            to={`${l.to}/${x.slug}`}
                            className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-[0.95rem] text-white/80 hover:bg-white/5 hover:text-white"
                          >
                            <Icon name={x.icon} className="size-4 shrink-0 text-brand-400" />
                            <span className="truncate">{tr(x.title)}</span>
                          </Link>
                        ))}
                      </MobileGroup>
                    ) : (
                      <NavLink
                        to={l.to}
                        end={l.to === '/'}
                        className={({ isActive }) =>
                          clsx('flex items-center justify-between py-4 font-display text-xl font-bold', isActive ? 'text-brand-400' : 'text-white')
                        }
                      >
                        {l.label}
                        <ArrowRight className="size-5 opacity-30" />
                      </NavLink>
                    )}
                  </motion.div>
                ))}

                <div className="mt-6 grid grid-cols-2 gap-2">
                  {more.map((m) => (
                    <Link key={m.to} to={m.to} className="truncate rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/5">
                      {m.label}
                    </Link>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  {LOCALES.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => switchLanguage(l)}
                      className={clsx(
                        'flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold',
                        i18n.resolvedLanguage?.startsWith(l) ? 'border-brand-500 bg-brand-600/20 text-white' : 'border-white/15 text-white/70',
                      )}
                    >
                      <Flag code={l} /> {l.toUpperCase()}
                    </button>
                  ))}
                  <ThemeToggle light className="ml-auto" />
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <Link to="/cooperation" className="btn-primary w-full">
                    {t('nav.cooperation')}
                  </Link>
                  {user ? (
                    <Link to={accountHref} className="btn-outline w-full">
                      {!isStaffRole(user.role) ? t('nav.account') : t('nav.admin')}
                    </Link>
                  ) : (
                    <>
                      <Link to="/login" className="btn-outline w-full">
                        <LogIn className="size-4" /> {t('nav.login')}
                      </Link>
                      <Link to="/register" className="btn-white w-full border border-line sm:col-span-2">
                        <UserPlus className="size-4" /> {t('nav.register')}
                      </Link>
                    </>
                  )}
                </div>

                {contact && (
                  <div className="mt-6 grid grid-cols-2 gap-2 text-sm">
                    <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="flex items-center justify-center gap-2 rounded-xl bg-white/5 py-3 hover:bg-white/10">
                      <Phone className="size-4 text-brand-400" /> {t('contact.phone')}
                    </a>
                    <a
                      href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl bg-white/5 py-3 hover:bg-white/10"
                    >
                      <MessageCircle className="size-4 text-[#25d366]" /> WhatsApp
                    </a>
                  </div>
                )}
              </nav>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const MegaGrid = ({
  items,
  aside,
}: {
  items: { to: string; icon: string; title: string; text: string }[];
  aside: { to: string; title: string; text: string; cta: string; image?: string };
}) => (
  <div className="grid grid-cols-[1fr_300px] gap-8">
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((it, i) => (
        <motion.div key={it.to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}>
          <Link to={it.to} className="group flex items-start gap-3 rounded-xl p-3 transition hover:bg-brand-50">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white">
              <Icon name={it.icon} className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-navy-900">{it.title}</span>
              <span className="line-clamp-2 text-xs text-muted">{it.text}</span>
            </span>
          </Link>
        </motion.div>
      ))}
    </div>
    <Link to={aside.to} className="group relative flex flex-col justify-end overflow-hidden rounded-2xl bg-navy-900 p-6 text-white">
      {aside.image && <img src={sized(aside.image, 600)} alt="" decoding="async" className="absolute inset-0 size-full object-cover opacity-30 transition duration-700 group-hover:scale-110" />}
      <div className="absolute inset-0 bg-gradient-to-t from-navy-950 to-transparent" />
      <div className="relative">
        <p className="font-display text-lg leading-snug font-bold">{aside.title}</p>
        <p className="mt-2 line-clamp-3 text-sm text-white/70">{aside.text}</p>
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">
          {aside.cta} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  </div>
);

const MobileGroup = ({
  label,
  open,
  onToggle,
  allHref,
  allLabel,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  allHref: string;
  allLabel: string;
  children: ReactNode;
}) => (
  <div>
    <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between py-4 font-display text-xl font-bold">
      {label}
      <ChevronDown className={clsx('size-5 opacity-50 transition-transform', open && 'rotate-180')} />
    </button>
    <AnimatePresence initial={false}>
      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
          <div className="pb-4">
            {children}
            <Link to={allHref} className="mt-1 flex items-center gap-2 px-2 py-2.5 text-sm font-semibold text-brand-400">
              {allLabel} <ArrowRight className="size-4" />
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);
