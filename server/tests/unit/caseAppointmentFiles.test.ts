import { describe, expect, it } from 'vitest';
import { appointmentDocName, APPOINTMENT_DOC_TITLE, isAppointmentDocName } from '../../src/lib/caseAppointment/files.js';

describe('appointment file names', () => {
  it('first file: title + extension', () => {
    expect(appointmentDocName('Termin Bestätigung.PDF', [])).toBe(`${APPOINTMENT_DOC_TITLE}.pdf`);
    expect(appointmentDocName('scan.jpeg', [])).toBe(`${APPOINTMENT_DOC_TITLE}.jpeg`);
  });

  it('a name already taken gets (2), (3) …', () => {
    const one = `${APPOINTMENT_DOC_TITLE}.pdf`;
    const two = `${APPOINTMENT_DOC_TITLE} (2).pdf`;
    expect(appointmentDocName('a.pdf', [one])).toBe(two);
    expect(appointmentDocName('b.pdf', [one, two])).toBe(`${APPOINTMENT_DOC_TITLE} (3).pdf`);
    expect(appointmentDocName('c.png', [one])).toBe(`${APPOINTMENT_DOC_TITLE}.png`); // other extension: free
  });

  it('strips odd characters from the extension and works without one', () => {
    expect(appointmentDocName('x.p d$f', [])).toBe(`${APPOINTMENT_DOC_TITLE}.pdf`);
    expect(appointmentDocName('noext', [])).toBe(APPOINTMENT_DOC_TITLE);
  });

  it('isAppointmentDocName recognises the marker', () => {
    expect(isAppointmentDocName(`${APPOINTMENT_DOC_TITLE} (2).pdf`)).toBe(true);
    expect(isAppointmentDocName('passport.pdf')).toBe(false);
  });
});
