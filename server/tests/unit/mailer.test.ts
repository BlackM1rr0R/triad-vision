import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// SMTP path: a host is configured, so mail goes through nodemailer (mocked) instead of the console log.
const m = vi.hoisted(() => ({
  prisma: { emailLog: { create: vi.fn() } },
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));
vi.mock('../../src/db.js', () => ({ prisma: m.prisma }));
vi.mock('nodemailer', () => ({ default: { createTransport: m.createTransport } }));
vi.mock('../../src/config.js', async (importOriginal) => {
  const { config } = await importOriginal<typeof import('../../src/config.js')>();
  return {
    config: { ...config, smtp: { ...config.smtp, host: 'smtp.test.local', port: 465, secure: true, user: 'u', pass: 'p', from: 'TV <no-reply@test.local>' } },
  };
});
m.createTransport.mockReturnValue({ sendMail: m.sendMail });

const { sendMail, renderEmail, plainTextOf } = await import('../../src/lib/mailer.js');

beforeEach(() => {
  m.prisma.emailLog.create.mockClear();
  m.sendMail.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('sendMail via SMTP', () => {
  it('creates the transport from config', () => {
    expect(m.createTransport).toHaveBeenCalledWith({ host: 'smtp.test.local', port: 465, secure: true, auth: { user: 'u', pass: 'p' } });
  });

  it('sends and logs SENT', async () => {
    m.sendMail.mockResolvedValue({});
    await sendMail('a@test.local', 'Subject', '<p>x</p>');
    expect(m.sendMail).toHaveBeenCalledWith({ from: 'TV <no-reply@test.local>', to: 'a@test.local', subject: 'Subject', html: '<p>x</p>', text: 'x' });
    expect(m.prisma.emailLog.create).toHaveBeenCalledWith({ data: { to: 'a@test.local', subject: 'Subject', status: 'SENT' } });
  });

  it('never throws on SMTP failure and logs FAILED with the error', async () => {
    m.sendMail.mockRejectedValue(new Error('auth failed'));
    await expect(sendMail('a@test.local', 'S', 'h')).resolves.toBeUndefined();
    expect(m.prisma.emailLog.create).toHaveBeenCalledWith({
      data: { to: 'a@test.local', subject: 'S', status: 'FAILED', error: 'Error: auth failed' },
    });
  });

  it('skips an empty recipient (e.g. ADMIN_NOTIFY_EMAIL not set)', async () => {
    await sendMail('', 'S', 'h');
    expect(m.sendMail).not.toHaveBeenCalled();
    expect(m.prisma.emailLog.create).not.toHaveBeenCalled();
  });
});

describe('renderEmail', () => {
  it('escapes text, splits paragraphs and renders the button', () => {
    const html = renderEmail('A & B', 'Line 1\nLine 2\n\nPara <2>', { label: 'Open "it"', url: 'https://x.test/a' });
    expect(html).toContain('A &amp; B');
    expect(html).toContain('Line 1<br>Line 2');
    expect(html).toContain('Para &lt;2&gt;');
    expect(html).toContain('href="https://x.test/a"');
    expect(html).toContain('Open &quot;it&quot;');
    expect(renderEmail('t', 'b')).not.toContain('<a ');
  });

  it('has a plain-text twin that keeps the link address (HTML-only mail scores as spam)', () => {
    const html = renderEmail('Confirm your e-mail', 'Hello Ali\n\nPlease confirm.', { label: 'Confirm', url: 'https://x.test/verify?t=1&u=2' });
    expect(html).toMatch(/^<!doctype html><html lang="[a-z]{2}"><head><meta charset="utf-8">/);
    const text = plainTextOf(html);
    expect(text).toContain('Confirm your e-mail');
    expect(text).toContain('Please confirm.');
    expect(text).toContain('Confirm: https://x.test/verify?t=1&u=2');
    expect(text).not.toMatch(/<[a-z]/i);
  });
});
