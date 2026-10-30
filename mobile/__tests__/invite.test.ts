import { smsUrl, waPhone, whatsappUrl } from '@/lib/invite';

describe('invite links', () => {
  it('turns local and international numbers into WhatsApp digits', () => {
    expect(waPhone('050 123 45 67')).toBe('994501234567');
    expect(waPhone('+994 50 123 45 67')).toBe('994501234567');
    expect(waPhone('00994501234567')).toBe('994501234567');
    expect(waPhone('501234567')).toBe('994501234567');
    expect(waPhone('+49 30 1234567')).toBe('49301234567');
    expect(waPhone('123')).toBeNull();
    expect(waPhone(null)).toBeNull();
  });

  it('builds WhatsApp and SMS links with the message', () => {
    expect(whatsappUrl('994501234567', 'Hi & bye')).toBe('whatsapp://send?phone=994501234567&text=Hi%20%26%20bye');
    expect(whatsappUrl(null, 'x')).toBe('whatsapp://send?text=x');
    expect(smsUrl('+994 50 123', 'Hi', 'ios')).toBe('sms:+99450123&body=Hi');
    expect(smsUrl('+994 50 123', 'Hi', 'android')).toBe('sms:+99450123?body=Hi');
  });
});
