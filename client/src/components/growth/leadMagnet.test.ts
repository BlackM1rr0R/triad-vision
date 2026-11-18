import { describe, expect, it } from 'vitest';
import { pickMagnet, type PublicLeadMagnet } from './LeadMagnetBlock';

// QA PUB-6: the guide pages read the starter e-book from the public list instead of GET /lead-magnets/:slug (404).
const book = (slug: string, fileLocale: string | null): PublicLeadMagnet => ({ slug, title: slug, description: '', coverUrl: null, locales: [], fileLocale });

describe('pickMagnet', () => {
  it('finds a published e-book with a file', () => {
    expect(pickMagnet([book('a', 'az'), book('germany-relocation-guide-2026', 'de')], 'germany-relocation-guide-2026')?.fileLocale).toBe('de');
  });
  it('is null when the e-book is missing, has no file or the list has not loaded', () => {
    expect(pickMagnet([book('a', 'az')], 'b')).toBeNull();
    expect(pickMagnet([book('b', null)], 'b')).toBeNull();
    expect(pickMagnet(undefined, 'b')).toBeNull();
  });
});
