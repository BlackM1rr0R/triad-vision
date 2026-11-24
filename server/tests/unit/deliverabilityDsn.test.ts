import { describe, expect, it } from 'vitest';
import { parseDeliveryReport, smtpRejectKind, statusKind, type ReportInput } from '../../src/lib/deliverability/dsn.js';
import { evaluateDkim, evaluateDmarc, evaluateSpf } from '../../src/lib/deliverability/dns.js';

const base = (over: Partial<ReportInput>): ReportInput => ({ fromAddr: null, subject: null, contentType: null, text: null, parts: [], ownDomains: ['triad-vision.de'], ...over });

const DSN = [
  'Reporting-MTA: dns; mx.triad-vision.de',
  'Arrival-Date: Mon, 23 Nov 2026 10:00:00 +0000',
  '',
  'Final-Recipient: rfc822; jobs@firma-beispiel.de',
  'Action: failed',
  'Status: 5.1.1',
  'Diagnostic-Code: smtp; 550 5.1.1 <jobs@firma-beispiel.de>: Recipient address rejected:',
  '  User unknown in virtual mailbox table',
  '',
  'Final-Recipient: rfc822; hr@other-firm.de',
  'Action: delayed',
  'Status: 4.4.1',
  '',
  'Final-Recipient: rfc822; ok@third.de',
  'Action: delivered',
  'Status: 2.0.0',
].join('\n');

describe('delivery reports (DSN)', () => {
  it('reads failed and delayed recipients from a multipart/report', () => {
    const r = parseDeliveryReport(
      base({
        fromAddr: 'MAILER-DAEMON@mx.triad-vision.de',
        subject: 'Undelivered Mail Returned to Sender',
        contentType: 'multipart/report; report-type=delivery-status',
        parts: [
          { contentType: 'message/delivery-status', content: DSN },
          { contentType: 'text/rfc822-headers', content: 'From: Triad Vision <no-reply@triad-vision.de>\nTo: jobs@firma-beispiel.de\nMessage-ID: <xapp.abc.123@triad-vision.de>\nSubject: Bewerbung' },
        ],
      }),
    );
    expect(r?.type).toBe('BOUNCE');
    if (r?.type !== 'BOUNCE') return;
    expect(r.originalMessageId).toBe('xapp.abc.123@triad-vision.de');
    expect(r.recipients).toEqual([
      expect.objectContaining({ address: 'jobs@firma-beispiel.de', kind: 'HARD', status: '5.1.1', suppress: true }),
      expect.objectContaining({ address: 'hr@other-firm.de', kind: 'SOFT', status: '4.4.1', suppress: false }),
    ]);
    expect(r.recipients[0]!.diagnostic).toContain('User unknown');
  });

  it('reads DSN fields that mailparser merged into the text', () => {
    const r = parseDeliveryReport(base({ fromAddr: 'postmaster@outlook.com', subject: 'Undeliverable: Bewerbung', text: `Delivery has failed.\n\n${DSN}` }));
    expect(r?.type === 'BOUNCE' && r.recipients.map((x) => x.address)).toEqual(['jobs@firma-beispiel.de', 'hr@other-firm.de']);
  });

  it('5.7.x policy blocks are hard but do not suppress the address', () => {
    const dsn = 'Final-Recipient: rfc822; info@strict.de\nAction: failed\nStatus: 5.7.1\nDiagnostic-Code: smtp; 550 5.7.1 rejected by spam filter';
    const r = parseDeliveryReport(base({ contentType: 'multipart/report; report-type=delivery-status', parts: [{ contentType: 'message/delivery-status', content: dsn }] }));
    expect(r?.type === 'BOUNCE' && r.recipients[0]).toMatchObject({ kind: 'HARD', suppress: false, status: '5.7.1' });
  });

  it('plain-text bounces: the foreign address next to the error code, never our own', () => {
    const text = [
      'This is the mail system at host mail.example.net.',
      "I'm sorry to have to inform you that your message could not be delivered.",
      '',
      '<bewerbung@kleinfirma.de>: host mx.kleinfirma.de said: 550 5.1.1 mailbox does not exist',
      '',
      'From: no-reply@triad-vision.de',
    ].join('\n');
    const r = parseDeliveryReport(base({ fromAddr: 'MAILER-DAEMON@mail.example.net', subject: 'Mail delivery failed: returning message to sender', text }));
    expect(r?.type === 'BOUNCE' && r.recipients).toEqual([expect.objectContaining({ address: 'bewerbung@kleinfirma.de', kind: 'HARD', status: '5.1.1' })]);
  });

  it('ignores ordinary mail (an employer answer is not a bounce)', () => {
    expect(parseDeliveryReport(base({ fromAddr: 'hr@firma.de', subject: 'AW: Bewerbung als Fahrer', text: 'Sehr geehrte Damen und Herren, 550 Euro …' }))).toBeNull();
  });

  it('reads spam complaints (ARF)', () => {
    const r = parseDeliveryReport(
      base({
        fromAddr: 'fbl@provider.example',
        contentType: 'multipart/report; report-type=feedback-report',
        parts: [
          { contentType: 'message/feedback-report', content: 'Feedback-Type: abuse\nUser-Agent: SomeFBL/1.0\nVersion: 1\nOriginal-Mail-From: <bounce@triad-vision.de>\nOriginal-Rcpt-To: <client@gmail.com>' },
          { contentType: 'message/rfc822', content: 'From: no-reply@triad-vision.de\nTo: client@gmail.com\nMessage-ID: <camp.1@triad-vision.de>\n\nhello' },
        ],
      }),
    );
    expect(r).toEqual({ type: 'COMPLAINT', recipients: [{ address: 'client@gmail.com', feedbackType: 'abuse' }], originalMessageId: 'camp.1@triad-vision.de' });
  });

  it('status classes', () => {
    expect(statusKind('5.1.1')).toEqual({ kind: 'HARD', suppress: true });
    expect(statusKind('4.2.2')).toEqual({ kind: 'SOFT', suppress: false });
    expect(statusKind('2.0.0')).toBeNull();
  });
});

describe('SMTP rejects while sending', () => {
  it('only recipient problems count', () => {
    expect(smtpRejectKind(550, '550 5.1.1 <x@y.de>: Recipient address rejected: User unknown')).toBe('HARD');
    expect(smtpRejectKind(550, '550 Requested action not taken: mailbox unavailable')).toBe('HARD');
    expect(smtpRejectKind(535, '535 5.7.8 Authentication credentials invalid')).toBeNull();
    expect(smtpRejectKind(554, '554 5.7.1 Relay access denied')).toBeNull();
    expect(smtpRejectKind(451, '451 4.3.0 Temporary failure')).toBeNull();
    expect(smtpRejectKind(undefined, 'connection timeout')).toBeNull();
  });
});

describe('SPF / DMARC / DKIM evaluation', () => {
  it('SPF', () => {
    expect(evaluateSpf(['v=spf1 mx a:mail.triad-vision.de -all']).status).toBe('OK');
    expect(evaluateSpf(['google-site-verification=abc']).status).toBe('MISSING');
    expect(evaluateSpf(['v=spf1 mx ~all', 'v=spf1 -all']).warnings).toContain('SPF_MULTIPLE');
    expect(evaluateSpf(['v=spf1 +all']).warnings).toContain('SPF_PASS_ALL');
    expect(evaluateSpf(['v=spf1 mx ?all']).warnings).toContain('SPF_NEUTRAL');
    expect(evaluateSpf(['v=spf1 mx']).warnings).toContain('SPF_NO_ALL');
  });
  it('DMARC', () => {
    expect(evaluateDmarc(['v=DMARC1; p=reject; rua=mailto:dmarc@triad-vision.de'])).toMatchObject({ status: 'OK', policy: 'reject' });
    expect(evaluateDmarc(['v=DMARC1; p=none'])).toMatchObject({ status: 'WARN', warnings: ['DMARC_POLICY_NONE', 'DMARC_NO_RUA'] });
    expect(evaluateDmarc([]).status).toBe('MISSING');
    expect(evaluateDmarc(['v=DMARC1; p=maybe']).status).toBe('ERROR');
  });
  it('DKIM', () => {
    expect(evaluateDkim([{ selector: 'default', records: ['v=DKIM1; k=rsa; p=MIIBIjAN'] }])).toMatchObject({ status: 'OK', selectors: ['default'] });
    expect(evaluateDkim([{ selector: 'default', records: ['v=DKIM1; p='] }]).status).toBe('MISSING');
    expect(evaluateDkim([{ selector: 'mail', records: [] }]).status).toBe('MISSING');
  });
});
