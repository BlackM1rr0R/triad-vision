import { describe, expect, it } from 'vitest';
import { EMBED_SIZES, embedPath, embedSnippet, embedUrl, embedUtm, isEmbedWidget } from './embeds';

describe('embeds', () => {
  it('builds the widget URL per language and theme', () => {
    expect(embedPath('salary-calculator', 'az')).toBe('/embed/salary-calculator');
    expect(embedPath('blue-card-check', 'de')).toBe('/de/embed/blue-card-check');
    expect(embedUrl('https://triad-vision.de/', 'which-city', 'uk', 'auto')).toBe('https://triad-vision.de/uk/embed/which-city');
    expect(embedUrl('https://triad-vision.de', 'which-city', 'en', 'dark')).toBe('https://triad-vision.de/en/embed/which-city?theme=dark');
  });

  it('knows only its widgets', () => {
    expect(isEmbedWidget('salary-calculator')).toBe(true);
    expect(isEmbedWidget('admin')).toBe(false);
    expect(isEmbedWidget(undefined)).toBe(false);
  });

  it('renders a lazy, borderless iframe with an escaped title', () => {
    const html = embedSnippet({ origin: 'https://triad-vision.de', widget: 'salary-calculator', lng: 'de', theme: 'light', size: EMBED_SIZES['salary-calculator'][0], title: 'A "quoted" <title>', autoResize: false });
    expect(html).toBe(
      '<iframe src="https://triad-vision.de/de/embed/salary-calculator?theme=light" title="A &quot;quoted&quot; &lt;title>" width="360" height="640" style="border:0;max-width:100%;" loading="lazy" data-tv-embed="salary-calculator"></iframe>',
    );
    expect(html).not.toContain('<script');
  });

  it('adds a resize script that only trusts our origin', () => {
    const html = embedSnippet({ origin: 'https://triad-vision.de', widget: 'which-city', lng: 'az', theme: 'auto', size: EMBED_SIZES['which-city'][2], title: 'x', autoResize: true });
    expect(html).toContain('width="100%"');
    expect(html).toContain('width:100%;');
    expect(html).toContain('e.origin!=="https://triad-vision.de"');
    expect(html).toContain('tv-embed-height');
  });

  it('tags the links back with the embedding host', () => {
    expect(embedUtm('https://www.example-blog.com/post/1', 'salary-calculator')).toBe('utm_source=embed&utm_medium=widget&utm_campaign=example-blog.com&utm_content=salary-calculator');
    expect(embedUtm('', 'which-city')).toContain('utm_campaign=unknown');
    expect(embedUtm('not a url', 'which-city')).toContain('utm_campaign=unknown');
  });
});
