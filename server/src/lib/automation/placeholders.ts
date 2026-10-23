import type { Locale } from '@prisma/client';
import { config } from '../../config.js';
import { formatDateTime } from '../notifications.js';
import { STATUS_LABELS, VISA_TYPE_LABELS } from '../register/labels.js';
import type { AutoContext } from './context.js';

/**
 * The fixed placeholder set of automation templates ({{client.firstName}} …). The editor offers them in a
 * picker; anything else renders as an empty string, so a typo can never leak raw braces or "undefined".
 */
export const PLACEHOLDER_KEYS = [
  'client.firstName',
  'client.lastName',
  'client.fullName',
  'client.email',
  'client.phone',
  'case.number',
  'case.status',
  'case.profession',
  'case.visaType',
  'case.visaCategory',
  'case.link',
  'staff.fullName',
  'staff.firstName',
  'appointment.date',
  'appointment.place',
  'document.name',
  'document.title',
  'document.note',
  'contract.signedAt',
  'application.status',
  'application.vacancy',
  'booking.date',
  'inquiry.name',
  'inquiry.company',
  'inquiry.email',
  'inquiry.message',
  'trigger.days',
  'today',
] as const;
export type PlaceholderKey = (typeof PLACEHOLDER_KEYS)[number];

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.]{0,40})\s*\}\}/g;

const fmtDay = (d: Date, locale: Locale) =>
  new Intl.DateTimeFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale], { dateStyle: 'long', timeZone: 'Asia/Baku' }).format(d);

const l10n = (v: unknown, locale: Locale) => {
  if (!v || typeof v !== 'object') return typeof v === 'string' ? v : '';
  const o = v as Record<string, string>;
  return o[locale] || o.de || o.en || o.az || o.ru || '';
};

/** Values of every placeholder for one context, in `locale` (client's language for client texts, staff's for staff). */
export const placeholderValues = (ctx: AutoContext, locale: Locale): Record<PlaceholderKey, string> => {
  const c = ctx.case;
  const r = ctx.recipient;
  const first = c?.client.firstName ?? r?.firstName ?? '';
  const last = c?.client.lastName ?? r?.lastName ?? '';
  const appointmentAt = c?.appointmentAt ?? null;
  return {
    'client.firstName': first,
    'client.lastName': last,
    'client.fullName': `${first} ${last}`.trim(),
    'client.email': c?.client.email ?? r?.email ?? '',
    'client.phone': c?.client.phone ?? r?.phone ?? '',
    'case.number': c?.number ?? '',
    'case.status': c ? STATUS_LABELS[locale][c.status] : '',
    'case.profession': c?.profession ?? '',
    'case.visaType': c ? VISA_TYPE_LABELS[locale][c.visaType] : '',
    'case.visaCategory': c?.visaCategory ? `${c.visaCategory.visaLabel} ${l10n(c.visaCategory.title, locale)}`.trim() : '',
    'case.link': c ? `${config.clientUrl}/admin/cases/${c.id}` : '',
    'staff.fullName': c?.assignedStaff ? `${c.assignedStaff.firstName} ${c.assignedStaff.lastName}`.trim() : '',
    'staff.firstName': c?.assignedStaff?.firstName ?? '',
    'appointment.date': appointmentAt ? formatDateTime(appointmentAt, locale) : '',
    'appointment.place': c?.appointmentPlace ?? '',
    'document.name': ctx.document?.originalName ?? '',
    'document.title': ctx.document ? l10n(ctx.document.requirementTitle, locale) || ctx.document.originalName : '',
    'document.note': ctx.document?.reviewNote ?? '',
    'contract.signedAt': c?.contract?.signedAt ? fmtDay(c.contract.signedAt, locale) : '',
    'application.status': ctx.application?.status ?? '',
    'application.vacancy': ctx.application?.vacancyTitle ?? '',
    'booking.date': ctx.booking ? formatDateTime(ctx.booking.startsAt, locale) : '',
    'inquiry.name': ctx.inquiry?.contactName ?? '',
    'inquiry.company': ctx.inquiry?.companyName ?? '',
    'inquiry.email': ctx.inquiry?.email ?? '',
    'inquiry.message': ctx.inquiry?.message.slice(0, 1000) ?? '',
    'trigger.days': typeof ctx.payload.days === 'number' ? String(ctx.payload.days) : '',
    today: fmtDay(new Date(), locale),
  };
};

export const renderAutomationTemplate = (template: string, values: Record<string, string>) =>
  template.replace(PLACEHOLDER, (_m, name: string) => values[name] ?? '');

/** Placeholders in a template that are not in the fixed set (validation on save). */
export const unknownPlaceholders = (template: string) =>
  [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]))].filter((k) => !(PLACEHOLDER_KEYS as readonly string[]).includes(k));
