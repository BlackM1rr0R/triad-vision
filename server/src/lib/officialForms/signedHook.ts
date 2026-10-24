/**
 * E-signature completion hook for official forms (one line in lib/esign/service.ts afterCompletion): an employer
 * signed an "Erklärung zum Beschäftigungsverhältnis" → the fill becomes SIGNED, the signed PDF goes into the case's
 * drive folder and staff are notified. Loaded lazily: the official forms service imports the e-signature service.
 * Never throws (the completion must not fail because of it).
 */
export const officialFormSigned = async (requestId: string, pdf: Buffer) => {
  try {
    const { onFormSigned } = await import('./service.js');
    await onFormSigned(requestId, pdf);
  } catch (err) {
    console.error('[officialForms] signed hook failed', requestId, err);
  }
};
