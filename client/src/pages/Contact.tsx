import { ContactCallbackCard } from '@/components/calls/CallbackForm';
import { useTranslation } from 'react-i18next';
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { InquiryForm } from '@/components/InquiryForm';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { BookingCta } from '@/components/booking/BookingCta';
import { StatusBox } from '@/components/site/StatusBox';

export default function Contact() {
  const { t } = useTranslation();
  usePageTitle(t('contact.title'));
  const { data } = useSiteContent();
  const { tr } = useL10n();
  const c = data?.settings.contact;

  const cards = c
    ? [
        { icon: Phone, label: t('contact.phone'), value: c.phone, href: `tel:${c.phone.replace(/\s/g, '')}` },
        { icon: MessageCircle, label: t('contact.whatsapp'), value: t('contact.writeWhatsapp'), href: `https://wa.me/${c.whatsapp.replace(/\D/g, '')}` },
        { icon: Mail, label: t('contact.email'), value: c.email, href: `mailto:${c.email}` },
        { icon: Clock, label: t('contact.hours'), value: tr(c.hours) },
      ]
    : [];

  return (
    <>
      <PageHero title={t('contact.title')} subtitle={t('contact.subtitle')} image="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=2000&q=70" />
      <section className="pt-10 sm:pt-14">
        <div className="container-x">
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card, i) => {
              const inner = (
                <div className={clsx('card flex h-full min-h-20 items-center gap-4 p-5 sm:p-6', card.href && 'card-interactive')}>
                  <span className={clsx('grid size-11 shrink-0 place-items-center rounded-xl', ['chip-soft', 'chip-sage', 'chip-sky', 'chip-peach'][i % 4])}>
                    <card.icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold tracking-wide text-muted uppercase">{card.label}</span>
                    <span className="block truncate font-bold text-ink">{card.value}</span>
                  </span>
                </div>
              );
              return (
                <StaggerItem key={card.label}>
                  {card.href ? (
                    <a href={card.href} target={card.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="block h-full rounded-2xl">
                      {inner}
                    </a>
                  ) : (
                    inner
                  )}
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </section>

      <section className="section">
        <div className="container-x grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <Reveal>
            <div className="card card-pad rounded-3xl sm:p-10">
              <h2 className="mb-6 font-display text-2xl font-semibold text-ink">{t('contact.formTitle')}</h2>
              <InquiryForm kind="contact" />
            </div>
          </Reveal>
          <div className="space-y-6">
            {/* Public status check without login (/status) */}
            <StatusBox />
            {/* "Mənə zəng edin": callback request in a Baku office-hours window */}
            <ContactCallbackCard />
            <h2 className="font-display text-2xl font-semibold text-ink">{t('contact.offices')}</h2>
            {c?.offices.map((o, i) => (
              <Reveal key={o.address} delay={i * 0.1}>
                <div className="card overflow-hidden">
                  <iframe
                    title={tr(o.city)}
                    loading="lazy"
                    className="h-56 w-full border-0 grayscale-[40%]"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${o.lng - 0.012}%2C${o.lat - 0.006}%2C${o.lng + 0.012}%2C${o.lat + 0.006}&layer=mapnik&marker=${o.lat}%2C${o.lng}`}
                  />
                  <div className="flex items-start gap-3 p-5">
                    <MapPin className="mt-0.5 size-5 shrink-0 text-muted" />
                    <div>
                      <p className="font-semibold text-ink">{tr(o.city)}</p>
                      <p className="text-sm text-muted">{o.address}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Free consultation booking (booking stream) */}
      <BookingCta />
    </>
  );
}
