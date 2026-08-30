/** A saved profile: scraped snapshot plus user data plus bookkeeping. */
export type Profile = {
  /** Primary key. The `<slug>` in linkedin.com/in/<slug>. */
  slug: string;
  url: string;
  name: string;
  headline: string;
  company: string;
  role: string;
  location: string;
  about: string;
  /** LinkedIn CDN URL. Not image bytes. */
  photoUrl: string;
  /** ISO 8601. Set once, on first save. */
  savedAt: string;
  /** ISO 8601. Bumped on re-scrape and on note or tag edits. */
  updatedAt: string;
  tags: string[];
  note: string;
};

/** The subset of Profile that comes from scraping the page. */
export type ScrapedProfile = Pick<
  Profile,
  'slug' | 'url' | 'name' | 'headline' | 'company' | 'role' | 'location' | 'about' | 'photoUrl'
>;
