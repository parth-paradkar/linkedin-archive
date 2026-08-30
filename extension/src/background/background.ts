import type { Msg, Res } from '../lib/messages';
import { currentEmail, supabase } from '../lib/supabase';
import * as store from '../lib/storage';

/** Read the viewer path from the manifest rather than guessing the build output. */
function viewerUrl(slug?: string): string {
  const page = chrome.runtime.getManifest().options_ui?.page;
  if (!page) throw new Error('viewer page missing from manifest');
  return chrome.runtime.getURL(page) + (slug ? `#${encodeURIComponent(slug)}` : '');
}

async function openViewer(slug?: string): Promise<void> {
  await chrome.tabs.create({ url: viewerUrl(slug) });
}

async function handle(msg: Msg): Promise<Res[Msg['type']]> {
  switch (msg.type) {
    case 'authState':
      return { email: await currentEmail() };

    case 'signIn': {
      // No emailRedirectTo: the extension signs in with the code, not the link.
      const { error } = await supabase.auth.signInWithOtp({ email: msg.email });
      if (error) throw error;
      return { ok: true };
    }

    case 'verifyCode': {
      const { data, error } = await supabase.auth.verifyOtp({
        email: msg.email,
        token: msg.code,
        type: 'email',
      });
      if (error) throw error;
      return { email: data.user?.email ?? msg.email };
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

    case 'openViewer':
      await openViewer(msg.slug);
      return { ok: true };

    case 'listProfiles':
      return { profiles: await store.listProfiles() };

    case 'getProfile':
      return await store.getProfile(msg.slug);

    case 'addNote':
      await store.addNote(msg.slug, msg.body);
      return { ok: true };

    case 'deleteNote':
      await store.deleteNote(msg.id);
      return { ok: true };

    case 'addTag':
      return { tags: await store.addTag(msg.slug, msg.tag) };

    case 'removeTag':
      return { tags: await store.removeTag(msg.slug, msg.tag) };

    case 'deleteProfile':
      await store.deleteProfile(msg.slug);
      return { ok: true };
  }
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse, (e: unknown) =>
    sendResponse({ error: e instanceof Error ? e.message : String(e) }),
  );
  return true; // keep the channel open for the async response
});

chrome.action.onClicked.addListener(() => {
  void openViewer();
});
