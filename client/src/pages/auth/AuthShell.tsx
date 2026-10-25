import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Bell, Camera, Lock, MessageCircle, PenLine, Phone, ShieldCheck } from 'lucide-react';
import { RouteFlags } from '@/components/ui/Flag';
import { useSiteContent } from '@/lib/content';
import { Traveller } from '@/components/illustrations';

const ASIDE_ICONS = [Camera, PenLine, Bell, ShieldCheck];
const CHIPS = ['chip-soft', 'chip-sage', 'chip-sky', 'chip-peach'];

/**
 * Split-screen layout for login / register / password pages. Both columns share one height and the
 * whole block is centred in the viewport, so short forms (login) don't leave an empty area below.
 */
export const AuthShell = ({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) => {
  const { t } = useTranslation();
  const { data } = useSiteContent();
  const contact = data?.settings.contact;
  const features = t('authAside.features', { returnObjects: true }) as string[];

  return (
    <section className="flex min-h-[100svh] items-center bg-canvas pt-24 pb-12 sm:pt-28 lg:pt-36 lg:pb-16">
      <div className="container-x grid items-stretch gap-6 lg:grid-cols-2 lg:gap-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="card mx-auto flex w-full max-w-lg flex-col rounded-3xl p-6 sm:p-10 lg:max-w-none"
        >
          <div className="flex flex-1 flex-col justify-center">
            <h1 className="type-display sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
            <div className="mt-7 sm:mt-8">{children}</div>
          </div>

          <div className="mt-8 border-t border-line pt-6">
            <p className="text-sm font-bold text-ink">{t('authAside.help')}</p>
            <p className="mt-1 text-xs text-muted">{t('authAside.helpText')}</p>
            {contact && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="btn-secondary btn-sm min-h-11">
                  <Phone className="size-4" /> {t('contact.phone')}
                </a>
                <a href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm min-h-11">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              </div>
            )}
            <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-muted">
              <Lock className="size-3.5" /> {t('authAside.secure')}
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="hidden flex-col justify-center rounded-3xl border border-line bg-sunken p-10 lg:flex xl:p-12"
        >
          <Traveller className="mx-auto mb-8 w-full max-w-[18rem]" animated />
          <RouteFlags size="lg" />
          <h2 className="mt-6 font-display text-3xl leading-tight font-semibold text-ink">{t('authAside.title')}</h2>
          <p className="mt-3 max-w-md text-muted">{t('authAside.text')}</p>
          <ul className="mt-8 space-y-3">
            {features.map((f, i) => {
              const FeatureIcon = ASIDE_ICONS[i] ?? ShieldCheck;
              return (
                <motion.li
                  key={f}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink"
                >
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${CHIPS[i % CHIPS.length]}`}>
                    <FeatureIcon className="size-[18px]" aria-hidden />
                  </span>
                  {f}
                </motion.li>
              );
            })}
          </ul>
        </motion.div>
      </div>
    </section>
  );
};
