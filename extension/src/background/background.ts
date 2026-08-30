import type { Msg, Res } from '../lib/messages';
import { currentEmail, supabase } from '../lib/supabase';
import * as store from '../lib/storage';

const WEB_URL = import.meta.env.VITE_WEB_URL;

/** Open the web app on a specific profile (the sidebar picks up ?profile=). */
async function openProfile(slug: string): Promise<void> {
  await chrome.tabs.create({ url: `${WEB_URL}/?profile=${encodeURIComponent(slug)}` });
}

async function handle(msg: Msg): Promise<Res[Msg['type']]> {
  switch (msg.type) {
    case 'authState':
      return { email: await currentEmail() };

    case 'signIn': {
      // No emailRedirectTo: the extension signs in with the code from the web
      // app's Connect page, not a link.
      const { error } = await supabase.auth.signInWithOtp({ email: msg.email });
      if (error) throw error;
      return { ok: true };
    }

    case 'verifyCode': {
      const email = msg.email.trim();
      const token = msg.code.trim();
      // A code from signInWithOtp verifies as 'email'; one minted by the web
      // app's generateLink verifies as 'magiclink'. Try the common case first.
      let res = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (res.error) {
        res = await supabase.auth.verifyOtp({ email, token, type: 'magiclink' });
      }
      if (res.error) throw res.error;
      return { email: res.data.user?.email ?? email };
    }

    case 'signOut':
      await supabase.auth.signOut();
      return { ok: true };

    case 'isSaved': {
      const email = await currentEmail();
      if (!email) return { saved: false, signedIn: false };
      return { saved: await store.isSaved(msg.slug), signedIn: true };
    }

    case 'saveProfile':
      return { changed: await store.saveScraped(msg.scraped) };

    case 'openProfile':
      await openProfile(msg.slug);
      return { ok: true };
  }
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse, (e: unknown) =>
    sendResponse({ error: e instanceof Error ? e.message : String(e) }),
  );
  return true; // keep the channel open for the async response
});
