import type { Locale } from '@prisma/client';

/** Notification texts for chat, in the recipient's language. */
interface Texts {
  mention: (p: { actor: string; channel: string; excerpt: string }) => { title: string; body: string };
  dm: (p: { actor: string; excerpt: string }) => { title: string; body: string };
  cta: string;
  generalTopic: string;
}

const T: Record<Locale, Texts> = {
  az: {
    mention: ({ actor, channel, excerpt }) => ({ title: `${actor} sizi #${channel} kanalında qeyd etdi`, body: excerpt }),
    dm: ({ actor, excerpt }) => ({ title: `${actor}: yeni mesaj`, body: excerpt }),
    cta: 'Çatı aç',
    generalTopic: 'Bütün komanda üçün ümumi kanal',
  },
  de: {
    mention: ({ actor, channel, excerpt }) => ({ title: `${actor} hat Sie in #${channel} erwähnt`, body: excerpt }),
    dm: ({ actor, excerpt }) => ({ title: `${actor}: neue Nachricht`, body: excerpt }),
    cta: 'Chat öffnen',
    generalTopic: 'Allgemeiner Kanal für das ganze Team',
  },
  en: {
    mention: ({ actor, channel, excerpt }) => ({ title: `${actor} mentioned you in #${channel}`, body: excerpt }),
    dm: ({ actor, excerpt }) => ({ title: `${actor}: new message`, body: excerpt }),
    cta: 'Open chat',
    generalTopic: 'General channel for the whole team',
  },
  ru: {
    mention: ({ actor, channel, excerpt }) => ({ title: `${actor} упомянул(а) вас в #${channel}`, body: excerpt }),
    dm: ({ actor, excerpt }) => ({ title: `${actor}: новое сообщение`, body: excerpt }),
    cta: 'Открыть чат',
    generalTopic: 'Общий канал для всей команды',
  },
};

export const chatTexts = (locale: Locale) => T[locale] ?? T.az;
