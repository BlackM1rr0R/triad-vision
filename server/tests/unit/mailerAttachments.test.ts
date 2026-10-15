import { describe, expect, it, vi } from 'vitest';

// Attachments go through nodemailer unchanged; existing calls without attachments are unaffected.
const m = vi.hoisted(() => ({ prisma: { emailLog: { create: vi.fn() } }, sendMail: vi.fn(), createTransport: vi.fn() }));
vi.mock('../../src/db.js', () => ({ prisma: m.prisma }));
vi.mock('nodemailer', () => ({ default: { createTransport: m.createTransport } }));
vi.mock('../../src/config.js', async (importOriginal) => {
  const { config } = await importOriginal<typeof import('../../src/config.js')>();
  return { config: { ...config, smtp: { ...config.smtp, host: 'smtp.test.local', from: 'TV <no-reply@test.local>' } } };
});
m.createTransport.mockReturnValue({ sendMail: m.sendMail });

const { sendMail } = await import('../../src/lib/mailer.js');

describe('sendMail attachments', () => {
  it('passes attachments to the transport and keeps the file name header-safe', async () => {
    m.sendMail.mockResolvedValue({});
    const pdf = Buffer.from('%PDF-1.7');
    await sendMail('a@test.local', 'S', '<p>x</p>', [{ filename: 'Rechnung\r\n1.pdf', content: pdf, contentType: 'application/pdf' }]);
    expect(m.sendMail).toHaveBeenCalledWith({
      from: 'TV <no-reply@test.local>',
      to: 'a@test.local',
      subject: 'S',
      html: '<p>x</p>',
      attachments: [{ filename: 'Rechnung 1.pdf', content: pdf, contentType: 'application/pdf' }],
    });
  });

  it('sends no attachments key when there are none', async () => {
    m.sendMail.mockReset().mockResolvedValue({});
    await sendMail('a@test.local', 'S', 'h', []);
    expect(m.sendMail.mock.calls[0][0]).not.toHaveProperty('attachments');
  });
});
