import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Clock,
  FileSignature,
  GraduationCap,
  Handshake,
  LayoutDashboard,
  ListChecks,
  LogIn,
  LogOut,
  Mail,
  Map as MapIcon,
  Menu,
  MessageCircle,
  MessagesSquare,
  Phone,
  Route,
  Star,
  UserPlus,
  UserRound,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { Logo } from '../ui/Logo';
import { Flag } from '../ui/Flag';
import { LanguageSwitcher } from './LanguageSwitcher';
import { HeaderSearchSlot } from './HeaderSearchSlot';
import { ThemeToggle } from '../a11y/ThemeToggle';
import { useOverlay } from '../ui/overlay';
import { useAuth } from '@/lib/auth';
import { isStaffRole } from '@/lib/types';
import { useSiteContent } from '@/lib/content';
import { AUDIENCE_PATH, useAudience, type Audience } from '@/lib/audience';
import { registerCopy, SITE_LOCALES, switchLanguage } from '@/i18n';
import { siteNavCopy } from '@/i18n/siteNav';

registerCopy(siteNavCopy);

/** Routes whose top is light, so the header is solid there from the start (everywhere else it floats over a dark hero). */
export const LIGHT_TOP = ['/login', '/register', '/forgot-password', '/reset-password', '/account', '/company', '/employers/register'];
const EASE = [0.22, 1, 0.36, 1] as const;

interface MenuLink {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** The two audience menus: small, each with only its own pages (the full list lives on /tools and in the footer). */
const useAudienceMenus = () => {
  const { t } = useTranslation();
  const links: Record<Audience, MenuLink[]> = {
    worker: [
      { to: '/for-workers#process', label: t('siteNav.w.how'), icon: Route },
      { to: '/visas', label: t('siteNav.w.visas'), icon: MapIcon },
      { to: '/ausbildung', label: t('siteNav.w.ausbildung'), icon: GraduationCap },
      { to: '/jobs', label: t('siteNav.w.jobs'), icon: Briefcase },
      { to: '/tools', label: t('siteNav.w.tools'), icon: Wrench },
      { to: '/stories', label: t('siteNav.w.stories'), icon: Star },
      { to: '/faq', label: t('siteNav.w.faq'), icon: CircleHelp },
      { to: '/events', label: t('siteNav.w.events'), icon: CalendarDays },
    ],
    employer: [
      { to: '/for-employers#services', label: t('siteNav.e.services'), icon: Building2 },
      { to: '/for-employers#process', label: t('siteNav.e.how'), icon: ListChecks },
      { to: '/cooperation', label: t('siteNav.e.cooperation'), icon: Handshake },
      { to: '/cooperation#form', label: t('siteNav.e.request'), icon: Users },
      { to: '/employers/register', label: t('siteNav.e.register'), icon: FileSignature },
      { to: '/partners', label: t('siteNav.e.partners'), icon: BookOpen },
      { to: '/stories', label: t('siteNav.e.stories'), icon: MessagesSquare },
    ],
  };
  const cta: Record<Audience, { to: string; label: string }> = {
    worker: { to: '/register', label: t('siteNav.w.apply') },
    employer: { to: '/cooperation#form', label: t('siteNav.e.request') },
  };
  return { links, cta };
};

/** Paths that belong to an audience (lights up its top-level item). */
const isUnder = (pathname: string, links: MenuLink[], landing: string) =>
  pathname === landing || links.some((l) => {
    const p = l.to.split('#')[0];
    return p !== landing && (pathname === p || pathname.startsWith(`${p}/`));
  });

export const Header = () => {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { data } = useSiteContent();
  const [audience] = useAudience();
  const { links, cta } = useAudienceMenus();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menu, setMenu] = useState<Audience | null>(null);
  const [mobileGroup, setMobileGroup] = useState<Audience | null>(null);

  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 24);
    setHidden(y > 500 && y > prev && !mobileOpen && !menu);
  });

  useEffect(() => {
    setMobileOpen(false);
    setMenu(null);
  }, [pathname]);

  // The remembered audience's group starts open in the mobile menu.
  useEffect(() => {
    if (mobileOpen) setMobileGroup(audience);
  }, [mobileOpen, audience]);

  // Mobile menu is a modal layer: scroll lock (and Lenis pause), Esc closes, Tab stays inside, focus returns to the menu button.
  const mobilePanel = useOverlay(mobileOpen, () => setMobileOpen(false));

  const solid = scrolled || menu !== null || LIGHT_TOP.some((p) => pathname.startsWith(p));
  const contact = data?.settings.contact;
  const accountHref = user?.role === 'COMPANY' ? '/company' : user && user.role !== 'CLIENT' ? '/admin' : '/account';
  const portalLabel = user && isStaffRole(user.role) ? t('nav.admin') : t('siteNav.portal');

  const plain = [
    { to: '/visas', label: t('nav.visas') },
    { to: '/guides', label: t('nav.guides') },
    { to: '/contact', label: t('nav.contact') },
  ];
  const audienceItems: { key: Audience; label: string }[] = [
    { key: 'worker', label: t('siteNav.workers') },
    { key: 'employer', label: t('siteNav.employers') },
  ];

  const navText = solid ? 'text-navy-900 hover:text-brand-600' : 'text-white/90 hover:text-white';
  const itemClass = 'group relative flex h-10 items-center gap-1 rounded-lg px-3 text-[0.9rem] font-semibold whitespace-nowrap transition-colors 2xl:px-4';
  const underline = (on: boolean) => (
    <span
      className={clsx(
        'absolute inset-x-3 bottom-0.5 h-[2px] origin-left rounded-full bg-brand-500 transition-transform duration-300',
        on ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100',
      )}
    />
  );

  return (
    <>
      <motion.header className="vt-site-header fixed inset-x-0 top-0 z-50" animate={{ y: hidden ? '-100%' : '0%' }} transition={{ duration: 0.35, ease: EASE }}>
        {/* ── Top bar (desktop): reach us directly ─────────── */}
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
              <ThemeToggle variant="bar" />
              {user && (
                <>
                  <span className="h-4 w-px bg-white/15" />
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
                </>
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

            <nav className="hidden xl:block" aria-label={t('a11y.mainNav')}>
              <ul className="flex items-center">
                {audienceItems.map((a) => (
                  <li key={a.key}>
                    <AudienceDropdown
                      audience={a.key}
                      label={a.label}
                      open={menu === a.key}
                      onOpen={() => setMenu(a.key)}
                      onClose={() => setMenu((m) => (m === a.key ? null : m))}
                      links={links[a.key]}
                      cta={cta[a.key]}
                      active={isUnder(pathname, links[a.key], AUDIENCE_PATH[a.key])}
                      className={clsx(itemClass, navText)}
                      activeClass={solid ? '!text-brand-600' : '!text-white'}
                      underline={underline}
                    />
                  </li>
                ))}
                {plain.map((l) => (
                  <li key={l.to} onMouseEnter={() => setMenu(null)}>
                    <NavLink to={l.to} className={({ isActive }) => clsx(itemClass, navText, isActive && (solid ? '!text-brand-600' : '!text-white'))}>
                      {({ isActive }) => (
                        <>
                          {l.label}
                          {underline(isActive)}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="flex items-center gap-1 sm:gap-2">
              <HeaderSearchSlot light={!solid} />
              <LanguageSwitcher light={!solid} />
              <ThemeToggle light={!solid} className="lg:hidden" />
              {user ? (
                <Link
                  to={accountHref}
                  className={clsx(
                    'hidden h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold whitespace-nowrap transition lg:inline-flex',
                    solid ? 'border-line text-navy-900 hover:border-brand-400' : 'border-white/25 text-white hover:bg-white/10',
                  )}
                >
                  {isStaffRole(user.role) ? <LayoutDashboard className="size-4" /> : <UserRound className="size-4" />} {portalLabel}
                </Link>
              ) : (
                <Link
                  to="/login"
                  className={clsx(
                    'hidden h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition lg:inline-flex',
                    solid ? 'text-navy-900 hover:bg-surface' : 'text-white hover:bg-white/10',
                  )}
                >
                  <LogIn className="size-4" /> {t('nav.login')}
                </Link>
              )}
              <Link to="/booking" className="btn-primary group hidden h-10 px-4 whitespace-nowrap sm:inline-flex">
                <span className="absolute inset-y-0 left-0 w-1/3 animate-shine bg-white/25" />
                <CalendarCheck className="size-4" aria-hidden />
                <span className="2xl:hidden">{t('siteNav.bookShort')}</span>
                <span className="hidden 2xl:inline">{t('siteNav.book')}</span>
              </Link>
              <button
                type="button"
                aria-label={t('a11y.menu')}
                aria-expanded={mobileOpen}
                aria-haspopup="dialog"
                onClick={() => setMobileOpen(true)}
                className={clsx('grid size-10 place-items-center rounded-lg xl:hidden', solid ? 'text-navy-900 hover:bg-surface' : 'text-white hover:bg-white/10')}
              >
                <Menu className="size-6" />
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* ── Mobile / tablet menu: the same five items, the audience menus as groups ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            ref={mobilePanel}
            role="dialog"
            aria-modal="true"
            aria-label={t('a11y.menu')}
            tabIndex={-1}
            className="fixed inset-0 z-[80] flex flex-col bg-navy-950 text-white outline-none"
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
              <nav className="container-x flex flex-col pt-2 pb-8" aria-label={t('a11y.mainNav')}>
                {audienceItems.map((a, i) => (
                  <motion.div key={a.key} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.035 }} className="border-b border-white/10">
                    <MobileGroup label={a.label} open={mobileGroup === a.key} onToggle={() => setMobileGroup(mobileGroup === a.key ? null : a.key)}>
                      <Link to={AUDIENCE_PATH[a.key]} className="mb-1 flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-3 hover:bg-white/10">
                        <span className="min-w-0">
                          <span className="block font-semibold">{t(`siteNav.overview.${a.key}.title`)}</span>
                          <span className="mt-0.5 block text-sm text-white/70">{t(`siteNav.overview.${a.key}.text`)}</span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-brand-400" />
                      </Link>
                      {links[a.key].map((l) => (
                        <Link key={l.to} to={l.to} className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-[0.95rem] text-white/85 hover:bg-white/5 hover:text-white">
                          <l.icon className="size-4 shrink-0 text-brand-400" aria-hidden />
                          <span className="truncate">{l.label}</span>
                        </Link>
                      ))}
                    </MobileGroup>
                  </motion.div>
                ))}
                {[...plain, { to: '/tools', label: t('siteNav.tools') }].map((l, i) => (
                  <motion.div key={l.to} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.22 + i * 0.035 }} className="border-b border-white/10">
                    <NavLink to={l.to} className={({ isActive }) => clsx('flex items-center justify-between py-4 font-display text-xl font-bold', isActive ? 'text-brand-400' : 'text-white')}>
                      {l.label}
                      <ArrowRight className="size-5 opacity-30" />
                    </NavLink>
                  </motion.div>
                ))}

                <div className="mt-6 flex flex-wrap gap-2">
                  {SITE_LOCALES.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => switchLanguage(l)}
                      aria-pressed={!!i18n.resolvedLanguage?.startsWith(l)}
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
                  <Link to="/booking" className="btn-primary w-full">
                    <CalendarCheck className="size-4" aria-hidden /> {t('siteNav.book')}
                  </Link>
                  {user ? (
                    <Link to={accountHref} className="btn-outline w-full">
                      {portalLabel}
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

/**
 * One audience item of the desktop bar: a disclosure button with a small panel of links (not an ARIA menu —
 * plain links, so screen readers and Tab work as on any list of links). Opens on hover and on click / Enter /
 * Arrow down (focus moves to the first link); closes on Escape (focus back on the button), on an outside
 * click and when focus leaves it.
 */
const AudienceDropdown = ({
  audience,
  label,
  open,
  onOpen,
  onClose,
  links,
  cta,
  active,
  className,
  activeClass,
  underline,
}: {
  audience: Audience;
  label: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  links: MenuLink[];
  cta: { to: string; label: string };
  active: boolean;
  className: string;
  activeClass: string;
  underline: (on: boolean) => ReactNode;
}) => {
  const { t } = useTranslation();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<number | undefined>(undefined);
  const focusFirst = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (focusFirst.current) {
      focusFirst.current = false;
      requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('a')?.focus());
    }
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onClose();
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusFirst.current = true;
      if (open) panel.current?.querySelector<HTMLElement>('a')?.focus();
      else onOpen();
    }
  };

  return (
    <div
      ref={root}
      className="relative"
      onMouseEnter={() => {
        window.clearTimeout(leaveTimer.current);
        onOpen();
      }}
      onMouseLeave={() => {
        leaveTimer.current = window.setTimeout(onClose, 160);
      }}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) onClose();
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? onClose() : onOpen())}
        onKeyDown={onKeyDown}
        className={clsx(className, active && activeClass)}
      >
        {label}
        <ChevronDown className={clsx('size-3.5 opacity-60 transition-transform', open && 'rotate-180')} aria-hidden />
        {underline(active || open)}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panel}
            id={id}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="absolute top-full left-0 z-10 w-[36rem] pt-2"
          >
            <div className="grid grid-cols-[13rem_1fr] gap-3 overflow-hidden rounded-2xl border border-line bg-white p-3 text-navy-900 shadow-2xl">
              <Link to={AUDIENCE_PATH[audience]} className="group flex flex-col justify-between rounded-xl bg-navy-950 p-4 text-white">
                <span>
                  <span className="block font-display text-base leading-snug font-bold">{t(`siteNav.overview.${audience}.title`)}</span>
                  <span className="mt-2 block text-xs leading-relaxed text-white/75">{t(`siteNav.overview.${audience}.text`)}</span>
                </span>
                <ArrowRight className="mt-4 size-5 text-brand-400 transition group-hover:translate-x-1" aria-hidden />
              </Link>
              <div className="flex min-w-0 flex-col">
                <ul aria-label={t(audience === 'worker' ? 'siteNav.workersMenu' : 'siteNav.employersMenu')} className="grid gap-0.5">
                  {links.map((l) => (
                    <li key={l.to}>
                      <Link to={l.to} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition hover:bg-brand-50 hover:text-brand-700 focus-visible:bg-brand-50">
                        <l.icon className="size-4 shrink-0 text-brand-600" aria-hidden />
                        <span className="truncate">{l.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link to={cta.to} className="btn-primary btn-sm mt-2 justify-center">
                  {cta.label} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MobileGroup = ({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: ReactNode }) => {
  const id = useId();
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={open ? id : undefined} className="flex w-full items-center justify-between py-4 font-display text-xl font-bold">
        {label}
        <ChevronDown className={clsx('size-5 opacity-50 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
