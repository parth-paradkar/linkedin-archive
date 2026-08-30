import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set at build time.');
}

/**
 * The service worker has no localStorage, so the session lives in
 * chrome.storage.local. Only the worker constructs a client: one owner means
 * one session and no two clients racing to refresh the same token.
 */
const chromeStorage = {
  getItem: async (key: string): Promise<string | null> =>
    ((await chrome.storage.local.get(key))[key] as string | undefined) ?? null,
  setItem: async (key: string, value: string): Promise<void> => {
    await chrome.storage.local.set({ [key]: value });
  },
  removeItem: async (key: string): Promise<void> => {
    await chrome.storage.local.remove(key);
  },
};

export const supabase: SupabaseClient = createClient(URL, ANON, {
  auth: {
    storage: chromeStorage,
    persistSession: true,
    autoRefreshToken: true,
    // There is no redirect to read a session from: the extension signs in with
    // the emailed code, not the link.
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
});

export async function currentEmail(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.email ?? null;
}
