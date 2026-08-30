import { parseProfile, slugFromUrl } from '../lib/parse';
import { send } from '../lib/messages';

const STYLE = `
.lia-pill {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
  display: flex; gap: 8px; align-items: center;
  padding: 10px 16px; border: 0; border-radius: 999px;
  font: 600 14px/1 system-ui, -apple-system, sans-serif;
  color: #fff; background: #0a66c2; cursor: pointer;
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.25);
}
.lia-pill:hover { background: #004182; }
.lia-pill[data-state="saved"] { background: #057642; }
.lia-pill[data-state="error"] { background: #b24020; }
.lia-pill[disabled] { opacity: 0.7; cursor: default; }
`;

const SAVE_LABEL = 'Save to Archive';
const SAVED_LABEL = 'Saved ✓ · Open note';
const UPDATED_LABEL = 'Updated ✓';

/**
 * LinkedIn renders the top card after this script runs, and how long that takes
 * varies with connection and cache. So a revisit polls until the scrape yields
 * something rather than sleeping for a guessed interval.
 */
const POLL_MS = 250;
const RENDER_TIMEOUT_MS = 8000;
const FLASH_MS = 2000;

let host: HTMLElement | null = null;
let button: HTMLButtonElement | null = null;

function mount(): HTMLButtonElement {
  if (button) return button;
  host = document.createElement('div');
  host.id = 'lia-host';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  button = document.createElement('button');
  button.className = 'lia-pill';
  root.append(style, button);
  document.body.append(host);
  button.addEventListener('click', onClick);
  return button;
}

function setState(state: 'save' | 'saved' | 'busy' | 'error', label: string) {
  const b = mount();
  b.dataset.state = state;
  b.textContent = label;
  b.disabled = state === 'busy';
}

async function onClick() {
  const slug = slugFromUrl(location.href);
  if (!slug) return;

  if (button?.dataset.state === 'saved') {
    await send({ type: 'openViewer', slug });
    return;
  }

  setState('busy', 'Saving…');
  try {
    const scraped = parseProfile(document, location.href);
    if (!scraped) throw new Error('not a profile page');
    await send({ type: 'saveProfile', scraped });
    setState('saved', SAVED_LABEL);
  } catch (e) {
    setState('error', 'Save failed — retry');
    console.error('[LinkedIn Archive]', e);
  }
}

/** Still looking at the profile this run started on? */
const stillOn = (slug: string) => slugFromUrl(location.href) === slug;

/**
 * Poll until the top card has rendered enough to be worth storing. Returns the
 * last scrape on timeout — an empty one is harmless, since an unchanged scrape
 * writes nothing. Returns null if the user navigated away.
 */
async function waitForRender(slug: string) {
  const deadline = Date.now() + RENDER_TIMEOUT_MS;
  for (;;) {
    if (!stillOn(slug)) return null;
    const scraped = parseProfile(document, location.href);
    if (scraped && (scraped.headline || scraped.company || scraped.location)) return scraped;
    if (Date.now() >= deadline) return scraped;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/**
 * Re-scrape a profile we already hold and store anything that moved. Notes and
 * tags are untouched, and an unchanged scrape writes nothing at all. Never
 * saves a profile that was not already saved — that stays a deliberate click.
 */
async function autoUpdate(slug: string) {
  try {
    const scraped = await waitForRender(slug);
    if (!scraped) return;
    const { changed } = await send({ type: 'saveProfile', scraped });
    if (!changed || !stillOn(slug)) return;
    setState('saved', UPDATED_LABEL);
    setTimeout(() => {
      if (stillOn(slug)) setState('saved', SAVED_LABEL);
    }, FLASH_MS);
  } catch (e) {
    // A refresh failing is not worth disturbing the pill over.
    console.error('[LinkedIn Archive]', e);
  }
}

async function refresh() {
  const slug = slugFromUrl(location.href);
  if (!slug) {
    host?.remove();
    host = null;
    button = null;
    return;
  }
  try {
    const { saved } = await send({ type: 'isSaved', slug });
    setState(saved ? 'saved' : 'save', saved ? SAVED_LABEL : SAVE_LABEL);
    if (saved) void autoUpdate(slug);
  } catch (e) {
    console.error('[LinkedIn Archive]', e);
  }
}

// ponytail: 1s poll for LinkedIn's client-side navigation. Swap for the
// Navigation API if it turns out to be exposed to isolated worlds.
let lastHref = '';
setInterval(() => {
  if (location.href === lastHref) return;
  lastHref = location.href;
  void refresh();
}, 1000);

void refresh();
