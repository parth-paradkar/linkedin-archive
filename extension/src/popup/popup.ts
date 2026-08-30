import './popup.css';
import { send } from '../lib/messages';

const WEB_URL = import.meta.env.VITE_WEB_URL;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const els = {
  signedOut: $('signed-out'),
  signedIn: $('signed-in'),
  email: $<HTMLInputElement>('email'),
  code: $<HTMLInputElement>('code'),
  verify: $<HTMLButtonElement>('verify'),
  status: $('status'),
  who: $('who'),
  signout: $<HTMLButtonElement>('signout'),
};

for (const id of ['web-link', 'web-link-2']) {
  const a = document.getElementById(id) as HTMLAnchorElement | null;
  if (a) a.href = `${WEB_URL}/connect`;
}

function show(email: string | null) {
  els.signedOut.hidden = email !== null;
  els.signedIn.hidden = email === null;
  if (email) els.who.textContent = email;
}

els.verify.addEventListener('click', async () => {
  const email = els.email.value.trim();
  const code = els.code.value.trim();
  if (!email || !code) return;
  els.verify.disabled = true;
  els.status.textContent = 'Signing in…';
  try {
    const res = await send({ type: 'verifyCode', email, code });
    show(res.email);
  } catch (e) {
    els.status.textContent = e instanceof Error ? e.message : String(e);
  } finally {
    els.verify.disabled = false;
  }
});

els.signout.addEventListener('click', async () => {
  await send({ type: 'signOut' });
  show(null);
});

void (async () => {
  const { email } = await send({ type: 'authState' });
  show(email);
})();
