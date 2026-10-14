import { useTranslation } from 'react-i18next';
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { InquiryForm } from '@/components/InquiryForm';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';

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
      <section className="relative z-10 -mt-12">
        <div className="container-x">
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => {
              const inner = (
                <div className="card group flex h-full items-center gap-4 p-5 sm:p-6 transition duration-500 hover:-translate-y-1 hover:shadow-2xl">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-600 text-white transition group-hover:rotate-[-8deg]">
                    <card.icon className="size-6" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-muted uppercase">{card.label}</span>
                    <span className="block truncate font-bold text-navy-900">{card.value}</span>
                  </span>
                </div>
              );
              return (
                <StaggerItem key={card.label}>
                  {card.href ? (
                    <a href={card.href} target={card.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
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
            <div className="card card-pad sm:p-10">
              <h2 className="mb-6 font-display text-2xl font-extrabold text-navy-900">{t('contact.formTitle')}</h2>
              <InquiryForm kind="contact" />
            </div>
          </Reveal>
          <div className="space-y-6">
            <h2 className="font-display text-2xl font-extrabold text-navy-900">{t('contact.offices')}</h2>
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
                    <MapPin className="mt-0.5 size-5 shrink-0 text-brand-600" />
                    <div>
                      <p className="font-bold text-navy-900">{tr(o.city)}</p>
                      <p className="text-sm text-muted">{o.address}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
