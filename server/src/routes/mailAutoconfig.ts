import express, { Router, type Request, type Response } from 'express';
import { limiter } from '../lib/http.js';
import { stalwartDomain, stalwartMailHost } from '../lib/stalwart/config.js';

/**
 * Mail client autoconfiguration for our own domain, so Thunderbird, Outlook and other mail apps find the
 * IMAP/SMTP settings from just e-mail + password. Public, no session. Caddy routes these URLs here:
 *
 *   https://autoconfig.<domain>/mail/config-v1.1.xml                  (Thunderbird / many Android apps)
 *   https://<domain>/.well-known/autoconfig/mail/config-v1.1.xml      (Thunderbird fallback)
 *   https://autodiscover.<domain>/autodiscover/autodiscover.xml       (Outlook "POX" autodiscover, POST)
 *   https://<domain>/autodiscover/autodiscover.xml                    (Outlook tries the domain first)
 *
 * The values are the same as the admin "client settings": IMAP 993 and SMTP 465, both implicit TLS,
 * username = the full address. Mounted at /api/mail-autoconfig.
 */
export const mailAutoconfigRouter = Router();

const xmlLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const sendXml = (res: Response, xml: string, status = 200) => {
  res.status(status).type('application/xml; charset=utf-8').setHeader('Cache-Control', 'public, max-age=3600');
  res.send(xml);
};

/** Thunderbird autoconfig (clientConfig v1.1). */
export const thunderbirdXml = () => {
  const domain = esc(stalwartDomain());
  const host = esc(stalwartMailHost());
  const server = (el: 'incomingServer' | 'outgoingServer', type: string, port: number) =>
    [
      `    <${el} type="${type}">`,
      `      <hostname>${host}</hostname>`,
      `      <port>${port}</port>`,
      '      <socketType>SSL</socketType>',
      '      <authentication>password-cleartext</authentication>',
      '      <username>%EMAILADDRESS%</username>',
      `    </${el}>`,
    ].join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<clientConfig version="1.1">',
    `  <emailProvider id="${domain}">`,
    `    <domain>${domain}</domain>`,
    `    <displayName>${domain}</displayName>`,
    `    <displayShortName>${domain}</displayShortName>`,
    server('incomingServer', 'imap', 993),
    server('outgoingServer', 'smtp', 465),
    '  </emailProvider>',
    '</clientConfig>',
    '',
  ].join('\n');
};

const RESPONSE_NS = 'http://schemas.microsoft.com/exchange/autodiscover/responseschema/2006';
const OUTLOOK_NS = 'http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a';

/** The address in an Outlook autodiscover request body (<EMailAddress>…</EMailAddress>), lower-cased. */
export const requestedAddress = (body: unknown) => {
  const text = typeof body === 'string' ? body.slice(0, 16_000) : '';
  const m = text.match(/<(?:\w+:)?EMailAddress>\s*([^<\s]{3,190})\s*<\/(?:\w+:)?EMailAddress>/i);
  return m?.[1]?.toLowerCase() ?? '';
};

/** Outlook "POX" autodiscover answer (IMAP + SMTP, SSL on, login = the full address). */
export const autodiscoverXml = (email: string) => {
  const host = esc(stalwartMailHost());
  const login = email ? `        <LoginName>${esc(email)}</LoginName>\n` : '';
  const protocol = (type: 'IMAP' | 'SMTP', port: number) =>
    [
      '      <Protocol>',
      `        <Type>${type}</Type>`,
      `        <Server>${host}</Server>`,
      `        <Port>${port}</Port>`,
      '        <DomainRequired>off</DomainRequired>',
      login.trimEnd() || null,
      '        <SPA>off</SPA>',
      '        <SSL>on</SSL>',
      '        <AuthRequired>on</AuthRequired>',
      type === 'SMTP' ? '        <UsePOPAuth>on</UsePOPAuth>' : null,
      '      </Protocol>',
    ]
      .filter((l): l is string => l !== null)
      .join('\n');
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<Autodiscover xmlns="${RESPONSE_NS}">`,
    `  <Response xmlns="${OUTLOOK_NS}">`,
    '    <Account>',
    '      <AccountType>email</AccountType>',
    '      <Action>settings</Action>',
    protocol('IMAP', 993),
    protocol('SMTP', 465),
    '    </Account>',
    '  </Response>',
    '</Autodiscover>',
    '',
  ].join('\n');
};

/** Autodiscover error answer (e.g. an address that is not on our domain). */
const autodiscoverError = (code: string, message: string) =>
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<Autodiscover xmlns="${RESPONSE_NS}">`,
    '  <Response>',
    `    <Error Time="${new Date().toISOString().slice(11, 19)}" Id="1">`,
    `      <ErrorCode>${code}</ErrorCode>`,
    `      <Message>${esc(message)}</Message>`,
    '      <DebugData />',
    '    </Error>',
    '  </Response>',
    '</Autodiscover>',
    '',
  ].join('\n');

const tb = (_req: Request, res: Response) => sendXml(res, thunderbirdXml());
mailAutoconfigRouter.get('/mail/config-v1.1.xml', xmlLimiter, tb);
mailAutoconfigRouter.get('/.well-known/autoconfig/mail/config-v1.1.xml', xmlLimiter, tb);

const autodiscover = (req: Request, res: Response) => {
  const email = requestedAddress(req.body);
  const ours = !email || email.endsWith(`@${stalwartDomain()}`);
  if (!ours) return sendXml(res, autodiscoverError('600', 'Invalid Request'));
  sendXml(res, autodiscoverXml(email));
};
const xmlBody = express.text({ type: ['text/xml', 'application/xml', 'text/plain'], limit: '16kb' });
// Outlook spells the path in different cases (Autodiscover/Autodiscover.xml): Express routing is case-insensitive.
mailAutoconfigRouter.post('/autodiscover/autodiscover.xml', xmlLimiter, xmlBody, autodiscover);
mailAutoconfigRouter.get('/autodiscover/autodiscover.xml', xmlLimiter, autodiscover);
