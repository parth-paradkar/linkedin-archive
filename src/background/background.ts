import type { Msg, Res } from '../lib/messages';
import { getProfile, saveScraped } from '../lib/storage';

/** Read the viewer path from the manifest so the build's output path never has to be guessed. */
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
    case 'isSaved':
      return { saved: (await getProfile(msg.slug)) !== undefined };
    case 'saveProfile':
      return await saveScraped(msg.scraped);
    case 'openViewer':
      await openViewer(msg.slug);
      return { ok: true };
  }
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse, (e: unknown) => sendResponse({ error: String(e) }));
  return true; // keep the channel open for the async response
});

chrome.action.onClicked.addListener(() => {
  void openViewer();
});
