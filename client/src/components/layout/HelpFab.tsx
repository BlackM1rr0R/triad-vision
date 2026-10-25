import { lazy, Suspense, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Accessibility, ArrowUp, Bug, ChevronRight, LifeBuoy, MessageCircleQuestion, Phone, PhoneCall, Sparkles } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';
import { useSiteContent } from '@/lib/content';
import { openHelpAction, useHelpActions, useHelpFab, type HelpAction } from '@/lib/helpMenu';
import { scrollToTop } from './Effects';

// The callback form (and its copy) is only downloaded when someone asks for a call.
const CallbackForm = lazy(() => import('../calls/CallbackForm').then((m) => ({ default: m.CallbackForm })));

/*
 * Phones (< 640 px): ONE round "Kömək" button replaces the floating stack (accessibility, AI advisor or the
 * client AI, WhatsApp, back to top, "Problem bildir"), which covered the content. It opens a bottom sheet
 * (the design-system Modal: focus trap, Escape, focus return, safe-area padding) listing what is available
 * on this route; each entry opens the existing feature through lib/helpMenu.ts. Desktop keeps the stack.
 * Copy is inline (six site languages) so the shell does not pull a copy bundle.
 */
const COPY = {
  az: { open: 'Kömək', title: 'Sizə necə kömək edək?', advisor: 'AI məsləhətçi', advisorHint: 'Viza və iş haqqında suallar', ai: 'AI köməkçi', aiHint: 'Müraciətiniz üzrə suallar', whatsapp: 'WhatsApp', whatsappHint: 'Bizə yazın', call: 'Zəng edin', callback: 'Mənə zəng edin', callbackHint: 'Sizə uyğun vaxtda zəng edək', a11y: 'Əlçatanlıq ayarları', a11yHint: 'Şrift, kontrast, səsləndirmə', problem: 'Problem bildir', problemHint: 'Saytda nəsə işləmir?', top: 'Yuxarı qayıt', close: 'Bağla' },
  de: { open: 'Hilfe', title: 'Wie können wir helfen?', advisor: 'KI-Berater', advisorHint: 'Fragen zu Visum und Arbeit', ai: 'KI-Assistent', aiHint: 'Fragen zu Ihrem Antrag', whatsapp: 'WhatsApp', whatsappHint: 'Schreiben Sie uns', call: 'Anrufen', callback: 'Rückruf anfordern', callbackHint: 'Wir rufen zu Ihrer Wunschzeit an', a11y: 'Barrierefreiheit', a11yHint: 'Schrift, Kontrast, Vorlesen', problem: 'Problem melden', problemHint: 'Funktioniert etwas nicht?', top: 'Nach oben', close: 'Schließen' },
  en: { open: 'Help', title: 'How can we help?', advisor: 'AI advisor', advisorHint: 'Questions about visas and work', ai: 'AI assistant', aiHint: 'Questions about your application', whatsapp: 'WhatsApp', whatsappHint: 'Write to us', call: 'Call us', callback: 'Call me back', callbackHint: 'We call at a time that suits you', a11y: 'Accessibility settings', a11yHint: 'Text size, contrast, read aloud', problem: 'Report a problem', problemHint: 'Something not working?', top: 'Back to top', close: 'Close' },
  ru: { open: 'Помощь', title: 'Чем мы можем помочь?', advisor: 'AI-консультант', advisorHint: 'Вопросы о визе и работе', ai: 'AI-помощник', aiHint: 'Вопросы по вашему делу', whatsapp: 'WhatsApp', whatsappHint: 'Напишите нам', call: 'Позвонить', callback: 'Перезвоните мне', callbackHint: 'Позвоним в удобное время', a11y: 'Доступность', a11yHint: 'Шрифт, контраст, озвучивание', problem: 'Сообщить о проблеме', problemHint: 'Что-то не работает?', top: 'Наверх', close: 'Закрыть' },
  tr: { open: 'Yardım', title: 'Size nasıl yardımcı olabiliriz?', advisor: 'AI danışman', advisorHint: 'Vize ve iş hakkında sorular', ai: 'AI asistan', aiHint: 'Başvurunuzla ilgili sorular', whatsapp: 'WhatsApp', whatsappHint: 'Bize yazın', call: 'Bizi arayın', callback: 'Beni arayın', callbackHint: 'Size uygun bir zamanda arayalım', a11y: 'Erişilebilirlik ayarları', a11yHint: 'Yazı boyutu, kontrast, sesli okuma', problem: 'Sorun bildir', problemHint: 'Bir şey çalışmıyor mu?', top: 'Yukarı dön', close: 'Kapat' },
  uk: { open: 'Допомога', title: 'Чим ми можемо допомогти?', advisor: 'AI-консультант', advisorHint: 'Питання про візу та роботу', ai: 'AI-помічник', aiHint: 'Питання щодо вашої справи', whatsapp: 'WhatsApp', whatsappHint: 'Напишіть нам', call: 'Зателефонувати', callback: 'Передзвоніть мені', callbackHint: 'Зателефонуємо у зручний час', a11y: 'Доступність', a11yHint: 'Шрифт, контраст, озвучення', problem: 'Повідомити про проблему', problemHint: 'Щось не працює?', top: 'Угору', close: 'Закрити' },
} as const;
type Copy = (typeof COPY)[keyof typeof COPY];

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.6a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.2-.2-.5-.3Z" />
  </svg>
);

const Item = ({ icon, tone, label, hint, onClick, href, external }: { icon: ReactNode; tone: string; label: string; hint?: string; onClick?: () => void; href?: string; external?: boolean }) => {
  const body = (
    <>
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
    </>
  );
  const cls = 'flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sunken focus-visible:bg-sunken';
  return (
    <li>
      {href ? (
        <a href={href} className={cls} onClick={onClick} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
          {body}
        </a>
      ) : (
        <button type="button" className={cls} onClick={onClick}>
          {body}
        </button>
      )}
    </li>
  );
};

/** Round "Kömək" button (phones only) + the help sheet. Rendered inside the floating-actions stack. */
export const HelpFab = () => {
  const { i18n } = useTranslation();
  const copy: Copy = COPY[(i18n.resolvedLanguage?.slice(0, 2) ?? 'az') as keyof typeof COPY] ?? COPY.az;
  const { pathname } = useLocation();
  const { data } = useSiteContent();
  const actions = useHelpActions();
  const [open, setOpen] = useState(false);
  const [callback, setCallback] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useHelpFab();

  const wa = data?.settings.contact?.whatsapp.replace(/\D/g, '');
  const phone = data?.settings.contact?.phone?.replace(/[^\d+]/g, '');
  const portal = pathname === '/account' || pathname.startsWith('/account/');

  /** Close the sheet first (focus returns to the button), then open the feature, which takes focus. */
  const run = (fn: () => void) => {
    setOpen(false);
    window.setTimeout(fn, 220);
  };
  const feature = (a: HelpAction) => () => run(() => openHelpAction(a));

  return (
    <>
      <motion.button
        type="button"
        data-help-fab
        aria-label={copy.open}
        aria-haspopup="dialog"
        aria-expanded={open}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1.2, type: 'spring' }}
        onClick={() => {
          setScrolled(window.scrollY > 400);
          setOpen(true);
        }}
        className="grid size-14 place-items-center rounded-full bg-primary text-primary-contrast shadow-[var(--tv-shadow-raised)] hover:bg-primary-hover sm:hidden"
      >
        <LifeBuoy className="size-7" aria-hidden />
      </motion.button>

      <Modal open={open} onClose={() => setOpen(false)} title={copy.title} closeLabel={copy.close} size="sm" zIndex={85} padded={false}>
        <ul className="space-y-0.5 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {actions.has('advisor') && <Item icon={<MessageCircleQuestion className="size-5" aria-hidden />} tone="chip-soft" label={copy.advisor} hint={copy.advisorHint} onClick={feature('advisor')} />}
          {actions.has('ai') && <Item icon={<Sparkles className="size-5" aria-hidden />} tone="chip-soft" label={copy.ai} hint={copy.aiHint} onClick={feature('ai')} />}
          {wa && <Item icon={<WhatsAppIcon />} tone="bg-[#25d366] text-white" label={copy.whatsapp} hint={copy.whatsappHint} href={`https://wa.me/${wa}`} external onClick={() => setOpen(false)} />}
          {phone && <Item icon={<Phone className="size-5" aria-hidden />} tone="chip-sky" label={copy.call} hint={data?.settings.contact?.phone} href={`tel:${phone}`} onClick={() => setOpen(false)} />}
          <Item icon={<PhoneCall className="size-5" aria-hidden />} tone="chip-sky" label={copy.callback} hint={copy.callbackHint} onClick={() => run(() => setCallback(true))} />
          {actions.has('a11y') && <Item icon={<Accessibility className="size-5" aria-hidden />} tone="bg-sunken text-ink" label={copy.a11y} hint={copy.a11yHint} onClick={feature('a11y')} />}
          {actions.has('problem') && <Item icon={<Bug className="size-5" aria-hidden />} tone="bg-sunken text-ink" label={copy.problem} hint={copy.problemHint} onClick={feature('problem')} />}
          {scrolled && <Item icon={<ArrowUp className="size-5" aria-hidden />} tone="bg-sunken text-ink" label={copy.top} onClick={() => run(() => scrollToTop())} />}
        </ul>
      </Modal>

      <Modal open={callback} onClose={() => setCallback(false)} title={copy.callback} description={copy.callbackHint} closeLabel={copy.close} zIndex={85}>
        <Suspense fallback={<Spinner className="mx-auto my-8 size-6" />}>{callback && <CallbackForm source={portal ? 'portal' : 'footer'} compact />}</Suspense>
      </Modal>
    </>
  );
};

export default HelpFab;
