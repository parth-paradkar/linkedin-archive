import type { Profile, ScrapedProfile } from './types';

export type Msg =
  | { type: 'isSaved'; slug: string }
  | { type: 'saveProfile'; scraped: ScrapedProfile }
  | { type: 'openViewer'; slug?: string };

export type Res = {
  isSaved: { saved: boolean };
  saveProfile: { profile: Profile; changed: boolean };
  openViewer: { ok: true };
};

/** Rejects if the worker reported an error, so callers can use try/catch. */
export async function send<K extends Msg['type']>(msg: Extract<Msg, { type: K }>): Promise<Res[K]> {
  const res = (await chrome.runtime.sendMessage(msg)) as Res[K] | { error: string };
  if (res && typeof res === 'object' && 'error' in res) throw new Error(res.error);
  return res as Res[K];
}
