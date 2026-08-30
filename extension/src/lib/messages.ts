import type { ScrapedProfile } from '@archive/shared';

/**
 * The content script and the popup never touch Supabase directly; they ask the
 * service worker, which owns the only client and the only session. Browsing,
 * notes and tags now live in the web app, so the extension only saves and
 * checks auth.
 */
export type Msg =
  | { type: 'authState' }
  | { type: 'signIn'; email: string }
  | { type: 'verifyCode'; email: string; code: string }
  | { type: 'signOut' }
  | { type: 'isSaved'; slug: string }
  | { type: 'saveProfile'; scraped: ScrapedProfile }
  | { type: 'openProfile'; slug: string };

export type Res = {
  authState: { email: string | null };
  signIn: { ok: true };
  verifyCode: { email: string };
  signOut: { ok: true };
  isSaved: { saved: boolean; signedIn: boolean };
  saveProfile: { changed: boolean };
  openProfile: { ok: true };
};

/** Rejects if the worker reported an error, so callers can use try/catch. */
export async function send<K extends Msg['type']>(msg: Extract<Msg, { type: K }>): Promise<Res[K]> {
  const res = (await chrome.runtime.sendMessage(msg)) as Res[K] | { error: string };
  if (res && typeof res === 'object' && 'error' in res) throw new Error(res.error);
  return res as Res[K];
}
