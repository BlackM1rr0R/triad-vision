import type { MailProvider } from '@prisma/client';

/** Connection presets for the account dialog. `hint` keys are translated by the client (mail.providers.hint.<PROVIDER>). */
export interface ProviderPreset {
  provider: MailProvider;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  /** true = implicit TLS (465/993); false = plain connection upgraded with STARTTLS (587) */
  smtpSecure: boolean;
  /** Short English hint; the UI shows a localized version keyed by provider. */
  hint: string;
  /** e-mail domains that select this preset automatically */
  domains: string[];
}

export const PROVIDERS: ProviderPreset[] = [
  {
    provider: 'GMAIL',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    hint: 'Use an App Password (Google account → Security → 2-step verification → App passwords); the normal password is rejected.',
    domains: ['gmail.com', 'googlemail.com'],
  },
  {
    provider: 'OUTLOOK',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
    hint: 'Microsoft needs an app password (or OAuth); enable IMAP in the Outlook settings first.',
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'office365.com'],
  },
  {
    provider: 'YANDEX',
    imapHost: 'imap.yandex.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.yandex.com',
    smtpPort: 465,
    smtpSecure: true,
    hint: 'Create an app password in Yandex ID → Security and enable IMAP in the mail settings.',
    domains: ['yandex.com', 'yandex.ru', 'ya.ru'],
  },
  {
    provider: 'MAILRU',
    imapHost: 'imap.mail.ru',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.ru',
    smtpPort: 465,
    smtpSecure: true,
    hint: 'Mail.ru requires an application password for external mail clients.',
    domains: ['mail.ru', 'bk.ru', 'inbox.ru', 'list.ru'],
  },
  {
    provider: 'CUSTOM',
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    hint: 'Ask your hosting provider for the IMAP and SMTP server names.',
    domains: [],
  },
];

export const presetFor = (provider: MailProvider) => PROVIDERS.find((p) => p.provider === provider) ?? PROVIDERS[PROVIDERS.length - 1]!;

/** Guesses the provider from an address ("x@gmail.com" → GMAIL). */
export const providerForEmail = (email: string): MailProvider => {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return PROVIDERS.find((p) => p.domains.includes(domain))?.provider ?? 'CUSTOM';
};
