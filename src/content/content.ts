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
    setState('saved', 'Saved ✓ · Open note');
  } catch (e) {
    setState('error', 'Save failed — retry');
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
    setState(saved ? 'saved' : 'save', saved ? 'Saved ✓ · Open note' : 'Save to Archive');
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
