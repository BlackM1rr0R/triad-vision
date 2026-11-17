import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { CircleHelp, HelpCircle, ListChecks, Target, Lightbulb } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';
import { useBrand } from '@/lib/brand';
import { helpRouteOf, loadPageHelp, type HelpRoute, type PageHelpText } from '@/lib/pageHelp/registry';

/*
 * Page help "?": one small button per page that opens three short sentences (what is this · why do I need it ·
 * what should I do here), a WhatsApp link and the FAQ. Texts: lib/pageHelp (loaded on open). Placed once in the
 * shared shells — PageHero (public inner pages) and the portal header (AccountLayout); pages without either get
 * the floating variant from SiteLayout (PageHelpFloating), which hides itself while an inline button is mounted.
 * Chrome copy inline (six languages) so the page shell does not pull a copy bundle.
 */
const COPY = {
  az: { open: 'Bu səhifə haqqında kömək', title: 'Bu səhifə nədir?', what: 'Bu nədir?', why: 'Nə üçün lazımdır?', todo: 'Burada nə etməli?', ask: 'Sualınız var? WhatsApp-da yazın', faq: 'Tez-tez verilən suallar', close: 'Bağla', error: 'Mətn yüklənmədi. Bizə WhatsApp-da yazın.' },
  de: { open: 'Hilfe zu dieser Seite', title: 'Was ist diese Seite?', what: 'Was ist das?', why: 'Wozu brauche ich das?', todo: 'Was mache ich hier?', ask: 'Fragen? Schreiben Sie uns per WhatsApp', faq: 'Häufige Fragen', close: 'Schließen', error: 'Der Text konnte nicht geladen werden. Schreiben Sie uns per WhatsApp.' },
  en: { open: 'Help for this page', title: 'What is this page?', what: 'What is this?', why: 'Why do I need it?', todo: 'What should I do here?', ask: 'Questions? Write to us on WhatsApp', faq: 'Frequently asked questions', close: 'Close', error: 'The text could not be loaded. Write to us on WhatsApp.' },
  ru: { open: 'Помощь по этой странице', title: 'Что это за страница?', what: 'Что это?', why: 'Зачем это нужно?', todo: 'Что здесь делать?', ask: 'Есть вопросы? Напишите в WhatsApp', faq: 'Частые вопросы', close: 'Закрыть', error: 'Текст не загрузился. Напишите нам в WhatsApp.' },
  tr: { open: 'Bu sayfa için yardım', title: 'Bu sayfa nedir?', what: 'Bu nedir?', why: 'Neden gerekli?', todo: 'Burada ne yapmalıyım?', ask: 'Sorunuz mu var? WhatsApp’tan yazın', faq: 'Sık sorulan sorular', close: 'Kapat', error: 'Metin yüklenemedi. Bize WhatsApp’tan yazın.' },
  uk: { open: 'Допомога щодо цієї сторінки', title: 'Що це за сторінка?', what: 'Що це?', why: 'Навіщо це потрібно?', todo: 'Що тут робити?', ask: 'Є питання? Напишіть у WhatsApp', faq: 'Часті питання', close: 'Закрити', error: 'Текст не завантажився. Напишіть нам у WhatsApp.' },
} as const;
type Copy = (typeof COPY)[keyof typeof COPY];

/** Brand WhatsApp number (lib/brand phone, digits only) — +994 51 414 14 01 by default. */
const waDigits = (phone: string) => phone.replace(/\D/g, '') || '994514141401';

// Inline buttons currently mounted (the floating fallback stays hidden while there is one).
let inlineCount = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getInline = () => inlineCount;
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const useCopy = (): { copy: Copy; lng: string } => {
  const { i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? i18n.language ?? 'az').slice(0, 2);
  return { copy: COPY[lng as keyof typeof COPY] ?? COPY.az, lng };
};

const HelpDialog = ({ route, open, onClose }: { route: HelpRoute; open: boolean; onClose: () => void }) => {
  const { copy, lng } = useCopy();
  const brand = useBrand();
  const [text, setText] = useState<PageHelpText | null | 'error'>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setText(null);
    loadPageHelp(route, lng)
      .then((t) => alive && setText(t ?? 'error'))
      .catch(() => alive && setText('error'));
    return () => {
      alive = false;
    };
  }, [open, route, lng]);

  const rows: { key: keyof PageHelpText; label: string; Icon: typeof Target }[] = [
    { key: 'what', label: copy.what, Icon: Lightbulb },
    { key: 'why', label: copy.why, Icon: Target },
    { key: 'todo', label: copy.todo, Icon: ListChecks },
  ];

  return (
    <Modal open={open} onClose={onClose} title={copy.title} closeLabel={copy.close} size="sm" zIndex={85} icon={<CircleHelp className="size-5" aria-hidden />}>
      <div aria-live="polite">
        {text === null ? (
          <Spinner className="mx-auto my-6 size-6" />
        ) : text === 'error' ? (
          <p className="text-sm text-muted">{copy.error}</p>
        ) : (
          <dl className="space-y-4">
            {rows.map(({ key, label, Icon }) => (
              <div key={key} className="flex gap-3">
                <span className="chip-soft grid size-9 shrink-0 place-items-center rounded-xl">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-ink">{label}</dt>
                  <dd className="mt-0.5 text-[0.95rem] leading-relaxed text-muted">{text[key]}</dd>
                </div>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="mt-6 flex flex-col gap-2 border-t border-line pt-4">
        <a
          href={`https://wa.me/${waDigits(brand.phone)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#25d366] px-4 text-sm font-semibold text-white hover:brightness-95"
        >
          {copy.ask}
        </a>
        <Link to="/faq" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-semibold text-ink hover:bg-sunken">
          {copy.faq}
        </Link>
      </div>
    </Modal>
  );
};

/**
 * Inline "?" button for page headers. Renders nothing on routes without a help text (lib/pageHelp/registry.ts).
 */
export const PageHelpButton = ({ className }: { className?: string }) => {
  const { pathname } = useLocation();
  const route = helpRouteOf(pathname);
  const { copy } = useCopy();
  const [open, setOpen] = useState(false);

  useIsoLayoutEffect(() => {
    if (!route) return;
    inlineCount += 1;
    emit();
    return () => {
      inlineCount -= 1;
      emit();
    };
  }, [route]);

  if (!route) return null;
  return (
    <>
      <button
        type="button"
        data-page-help
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={copy.open}
        title={copy.open}
        onClick={() => setOpen(true)}
        className={clsx(
          'inline-grid size-11 shrink-0 place-items-center rounded-full border border-line bg-card text-ink shadow-[var(--tv-shadow-card)] transition-colors hover:border-line-strong hover:bg-sunken sm:size-9',
          className,
        )}
      >
        <HelpCircle className="size-5" aria-hidden />
      </button>
      {open && <HelpDialog route={route} open={open} onClose={() => setOpen(false)} />}
    </>
  );
};

/**
 * Floating "?" (bottom left) for pages with a help text but no PageHero / portal header (quizzes, games, work
 * scenes). Shown only after hydration and a short delay, and only while no inline button is mounted.
 */
export const PageHelpFloating = () => {
  const { pathname } = useLocation();
  const route = helpRouteOf(pathname);
  const inline = useSyncExternalStore(subscribe, getInline, () => 1);
  const { copy } = useCopy();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setReady(false);
    const id = window.setTimeout(() => setReady(true), 900);
    return () => window.clearTimeout(id);
  }, [pathname]);

  if (!route || inline > 0 || !ready) return null;
  return (
    <>
      <button
        type="button"
        data-page-help
        data-bnav-lift
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={copy.open}
        title={copy.open}
        onClick={() => setOpen(true)}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-30 grid size-11 place-items-center rounded-full border border-line bg-card text-ink shadow-[var(--tv-shadow-raised)] hover:bg-sunken print:hidden sm:bottom-6 sm:left-6"
      >
        <HelpCircle className="size-5" aria-hidden />
      </button>
      {open && <HelpDialog route={route} open={open} onClose={() => setOpen(false)} />}
    </>
  );
};

export default PageHelpButton;
