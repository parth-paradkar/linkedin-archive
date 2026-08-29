import { describe, it, expect } from 'vitest';
import { slugFromUrl, parseProfile } from '../src/lib/parse';

const parse = (html: string, url: string) =>
  parseProfile(new DOMParser().parseFromString(html, 'text/html'), url);

const JSON_LD_PAGE = `
<html><head>
<script type="application/ld+json">
{"@context":"http://schema.org","@graph":[
  {"@type":"WebPage","url":"https://www.linkedin.com/in/janedoe"},
  {"@type":"Person",
   "name":"Jane Doe",
   "jobTitle":["Staff Engineer"],
   "worksFor":[{"@type":"Organization","name":"Acme Corp"}],
   "address":{"@type":"PostalAddress","addressLocality":"Berlin","addressCountry":"DE"},
   "image":{"@type":"ImageObject","contentUrl":"https://media.licdn.com/jane.jpg"},
   "description":"Building reliable systems."}
]}
</script>
</head><body>
<main><h1>Jane Doe</h1>
<div class="text-body-medium break-words">Staff Engineer at Acme Corp</div>
</main>
</body></html>`;

const DOM_ONLY_PAGE = `
<html><body><main>
<h1>  John Smith  </h1>
<div class="text-body-medium break-words">Designer at Globex</div>
<span class="text-body-small inline t-black--light break-words">Lisbon, Portugal</span>
<img class="pv-top-card-profile-picture__image" src="https://media.licdn.com/john.jpg">
<section><div id="about"></div><p>Ten years of product design.</p></section>
</main></body></html>`;

describe('slugFromUrl', () => {
  it('extracts the slug', () => {
    expect(slugFromUrl('https://www.linkedin.com/in/janedoe/')).toBe('janedoe');
  });

  it('ignores query strings and subpaths', () => {
    expect(slugFromUrl('https://www.linkedin.com/in/jane-doe-1a2b/details/experience?x=1')).toBe(
      'jane-doe-1a2b',
    );
  });

  it('returns null off a profile page', () => {
    expect(slugFromUrl('https://www.linkedin.com/feed/')).toBeNull();
  });
});

describe('parseProfile', () => {
  it('prefers JSON-LD', () => {
    const p = parse(JSON_LD_PAGE, 'https://www.linkedin.com/in/janedoe/')!;
    expect(p.slug).toBe('janedoe');
    expect(p.url).toBe('https://www.linkedin.com/in/janedoe');
    expect(p.name).toBe('Jane Doe');
    expect(p.role).toBe('Staff Engineer');
    expect(p.company).toBe('Acme Corp');
    expect(p.location).toBe('Berlin, DE');
    expect(p.photoUrl).toBe('https://media.licdn.com/jane.jpg');
    expect(p.headline).toBe('Staff Engineer at Acme Corp');
  });

  it('falls back to DOM selectors when JSON-LD is absent', () => {
    const p = parse(DOM_ONLY_PAGE, 'https://www.linkedin.com/in/johnsmith')!;
    expect(p.name).toBe('John Smith');
    expect(p.headline).toBe('Designer at Globex');
    expect(p.location).toBe('Lisbon, Portugal');
    expect(p.photoUrl).toBe('https://media.licdn.com/john.jpg');
    expect(p.about).toBe('Ten years of product design.');
  });

  it('degrades to the slug rather than throwing on an empty page', () => {
    const p = parse('<html><body></body></html>', 'https://www.linkedin.com/in/ghost')!;
    expect(p.name).toBe('ghost');
    expect(p.headline).toBe('');
    expect(p.company).toBe('');
  });

  it('survives malformed JSON-LD', () => {
    const html = `<html><head><script type="application/ld+json">{ not json </script></head>
      <body><main><h1>Fallback Name</h1></main></body></html>`;
    expect(parse(html, 'https://www.linkedin.com/in/x')!.name).toBe('Fallback Name');
  });

  it('returns null when the URL is not a profile', () => {
    expect(parse(JSON_LD_PAGE, 'https://www.linkedin.com/feed/')).toBeNull();
  });
});
