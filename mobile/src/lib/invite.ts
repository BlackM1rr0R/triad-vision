/**
 * "Invite friends" helpers (pure): phone numbers for WhatsApp / SMS deep links and the links themselves.
 * Picked contacts stay on the phone — nothing about them is sent to the server.
 */

/**
 * International digits for wa.me / whatsapp:// (no "+", no spaces). A local Azerbaijani number
 * ("050 123 45 67", 10 digits starting with 0) gets the 994 country code; "00…" becomes the plain code.
 * Returns null when too short to be a phone number.
 */
export const waPhone = (raw: string | null | undefined) => {
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.length === 10 && d.startsWith('0')) d = `994${d.slice(1)}`;
  else if (d.length === 9 && /^[1-9]/.test(d) && !(raw ?? '').trim().startsWith('+')) d = `994${d}`;
  return d.length >= 9 ? d : null;
};

export const whatsappUrl = (phone: string | null, text: string) =>
  phone ? `whatsapp://send?phone=${phone}&text=${encodeURIComponent(text)}` : `whatsapp://send?text=${encodeURIComponent(text)}`;

/** sms: link with a prefilled body (iOS wants "&body=", Android "?body="). */
export const smsUrl = (rawPhone: string, text: string, os: 'ios' | 'android' | string) => {
  const phone = rawPhone.replace(/[^\d+]/g, '');
  return `sms:${phone}${os === 'ios' ? '&' : '?'}body=${encodeURIComponent(text)}`;
};
