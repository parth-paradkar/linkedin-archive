import { describe, it, expect } from 'vitest';
import { slugFromUrl, parseProfile } from '../src/lib/parse';

/**
 * Fixtures reproduce the structure verified against live logged-in LinkedIn on
 * 2026-08-29: no JSON-LD, no <h1>, build-hashed class names, a hidden
 * "Company · School" summary line, and a "Contact info" anchor bracketing
 * location and company.
 */

const page = (title: string, topcard: string, extra = '') => `
<html><head><title>${title}</title></head><body><main>
  <div id="com.linkedin.sdui.profile.card.refACoAAABtopcard">${topcard}</div>
  ${extra}
</main></body></html>`;

// A 1st-degree connection with a photo. Mirrors the "Alok Kumar" profile.
const CONNECTED = page(
  'Alok Kumar | LinkedIn',
  `
  <img alt="Cover photo" src="https://media.licdn.com/dms/image/v2/AAA/profile-displaybackgroundimage-shrink_200_800/x.jpg">
  <img alt="" src="https://media.licdn.com/dms/image/v2/BBB/profile-displayphoto-shrink_100_100/x.jpg">
  <h2 class="_02484ad3 f28af954 bde9e">Alok Kumar</h2>
  <span class="_350a8c37">· 1st</span>
  <span class="_350a8c37">· 2nd</span>
  <p class="_02484ad3 c2d1c236">Building | Prev. EIR at Urban Company | IIT KGP</p>
  <p class="a1b7f320">Stealth · Indian Institute of Technology, Kharagpur</p>
  <span class="_1ce8d075">Bengaluru, Karnataka, India</span>
  <span>·</span>
  <a href="/overlay/contact-info/"><span>Contact info</span></a>
  <div><img alt="" src="https://media.licdn.com/dms/image/v2/CCC/company-logo_100_100/x.jpg"><p>Stealth</p></div>
  <div><img alt="" src="https://media.licdn.com/dms/image/v2/DDD/company-logo_100_100/y.jpg"><p>Indian Institute of Technology, Kharagpur</p></div>
  <span>500+ connections</span>
  <button>Message</button>
`,
  `<section><h2>About</h2><p>Currently in stealth - building AI.</p><button>…see more</button></section>`,
);

// A 3rd-degree profile with no photo and no About section. Mirrors "Sukhjinder Randhawa".
const DISTANT = page(
  'Sukhjinder Randhawa | LinkedIn',
  `
  <h2 class="_02484ad3">Sukhjinder Randhawa</h2>
  <span>· 3rd</span>
  <p class="c2d1c236">Head of Quality Assurance at Gourmet Investments Pvt. Ltd.</p>
  <p class="a1b7f320">Gourmet Investments Pvt. Ltd. · army public school</p>
  <span>Gurugram, Haryana, India</span>
  <span>·</span>
  <a href="/overlay/contact-info/"><span>Contact info</span></a>
  <div><img alt="" src="https://media.licdn.com/dms/image/v2/EEE/company-logo_100_100/x.jpg"><p>Gourmet Investments Pvt. Ltd.</p></div>
  <div><p>army public school</p></div>
  <span>500+</span>
  <span>connections</span>
  <button>Follow</button>
`,
);

const parse = (html: string, url: string) =>
  parseProfile(new DOMParser().parseFromString(html, 'text/html'), url);

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

describe('parseProfile on a connected profile', () => {
  const p = parse(CONNECTED, 'https://www.linkedin.com/in/alok-kumar-u/')!;

  it('takes the name from the document title, not an h1', () => {
    expect(p.name).toBe('Alok Kumar');
  });

  it('skips degree markers to find the headline', () => {
    expect(p.headline).toBe('Building | Prev. EIR at Urban Company | IIT KGP');
  });

  it('skips the hidden company-and-school summary when reading location', () => {
    expect(p.location).toBe('Bengaluru, Karnataka, India');
  });

  it('reads the company from just after the Contact info anchor', () => {
    expect(p.company).toBe('Stealth');
  });

  it('picks the avatar, not the cover photo', () => {
    expect(p.photoUrl).toContain('profile-displayphoto');
    expect(p.photoUrl).not.toContain('backgroundimage');
  });

  it('reads About and drops the see-more control', () => {
    expect(p.about).toBe('Currently in stealth - building AI.');
  });

  it('normalises the URL', () => {
    expect(p.url).toBe('https://www.linkedin.com/in/alok-kumar-u');
  });
});

describe('parseProfile on a distant profile', () => {
  const p = parse(DISTANT, 'https://www.linkedin.com/in/sukhjinder-randhawa-b2b883117')!;

  it('reads name, headline, location, and company', () => {
    expect(p.name).toBe('Sukhjinder Randhawa');
    expect(p.headline).toBe('Head of Quality Assurance at Gourmet Investments Pvt. Ltd.');
    expect(p.location).toBe('Gurugram, Haryana, India');
    expect(p.company).toBe('Gourmet Investments Pvt. Ltd.');
  });

  it('leaves the photo empty when the profile has none', () => {
    expect(p.photoUrl).toBe('');
  });

  it('leaves About empty when the section is absent', () => {
    expect(p.about).toBe('');
  });
});

describe('parseProfile degradation', () => {
  it('falls back to the slug when there is no title and no topcard', () => {
    const p = parse('<html><body></body></html>', 'https://www.linkedin.com/in/ghost')!;
    expect(p.name).toBe('ghost');
    expect(p.headline).toBe('');
    expect(p.company).toBe('');
    expect(p.photoUrl).toBe('');
  });

  it('still reads the name when the topcard has not rendered yet', () => {
    const p = parse('<html><head><title>Jane Doe | LinkedIn</title></head><body></body></html>',
      'https://www.linkedin.com/in/jane')!;
    expect(p.name).toBe('Jane Doe');
    expect(p.headline).toBe('');
  });

  it('returns null when the URL is not a profile', () => {
    expect(parse(CONNECTED, 'https://www.linkedin.com/feed/')).toBeNull();
  });
});
